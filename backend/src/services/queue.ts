import { query } from '../db/index.js';
import { uploadImage, generateFilename } from './cos.js';

interface Task {
  id: number;
  user_id: number;
  model_id: number;
  prompt: string;
  image_size: string;
  image_count: number;
  status: string;
  priority: number;
  credits_charged: number;
  credits_type: string;
  retry_count: number;
  reference_images?: string;
  started_at?: string;
}

interface ExtraConfig {
  quality?: string;        // OpenAI: low/medium/high
  mj_mode?: string;        // Midjourney: fast/relax/turbo
  mj_version?: string;     // Midjourney: v5/v6
  // GRS 格式
  reply_type?: string;     // GRS: json/async
  aspect_ratio?: string;   // GRS: "1:1" 或 "1024x1024"
  image_size_grs?: string; // GRS: 1K/2K/4K
  // 云雾 MJ 格式
  bot_type?: string;       // 云雾MJ: MID_JOURNEY/NIJI_JOURNEY
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_API_TIMEOUT_MS = 120000;
const MJ_POLL_INTERVAL_MS = 5000;  // Midjourney 轮询间隔
const MJ_MAX_POLL_TIME_MS = 300000; // Midjourney 最大轮询时间 5分钟

// 尺寸转换：将 "1024x1024" 格式转换为比例格式
function sizeToRatio(size: string): string {
  const match = size.match(/^(\d+)x(\d+)$/i);
  if (!match) return '1:1';
  const w = parseInt(match[1]);
  const h = parseInt(match[2]);
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
  const d = gcd(w, h);
  return `${w / d}:${h / d}`;
}

// 从尺寸提取宽度
function sizeToWidth(size: string): number {
  const match = size.match(/^(\d+)x(\d+)$/i);
  return match ? parseInt(match[1]) : 1024;
}

class TaskQueue {
  private processing = false;
  private activeCount = 0;
  private maxGlobalConcurrent = 50; // 全局安全上限，实际由模型级 max_concurrent 控制

  addTask(task: Task) {
    console.log(`[队列] 任务 #${task.id} 已加入队列 (优先级: ${task.priority}, 模型: ${task.model_id})`);
    this.processQueue();
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.activeCount < this.maxGlobalConcurrent) {
      const nextTask = this.getNextTask();
      if (!nextTask) break;

      this.activeCount++;
      console.log(`[队列] 开始执行任务 #${nextTask.id} | 全局并发: ${this.activeCount}/${this.maxGlobalConcurrent}`);
      this.executeTask(nextTask).finally(() => {
        this.activeCount--;
        this.processQueue();
      });
    }

    this.processing = false;
  }

  private getNextTask(): Task | null {
    // 查询所有有排队任务的模型及其当前并发状态
    const modelStatusResult = query(
      `SELECT m.id, m.name, m.max_concurrent,
        (SELECT COUNT(*) FROM generation_tasks t2 WHERE t2.model_id = m.id AND t2.status = 'processing') as active_count
       FROM models m
       WHERE m.is_active = 1
       AND EXISTS (SELECT 1 FROM generation_tasks t3 WHERE t3.model_id = m.id AND t3.status = 'queued')`
    );

    // 找出有可用并发槽位的模型ID列表
    const availableModelIds: number[] = [];
    for (const ms of modelStatusResult.rows) {
      const active = ms.active_count || 0;
      const max = ms.max_concurrent || 5;
      if (active < max) {
        availableModelIds.push(ms.id);
        if (active > 0) {
          console.log(`[队列] 模型 "${ms.name}" 并发: ${active}/${max} (可用)`);
        }
      } else {
        console.log(`[队列] 模型 "${ms.name}" 并发已满: ${active}/${max} (跳过)`);
      }
    }

    if (availableModelIds.length === 0) {
      return null;
    }

    // 从有可用槽位的模型中，按优先级选取下一个任务
    const placeholders = availableModelIds.map(() => '?').join(',');
    const result = query(
      `SELECT t.* FROM generation_tasks t
       JOIN models m ON t.model_id = m.id
       WHERE t.status = 'queued'
       AND m.is_active = 1
       AND t.model_id IN (${placeholders})
       ORDER BY t.priority DESC, t.created_at ASC
       LIMIT 1`,
      availableModelIds
    );
    return result.rows[0] || null;
  }

