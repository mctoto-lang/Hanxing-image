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
}

const DEFAULT_MAX_RETRIES = 3;
const API_TIMEOUT_MS = 120000;

class TaskQueue {
  private processing = false;
  private activeCount = 0;
  private maxGlobalConcurrent = 10;

  addTask(task: Task) {
    console.log(`[队列] 任务 #${task.id} 已加入队列 (优先级: ${task.priority})`);
    this.processQueue();
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.activeCount < this.maxGlobalConcurrent) {
      const nextTask = this.getNextTask();
      if (!nextTask) break;

      this.activeCount++;
      this.executeTask(nextTask).finally(() => {
        this.activeCount--;
        this.processQueue();
      });
    }

    this.processing = false;
  }

  private getNextTask(): Task | null {
    const result = query(
      `SELECT t.* FROM generation_tasks t
       JOIN models m ON t.model_id = m.id
       WHERE t.status = 'queued'
       ORDER BY t.priority DESC, t.created_at ASC
       LIMIT 1`
    );
    return result.rows[0] || null;
  }

  private async executeTask(task: Task) {
    const startTime = Date.now()
    const modelResult = query('SELECT * FROM models WHERE id = ?', [task.model_id]);
    const model = modelResult.rows[0];
    const maxRetries = model?.max_retries ?? DEFAULT_MAX_RETRIES;
    try {
      query(
        "UPDATE generation_tasks SET status = 'processing', started_at = CURRENT_TIMESTAMP WHERE id = ?",
        [task.id]
      );

      if (!model || !model.api_endpoint) {
        throw new Error('模型API未配置');
      }

      const imageUrls = await this.callImageAPI(model, task);

      query(
        "UPDATE generation_tasks SET status = 'completed', result_images = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [JSON.stringify(imageUrls), task.id]
      );

      console.log(`[队列] 任务 #${task.id} 完成，生成 ${imageUrls.length} 张图片，耗时 ${((Date.now() - startTime) / 1000).toFixed(1)}秒`);
    } catch (err) {
      const rawMessage = (err as Error).message;
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const currentRetry = task.retry_count || 0;
      const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

      const isTimeout = rawMessage.includes('超时') || rawMessage.includes('timeout') || rawMessage.includes('aborted');
      const errorType = isTimeout ? '请求超时' : '请求失败';
      const errorMessage = `[${errorType}] ${rawMessage} | 耗时: ${elapsed}秒 | 时间: ${timestamp}`;

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
        console.log(`[队列] 任务 #${task.id} ${errorType} (重试 ${newRetryCount}/${maxRetries}): ${rawMessage}，耗时 ${elapsed}秒`);
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
        console.log(`[队列] 任务 #${task.id} 最终失败 (${errorType}，已重试${maxRetries}次): ${rawMessage}，耗时 ${elapsed}秒，已退还 ${task.credits_charged} ${creditsTypeName}积分`);
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
    const imageUrls: string[] = [];
    const hasReferenceImages = !!task.reference_images && (() => {
      try {
        const refs = JSON.parse(task.reference_images);
        return Array.isArray(refs) && refs.length > 0;
      } catch { return false; }
    })();
    const endpoint = this.resolveEndpoint(model.api_endpoint, hasReferenceImages);

    for (let i = 0; i < task.image_count; i++) {
      console.log(`[API] 请求 ${endpoint} | model=${model.name} | size=${task.image_size} | n=1 | 超时=${API_TIMEOUT_MS / 1000}秒`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);

      // 构建请求体
      const requestBody: Record<string, unknown> = {
        model: model.name,
        prompt: task.prompt,
        size: task.image_size,
        n: 1,
      };

      // 添加参考图
      if (task.reference_images) {
        try {
          const refImages = JSON.parse(task.reference_images);
          if (Array.isArray(refImages) && refImages.length > 0) {
            const fieldName = model.reference_image_field || 'image_url';
            requestBody[fieldName] = refImages.length === 1 ? refImages[0] : refImages;
            console.log(`[API] 参考图: ${fieldName}=${JSON.stringify(refImages)}`);
          }
        } catch {}
      }

      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${model.api_key_encrypted}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if ((fetchErr as Error).name === 'AbortError') {
          throw new Error(`API请求超时(已等待${API_TIMEOUT_MS / 1000}秒)，请检查API服务状态或稍后重试`);
        }
        throw new Error(`API请求网络错误: ${(fetchErr as Error).message}`);
      }
      clearTimeout(timeoutId);

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

      let imageData = data.data?.[0] || data.images?.[0] || data.output?.[0] || null;

      if (!imageData && Array.isArray(data.data) && data.data.length === 0) {
        console.error(`[API] 返回数据为空数组:`, JSON.stringify(data).slice(0, 500));
        throw new Error('API返回数据为空(data:[])');
      }

      if (!imageData && data.data) {
        imageData = data.data[0];
      }

      if (imageData) {
        const filename = generateFilename(task.id, i);

        if (imageData.b64_json) {
          const buffer = Buffer.from(imageData.b64_json, 'base64');
          const cosUrl = await uploadImage(buffer, filename);
          imageUrls.push(cosUrl);
        } else if (imageData.url) {
          const imgResponse = await this.fetchWithTimeout(imageData.url);
          if (imgResponse.ok) {
            const arrayBuffer = await imgResponse.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            const cosUrl = await uploadImage(buffer, filename);
            imageUrls.push(cosUrl);
          } else {
            imageUrls.push(imageData.url);
          }
        } else if (typeof imageData === 'string') {
          if (imageData.startsWith('http')) {
            const imgResponse = await this.fetchWithTimeout(imageData);
            if (imgResponse.ok) {
              const arrayBuffer = await imgResponse.arrayBuffer();
              const buffer = Buffer.from(arrayBuffer);
              const cosUrl = await uploadImage(buffer, filename);
              imageUrls.push(cosUrl);
            } else {
              imageUrls.push(imageData);
            }
          } else {
            const buffer = Buffer.from(imageData, 'base64');
            const cosUrl = await uploadImage(buffer, filename);
            imageUrls.push(cosUrl);
          }
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

    return imageUrls;
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