  private async executeTask(task: Task) {
    const startTime = Date.now()
    const modelResult = query('SELECT * FROM models WHERE id = ?', [task.model_id]);
    const model = modelResult.rows[0];
    const maxRetries = model?.max_retries ?? DEFAULT_MAX_RETRIES;
    const apiTimeoutMs = (model?.api_timeout || 120) * 1000;
    const taskTimeoutMs = (model?.task_timeout || 0) * 1000; // 0 表示不限制

    // 计算当前是第几次调用
    const callCountResult = query('SELECT COUNT(*) as count FROM api_call_logs WHERE task_id = ?', [task.id]);
    const callIndex = (callCountResult.rows[0]?.count || 0) + 1;

    // 检查任务总超时
    if (taskTimeoutMs > 0 && task.started_at) {
      const taskElapsed = Date.now() - new Date(task.started_at).getTime();
      if (taskElapsed >= taskTimeoutMs) {
        const errorMsg = `任务总超时(已等待 ${taskElapsed / 1000}秒，限制 ${taskTimeoutMs / 1000}秒)`;
        query(
          "UPDATE generation_tasks SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
          [errorMsg, task.id]
        );
        // 退还积分
        if (task.credits_type === 'project') {
          query('UPDATE users SET project_credits = project_credits + ? WHERE id = ?', [task.credits_charged, task.user_id]);
        } else {
          query('UPDATE users SET creative_credits = creative_credits + ? WHERE id = ?', [task.credits_charged, task.user_id]);
        }
        console.log(`[队列] 任务 #${task.id} 任务总超时: ${errorMsg}`);
        return;
      }
    }

    // 记录本次调用
    const callLogResult = query(
      'INSERT INTO api_call_logs (task_id, call_index, status, request_params, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [task.id, callIndex, 'pending', JSON.stringify({ model: model?.name, prompt: task.prompt?.slice(0, 200), size: task.image_size, format: model?.api_format || 'openai' })]
    );
    const callLogId = callLogResult.lastInsertRowid;

    try {
      query(
        "UPDATE generation_tasks SET status = 'processing', started_at = COALESCE(started_at, CURRENT_TIMESTAMP) WHERE id = ?",
        [task.id]
      );

      if (!model || !model.api_endpoint) {
        throw new Error('模型API未配置');
      }

      const imageUrls = await this.callImageAPI(model, task);
      const elapsed = Date.now() - startTime;

      // 更新调用记录为成功
      query(
        "UPDATE api_call_logs SET status = 'success', response_summary = ?, elapsed_ms = ? WHERE id = ?",
        [JSON.stringify({ imageCount: imageUrls.length }), elapsed, callLogId]
      );

      query(
        "UPDATE generation_tasks SET status = 'completed', result_images = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [JSON.stringify(imageUrls), task.id]
      );

      console.log(`[队列] 任务 #${task.id} 完成，生成 ${imageUrls.length} 张图片，耗时 ${(elapsed / 1000).toFixed(1)}秒`);
    } catch (err) {
      const rawMessage = (err as Error).message;
      const elapsed = Date.now() - startTime;
      const currentRetry = task.retry_count || 0;
      const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

      const isTimeout = rawMessage.includes('超时') || rawMessage.includes('timeout') || rawMessage.includes('aborted');
      const errorType = isTimeout ? '请求超时' : '请求失败';
      const errorMessage = `[${errorType}] ${rawMessage} | 耗时: ${(elapsed / 1000).toFixed(1)}秒 | 时间: ${timestamp}`;

      // 更新调用记录为失败
      query(
        "UPDATE api_call_logs SET status = 'failed', error_message = ?, elapsed_ms = ? WHERE id = ?",
        [errorMessage, elapsed, callLogId]
      );

      // 追加重试错误到 retry_errors
      const existingErrors: string[] = (() => {
        try {
          const taskRow = query('SELECT retry_errors FROM generation_tasks WHERE id = ?', [task.id]);
          return JSON.parse(taskRow.rows[0]?.retry_errors || '[]');
        } catch { return []; }
      })();
      existingErrors.push(errorMessage);
      const retryErrorsJson = JSON.stringify(existingErrors);

      if (currentRetry < maxRetries) {
        const newRetryCount = currentRetry + 1;
        query(
          "UPDATE generation_tasks SET status = 'queued', error_message = ?, retry_count = ?, retry_errors = ? WHERE id = ?",
          [errorMessage, newRetryCount, retryErrorsJson, task.id]
        );
        console.log(`[队列] 任务 #${task.id} ${errorType} (重试 ${newRetryCount}/${maxRetries}): ${rawMessage}，耗时 ${(elapsed / 1000).toFixed(1)}秒`);
      } else {
        const finalError = `${errorMessage} | 已重试${maxRetries}次均失败`;
        query(
          "UPDATE generation_tasks SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP, retry_errors = ? WHERE id = ?",
          [finalError, retryErrorsJson, task.id]
        );
        if (task.credits_type === 'project') {
          query(
            'UPDATE users SET project_credits = project_credits + ? WHERE id = ?',
            [task.credits_charged, task.user_id]
          );
        } else {
          query(
            'UPDATE users SET creative_credits = creative_credits + ? WHERE id = ?',
            [task.credits_charged, task.user_id]
          );
        }
        const creditsTypeName = task.credits_type === 'project' ? '项目' : '创作';
        console.log(`[队列] 任务 #${task.id} 最终失败 (${errorType}，已重试${maxRetries}次): ${rawMessage}，耗时 ${(elapsed / 1000).toFixed(1)}秒，已退还 ${task.credits_charged} ${creditsTypeName}积分`);
      }
    }
  }

  private resolveEndpoint(apiEndpoint: string, hasReferenceImages: boolean): string {
    let url = apiEndpoint.replace(/\/+$/, '')
    // 图改图使用 /v1/images/edits
    if (hasReferenceImages) {
      if (url.includes('/images/edits')) return url
      if (url.includes('/images/generations')) {
        url = url.replace('/images/generations', '/images/edits')
        return url
      }
      if (url.endsWith('/v1')) {
        url += '/images/edits'
      } else if (!url.includes('/v1/')) {
        url += '/v1/images/edits'
      }
      return url
    }
    // 文生图使用 /v1/images/generations
    if (!url.includes('/images/generations') && !url.includes('/v1/chat/completions') && !url.includes('/v1/responses') && !url.includes('/images/edits')) {
      if (url.endsWith('/v1')) {
        url += '/images/generations'
      } else if (!url.includes('/v1/')) {
        url += '/v1/images/generations'
      }
    }
    return url
  }

  private async callImageAPI(model: any, task: Task): Promise<string[]> {
    const apiFormat = model.api_format || 'openai';
    const extraConfig: ExtraConfig = (() => {
      try {
        return JSON.parse(model.extra_config || '{}');
      } catch { return {}; }
    })();

    console.log(`[API] 使用 ${apiFormat} 格式调用 | model=${model.name}`);

    switch (apiFormat) {
      case 'gemini':
        return this.callGeminiAPI(model, task, extraConfig);
      case 'midjourney':
        return this.callMidjourneyAPI(model, task, extraConfig);
      case 'grs':
        return this.callGRSAPI(model, task, extraConfig);
      case 'yunwu_mj':
        return this.callYunwuMJAPI(model, task, extraConfig);
      default:
        return this.callOpenAIAPI(model, task, extraConfig);
    }
  }

  // OpenAI GPT Image 格式
  private async callOpenAIAPI(model: any, task: Task, extraConfig: ExtraConfig): Promise<string[]> {
    const imageUrls: string[] = [];
    const hasReferenceImages = !!task.reference_images && (() => {
      try {
        const refs = JSON.parse(task.reference_images);
        return Array.isArray(refs) && refs.length > 0;
      } catch { return false; }
    })();
    const endpoint = this.resolveEndpoint(model.api_endpoint, hasReferenceImages);

    for (let i = 0; i < task.image_count; i++) {
      console.log(`[OpenAI] 请求 ${endpoint} | model=${model.name} | size=${task.image_size} | quality=${extraConfig.quality || 'default'} | 超时=${model.api_timeout || 120}秒`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), (model.api_timeout || 120) * 1000);

      const requestBody: Record<string, unknown> = {
        model: model.name,
        prompt: task.prompt,
        size: task.image_size,
        n: 1,
      };

      // 添加 quality 参数
      if (extraConfig.quality) {
        requestBody.quality = extraConfig.quality;
      }

      // 添加参考图
      if (task.reference_images) {
        try {
          const refImages = JSON.parse(task.reference_images);
          if (Array.isArray(refImages) && refImages.length > 0) {
            const fieldName = model.reference_image_field || 'image_url';
            requestBody[fieldName] = refImages.length === 1 ? refImages[0] : refImages;
            console.log(`[OpenAI] 参考图: ${fieldName}=${JSON.stringify(refImages)}`);
          }
        } catch {}
      }

      const response = await this.fetchWithAuth(endpoint, model.api_key_encrypted, requestBody, controller, (model.api_timeout || 120) * 1000);
      clearTimeout(timeoutId);

      const data = await this.parseResponse(response, endpoint);
      const imageUrl = await this.extractImageUrl(data, task.id, i);
      imageUrls.push(imageUrl);
    }

    return imageUrls;
  }

  // Gemini Nano Banana 简化格式
  private async callGeminiAPI(model: any, task: Task, extraConfig: ExtraConfig): Promise<string[]> {
    const imageUrls: string[] = [];
    let endpoint = model.api_endpoint.replace(/\/+$/, '');

    // Gemini 简化格式端点通常是 /v1/images/generate
    if (!endpoint.includes('/images/generate') && !endpoint.includes('/v1beta')) {
      if (endpoint.endsWith('/v1')) {
        endpoint += '/images/generate';
      } else if (!endpoint.includes('/v1/')) {
        endpoint += '/v1/images/generate';
      }
    }

    const imageSize = sizeToRatio(task.image_size);

    for (let i = 0; i < task.image_count; i++) {
      console.log(`[Gemini] 请求 ${endpoint} | model=${model.name} | image_size=${imageSize} | 超时=${model.api_timeout || 120}秒`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), (model.api_timeout || 120) * 1000);

      const requestBody: Record<string, unknown> = {
        prompt: task.prompt,
        model: model.name,
        image_size: imageSize,
        num: 1,
      };

      // 添加参考图（Gemini 格式）
      if (task.reference_images) {
        try {
          const refImages = JSON.parse(task.reference_images);
          if (Array.isArray(refImages) && refImages.length > 0) {
            requestBody.reference_images = refImages;
            console.log(`[Gemini] 参考图: ${JSON.stringify(refImages)}`);
          }
        } catch {}
      }

      const response = await this.fetchWithAuth(endpoint, model.api_key_encrypted, requestBody, controller, (model.api_timeout || 120) * 1000);
      clearTimeout(timeoutId);

      const data = await this.parseResponse(response, endpoint);

      // Gemini 响应格式: { data: { url } } 或 { data: { url: [...] } }
      let imageUrl: string;
      if (data.data?.url) {
        if (Array.isArray(data.data.url)) {
          imageUrl = await this.downloadAndUpload(data.data.url[0], task.id, i);
        } else {
          imageUrl = await this.downloadAndUpload(data.data.url, task.id, i);
        }
      } else if (data.data?.[0]?.url) {
        imageUrl = await this.downloadAndUpload(data.data[0].url, task.id, i);
      } else {
        // 尝试其他格式
        imageUrl = await this.extractImageUrl(data, task.id, i);
      }
      imageUrls.push(imageUrl);
    }

    return imageUrls;
  }

  // Midjourney 格式（异步 + 轮询）
  private async callMidjourneyAPI(model: any, task: Task, extraConfig: ExtraConfig): Promise<string[]> {
    const imageUrls: string[] = [];
    let submitEndpoint = model.api_endpoint.replace(/\/+$/, '');

    // Midjourney 提交端点通常是 /mj/submit/imagine 或 /midjourney/imagine
    if (!submitEndpoint.includes('/mj/') && !submitEndpoint.includes('/midjourney/')) {
      if (submitEndpoint.endsWith('/v1')) {
        submitEndpoint = submitEndpoint.replace('/v1', '/mj/submit/imagine');
      } else {
        submitEndpoint += '/mj/submit/imagine';
      }
    }

    // 构建 prompt，添加 --ar 参数
    const ratio = sizeToRatio(task.image_size);
    let mjPrompt = task.prompt;
    if (!mjPrompt.includes('--ar')) {
      mjPrompt += ` --ar ${ratio}`;
    }
    if (extraConfig.mj_version && !mjPrompt.includes('--v')) {
      mjPrompt += ` --v ${extraConfig.mj_version}`;
    }

    const mjMode = extraConfig.mj_mode || 'fast';

    for (let i = 0; i < task.image_count; i++) {
      console.log(`[MJ] 提交任务 ${submitEndpoint} | prompt=${mjPrompt.slice(0, 50)}... | mode=${mjMode}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), (model.api_timeout || 120) * 1000);

      const requestBody: Record<string, unknown> = {
        prompt: mjPrompt,
        mode: mjMode,
      };

      // 添加参考图（Midjourney 格式：base64Array）
      if (task.reference_images) {
        try {
          const refImages = JSON.parse(task.reference_images);
          if (Array.isArray(refImages) && refImages.length > 0) {
            requestBody.base64Array = refImages;
            console.log(`[MJ] 参考图: ${refImages.length} 张`);
          }
        } catch {}
      }

      const response = await this.fetchWithAuth(submitEndpoint, model.api_key_encrypted, requestBody, controller, (model.api_timeout || 120) * 1000);
      clearTimeout(timeoutId);

      const submitData = await this.parseResponse(response, submitEndpoint);

      // 获取 taskId
      const taskId = submitData.taskId || submitData.task_id || submitData.data?.taskId;
      if (!taskId) {
        // 可能是同步返回（某些中转站）
        if (submitData.imageUrl || submitData.image_url || submitData.data?.url) {
          const imageUrl = submitData.imageUrl || submitData.image_url || submitData.data.url;
          imageUrls.push(await this.downloadAndUpload(imageUrl, task.id, i));
          continue;
        }
        throw new Error('Midjourney 未返回 taskId');
      }

      console.log(`[MJ] 任务已提交 | taskId=${taskId} | 开始轮询...`);

      // 轮询获取结果
      const imageUrl = await this.pollMidjourneyResult(model.api_endpoint, model.api_key_encrypted, taskId, task.id, i);
      imageUrls.push(imageUrl);
    }

    return imageUrls;
  }

  // 轮询 Midjourney 结果
  private async pollMidjourneyResult(
    apiEndpoint: string,
    apiKey: string,
    taskId: string,
    taskIdNum: number,
    imageIndex: number
  ): Promise<string> {
    let pollEndpoint = apiEndpoint.replace(/\/+$/, '');

    // 构建轮询端点：将 /mj/submit/... 替换为 /mj/task
    if (pollEndpoint.includes('/mj/submit')) {
      pollEndpoint = pollEndpoint.replace(/\/mj\/submit.*/, '/mj/task');
    } else if (!pollEndpoint.includes('/mj/task')) {
      pollEndpoint += '/mj/task';
    }

    if (!pollEndpoint.includes(taskId)) {
      pollEndpoint += `/${taskId}/fetch`;
    }

    const startTime = Date.now();

    while (Date.now() - startTime < MJ_MAX_POLL_TIME_MS) {
      await new Promise(resolve => setTimeout(resolve, MJ_POLL_INTERVAL_MS));

      console.log(`[MJ] 轮询 ${pollEndpoint} | taskId=${taskId} | 已等待 ${((Date.now() - startTime) / 1000).toFixed(0)}秒`);

      try {
        const response = await fetch(pollEndpoint, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) {
          console.warn(`[MJ] 轮询失败: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const status = data.status || data.data?.status;
        const progress = data.progress || data.data?.progress || 0;

        console.log(`[MJ] 状态: ${status} | 进度: ${progress}%`);

        if (status === 'SUCCESS' || status === 'success' || progress === 100) {
          const imageUrl = data.imageUrl || data.image_url || data.data?.imageUrl || data.data?.url;
          if (imageUrl) {
            return await this.downloadAndUpload(imageUrl, taskIdNum, imageIndex);
          }
        }

        if (status === 'FAILURE' || status === 'failure' || status === 'FAILED') {
          const error = data.error || data.data?.error || 'Midjourney 任务失败';
          throw new Error(`Midjourney 任务失败: ${error}`);
        }
      } catch (err) {
        if ((err as Error).message.includes('Midjourney 任务失败')) {
          throw err;
        }
        console.warn(`[MJ] 轮询异常: ${(err as Error).message}`);
      }
    }

    throw new Error(`Midjourney 任务超时(已等待 ${MJ_MAX_POLL_TIME_MS / 1000} 秒)`);
  }

  // GRS 中转站统一格式（nano-banana / gpt-image-2 等）
  private async callGRSAPI(model: any, task: Task, extraConfig: ExtraConfig): Promise<string[]> {
    const imageUrls: string[] = [];
    let endpoint = model.api_endpoint.replace(/\/+$/, '');

    // GRS 端点通常是 /v1/api/generate
    if (!endpoint.includes('/api/generate')) {
      if (endpoint.endsWith('/v1')) {
        endpoint += '/api/generate';
      } else if (endpoint.endsWith('/v1/api')) {
        endpoint += '/generate';
      } else if (!endpoint.includes('/v1/')) {
        endpoint += '/v1/api/generate';
      }
    }

    const replyType = extraConfig.reply_type || 'json';
    const aspectRatio = extraConfig.aspect_ratio || sizeToRatio(task.image_size);

    for (let i = 0; i < task.image_count; i++) {
      console.log(`[GRS] 请求 ${endpoint} | model=${model.name} | aspectRatio=${aspectRatio} | replyType=${replyType} | 超时=${model.api_timeout || 120}秒`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), (model.api_timeout || 120) * 1000);

      const requestBody: Record<string, unknown> = {
        model: model.name,
        prompt: task.prompt,
        aspectRatio: aspectRatio,
        replyType: replyType,
      };

      // 添加 imageSize（nano-banana 支持 1K/2K/4K）
      if (extraConfig.image_size_grs) {
        requestBody.imageSize = extraConfig.image_size_grs;
      }

      // 添加参考图
      if (task.reference_images) {
        try {
          const refImages = JSON.parse(task.reference_images);
          if (Array.isArray(refImages) && refImages.length > 0) {
            requestBody.images = refImages;
            console.log(`[GRS] 参考图: ${refImages.length} 张`);
          }
        } catch {}
      }

      const response = await this.fetchWithAuth(endpoint, model.api_key_encrypted, requestBody, controller, (model.api_timeout || 120) * 1000);
      clearTimeout(timeoutId);

      const data = await this.parseResponse(response, endpoint);

      // 同步模式：检查是否直接返回了结果
      if (data.status === 'succeeded') {
        const results = data.results || data.data?.results;
        if (results && Array.isArray(results) && results.length > 0) {
          const imageUrl = results[0].url || results[0];
          imageUrls.push(await this.downloadAndUpload(imageUrl, task.id, i));
        } else if (data.url) {
          imageUrls.push(await this.downloadAndUpload(data.url, task.id, i));
        } else {
          // 尝试通用解析
          imageUrls.push(await this.extractImageUrl(data, task.id, i));
        }
      }
      // 异步模式：需要轮询
      else if (data.id && (data.status === 'running' || data.status === 'pending' || replyType === 'async')) {
        const grsTaskId = data.id;
        console.log(`[GRS] 异步任务已提交 | taskId=${grsTaskId} | 开始轮询...`);
        const imageUrl = await this.pollGRSResult(model.api_endpoint, model.api_key_encrypted, grsTaskId, task.id, i);
        imageUrls.push(imageUrl);
      }
      // 其他情况：尝试通用解析
      else {
        imageUrls.push(await this.extractImageUrl(data, task.id, i));
      }
    }

    return imageUrls;
  }

  // 轮询 GRS 异步结果
  private async pollGRSResult(
    apiEndpoint: string,
    apiKey: string,
    taskId: string,
    taskIdNum: number,
    imageIndex: number
  ): Promise<string> {
    let pollEndpoint = apiEndpoint.replace(/\/+$/, '');

    // GRS 轮询端点: GET {base}/v1/api/result?id={taskId}
    if (pollEndpoint.includes('/api/generate')) {
      pollEndpoint = pollEndpoint.replace('/api/generate', '/api/result');
    } else if (pollEndpoint.includes('/v1/api')) {
      pollEndpoint = pollEndpoint.replace('/v1/api', '/v1/api/result');
    } else if (pollEndpoint.endsWith('/v1')) {
      pollEndpoint += '/api/result';
    } else {
      pollEndpoint += '/v1/api/result';
    }

    const separator = pollEndpoint.includes('?') ? '&' : '?';
    const fullPollUrl = `${pollEndpoint}${separator}id=${taskId}`;

    const startTime = Date.now();

    while (Date.now() - startTime < MJ_MAX_POLL_TIME_MS) {
      await new Promise(resolve => setTimeout(resolve, MJ_POLL_INTERVAL_MS));

      console.log(`[GRS] 轮询 ${fullPollUrl} | taskId=${taskId} | 已等待 ${((Date.now() - startTime) / 1000).toFixed(0)}秒`);

      try {
        const response = await fetch(fullPollUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) {
          console.warn(`[GRS] 轮询失败: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const status = data.status;
        const progress = data.progress || 0;

        console.log(`[GRS] 状态: ${status} | 进度: ${progress}%`);

        if (status === 'succeeded') {
          const results = data.results;
          if (results && Array.isArray(results) && results.length > 0) {
            const imageUrl = results[0].url || results[0];
            return await this.downloadAndUpload(imageUrl, taskIdNum, imageIndex);
          }
          throw new Error('GRS 任务成功但未返回图片URL');
        }

        if (status === 'failed') {
          const error = data.error || 'GRS 任务失败';
          throw new Error(`GRS 任务失败: ${error}`);
        }

        if (status === 'violation') {
          throw new Error('GRS 任务违规被拒绝');
        }
      } catch (err) {
        if ((err as Error).message.includes('GRS 任务')) {
          throw err;
        }
        console.warn(`[GRS] 轮询异常: ${(err as Error).message}`);
      }
    }

    throw new Error(`GRS 异步任务超时(已等待 ${MJ_MAX_POLL_TIME_MS / 1000} 秒)`);
  }

  // 云雾 Midjourney 格式
  private async callYunwuMJAPI(model: any, task: Task, extraConfig: ExtraConfig): Promise<string[]> {
    const imageUrls: string[] = [];
    let submitEndpoint = model.api_endpoint.replace(/\/+$/, '');

    // 云雾 MJ 提交端点: /mj/submit/imagine
    if (!submitEndpoint.includes('/mj/submit/imagine')) {
      if (submitEndpoint.includes('/mj/submit')) {
        submitEndpoint = submitEndpoint.replace(/\/mj\/submit.*/, '/mj/submit/imagine');
      } else if (submitEndpoint.endsWith('/v1')) {
        submitEndpoint = submitEndpoint.replace('/v1', '/mj/submit/imagine');
      } else {
        submitEndpoint += '/mj/submit/imagine';
      }
    }

    // 构建 prompt，添加 --ar 参数
    const ratio = sizeToRatio(task.image_size);
    let mjPrompt = task.prompt;
    if (!mjPrompt.includes('--ar')) {
      mjPrompt += ` --ar ${ratio}`;
    }
    if (extraConfig.mj_version && !mjPrompt.includes('--v')) {
      mjPrompt += ` --v ${extraConfig.mj_version}`;
    }

    const botType = extraConfig.bot_type || 'MID_JOURNEY';

    for (let i = 0; i < task.image_count; i++) {
      console.log(`[云雾MJ] 提交任务 ${submitEndpoint} | prompt=${mjPrompt.slice(0, 50)}... | botType=${botType}`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), (model.api_timeout || 120) * 1000);

      const requestBody: Record<string, unknown> = {
        prompt: mjPrompt,
        botType: botType,
        notifyHook: '',
      };

      // 添加参考图（云雾MJ: base64Array）
      if (task.reference_images) {
        try {
          const refImages = JSON.parse(task.reference_images);
          if (Array.isArray(refImages) && refImages.length > 0) {
            requestBody.base64Array = refImages;
            console.log(`[云雾MJ] 参考图: ${refImages.length} 张`);
          }
        } catch {}
      }

      const response = await this.fetchWithAuth(submitEndpoint, model.api_key_encrypted, requestBody, controller, (model.api_timeout || 120) * 1000);
      clearTimeout(timeoutId);

      const submitData = await this.parseResponse(response, submitEndpoint);

      // 云雾MJ提交响应: { code: 1, description: "Submit success", result: "taskId" }
      const taskId = submitData.result || submitData.taskId || submitData.task_id;
      if (!taskId) {
        // 可能是同步返回
        if (submitData.imageUrl || submitData.image_url) {
          const imageUrl = submitData.imageUrl || submitData.image_url;
          imageUrls.push(await this.downloadAndUpload(imageUrl, task.id, i));
          continue;
        }
        throw new Error(`云雾MJ未返回任务ID | 响应: ${JSON.stringify(submitData).slice(0, 300)}`);
      }

      console.log(`[云雾MJ] 任务已提交 | taskId=${taskId} | 开始轮询...`);

      // 轮询获取结果
      const imageUrl = await this.pollYunwuMJResult(model.api_endpoint, model.api_key_encrypted, taskId, task.id, i);
      imageUrls.push(imageUrl);
    }

    return imageUrls;
  }

  // 轮询云雾 MJ 结果
  private async pollYunwuMJResult(
    apiEndpoint: string,
    apiKey: string,
    taskId: string,
    taskIdNum: number,
    imageIndex: number
  ): Promise<string> {
    let pollEndpoint = apiEndpoint.replace(/\/+$/, '');

    // 云雾MJ轮询端点: GET {base}/mj/task/{taskId}/fetch
    if (pollEndpoint.includes('/mj/submit')) {
      pollEndpoint = pollEndpoint.replace(/\/mj\/submit.*/, '/mj/task');
    } else if (pollEndpoint.endsWith('/v1')) {
      pollEndpoint = pollEndpoint.replace('/v1', '/mj/task');
    } else if (!pollEndpoint.includes('/mj/task')) {
      pollEndpoint += '/mj/task';
    }

    // 确保端点包含 taskId
    if (!pollEndpoint.includes(taskId)) {
      pollEndpoint += `/${taskId}/fetch`;
    } else if (!pollEndpoint.endsWith('/fetch')) {
      pollEndpoint += '/fetch';
    }

    const startTime = Date.now();

    while (Date.now() - startTime < MJ_MAX_POLL_TIME_MS) {
      await new Promise(resolve => setTimeout(resolve, MJ_POLL_INTERVAL_MS));

      console.log(`[云雾MJ] 轮询 ${pollEndpoint} | taskId=${taskId} | 已等待 ${((Date.now() - startTime) / 1000).toFixed(0)}秒`);

      try {
        const response = await fetch(pollEndpoint, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
          },
        });

        if (!response.ok) {
          console.warn(`[云雾MJ] 轮询失败: ${response.status}`);
          continue;
        }

        const data = await response.json();
        const status = data.status;
        // 云雾MJ progress 是字符串 "100%"
        const progressStr = data.progress || '0%';
        const progressNum = parseInt(String(progressStr).replace('%', ''), 10) || 0;

        console.log(`[云雾MJ] 状态: ${status} | 进度: ${progressStr}`);

        if (status === 'SUCCESS') {
          const imageUrl = data.imageUrl || data.image_url;
          if (imageUrl) {
            return await this.downloadAndUpload(imageUrl, taskIdNum, imageIndex);
          }
          throw new Error('云雾MJ任务成功但未返回图片URL');
        }

        if (status === 'FAILURE' || status === 'FAILED') {
          const error = data.failReason || data.fail_reason || '云雾MJ任务失败';
          throw new Error(`云雾MJ任务失败: ${error}`);
        }
      } catch (err) {
        if ((err as Error).message.includes('云雾MJ任务')) {
          throw err;
        }
        console.warn(`[云雾MJ] 轮询异常: ${(err as Error).message}`);
      }
    }

    throw new Error(`云雾MJ任务超时(已等待 ${MJ_MAX_POLL_TIME_MS / 1000} 秒)`);
  }

  // 通用请求方法
  private async fetchWithAuth(
    endpoint: string,
    apiKey: string,
    body: Record<string, unknown>,
    controller: AbortController,
    timeoutMs?: number
  ): Promise<Response> {
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      return response;
    } catch (fetchErr) {
      if ((fetchErr as Error).name === 'AbortError') {
        const timeout = timeoutMs || DEFAULT_API_TIMEOUT_MS;
        throw new Error(`API请求超时(已等待${timeout / 1000}秒)，请检查API服务状态或稍后重试`);
      }
      throw new Error(`API请求网络错误: ${(fetchErr as Error).message}`);
    }
  }

  // 解析响应
  private async parseResponse(response: Response, endpoint: string): Promise<any> {
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      console.error(`[API] 请求失败: ${response.status} ${response.statusText} | URL: ${endpoint} | 响应: ${body.slice(0, 500)}`);
      throw new Error(`API请求失败: ${response.status} ${response.statusText} - ${body.slice(0, 200)}`);
    }

    const data = await response.json();

    if (data.error) {
      const apiError = typeof data.error === 'string'
        ? data.error
        : data.error.message || data.error.msg || data.error.type || JSON.stringify(data.error);
      const rawJson = JSON.stringify(data).slice(0, 800);
      console.error(`[API] 返回错误响应:`, rawJson);
      throw new Error(`API返回错误: ${apiError} | 原始响应: ${rawJson}`);
    }

    return data;
  }

  // 提取图片URL并上传
  private async extractImageUrl(data: any, taskId: number, imageIndex: number): Promise<string> {
    let imageData = data.data?.[0] || data.images?.[0] || data.output?.[0] || null;

    if (!imageData && Array.isArray(data.data) && data.data.length === 0) {
      console.error(`[API] 返回数据为空数组:`, JSON.stringify(data).slice(0, 500));
      throw new Error('API返回数据为空(data:[])');
    }

    if (!imageData && data.data) {
      imageData = data.data[0];
    }

    if (imageData) {
      const filename = generateFilename(taskId, imageIndex);

      if (imageData.b64_json) {
        const buffer = Buffer.from(imageData.b64_json, 'base64');
        return await uploadImage(buffer, filename);
      } else if (imageData.url) {
        return await this.downloadAndUpload(imageData.url, taskId, imageIndex);
      } else if (typeof imageData === 'string') {
        return await this.downloadAndUpload(imageData, taskId, imageIndex);
      } else {
        console.error(`[API] 图片数据格式无法识别:`, JSON.stringify(imageData).slice(0, 300));
        throw new Error(`API返回图片数据格式无法识别(含字段: ${Object.keys(imageData).join(',')})`);
      }
    } else {
      const rawJson = JSON.stringify(data).slice(0, 800);
      console.error(`[API] 返回数据格式异常:`, rawJson);
      throw new Error(`API返回数据格式异常(顶层字段: ${Object.keys(data).join(',')}) | 原始响应: ${rawJson}`);
    }
  }

  // 下载图片并上传
  private async downloadAndUpload(url: string, taskId: number, imageIndex: number): Promise<string> {
    const filename = generateFilename(taskId, imageIndex);

    if (url.startsWith('http')) {
      const imgResponse = await this.fetchWithTimeout(url);
      if (imgResponse.ok) {
        const arrayBuffer = await imgResponse.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        return await uploadImage(buffer, filename);
      } else {
        return url; // 返回原始URL
      }
    } else {
      // Base64
      const buffer = Buffer.from(url, 'base64');
      return await uploadImage(buffer, filename);
    }
  }

  private async fetchWithTimeout(url: string, timeoutMs = 30000): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return res;
    } catch (err) {
      clearTimeout(timeoutId);
      if ((err as Error).name === 'AbortError') {
        throw new Error(`图片下载超时(${timeoutMs / 1000}秒)`);
      }
      throw err;
    }
  }

  getStatus() {
    return {
      activeCount: this.activeCount,
      maxConcurrent: this.maxGlobalConcurrent,
    };
  }
}

export const taskQueue = new TaskQueue();
