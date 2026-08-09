import { query } from '../db/index.js';
import { uploadImage, generateFilename } from './cos.js';
import { decrypt } from './crypto.js';
import { buildGrsRequestBody, buildImageRequestSummary, buildImageResponseSummary, buildJimengRequestBody, type GrsModelFamily, validateQueuedGeneration, resolveGrsGenerateEndpoint, resolveGrsResultEndpoint } from '../lib/image-model-config.js';

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
  source: string;
  task_type?: string;
  retry_count: number;
  reference_images?: string | string[];
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
  grs_model_family?: GrsModelFamily;
  // 云雾 MJ 格式
  bot_type?: string;       // 云雾MJ: MID_JOURNEY/NIJI_JOURNEY
  // Jimeng 格式
  jimeng_resolution?: string; // Jimeng: 1k/2k/4k
  jimeng_n?: number; // Jimeng: 单次生成数量
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_API_TIMEOUT_MS = 120000;
const MJ_POLL_INTERVAL_MS = 5000;  // Midjourney 轮询间隔

function getTaskSourceLabel(task: Pick<Task, 'source' | 'task_type'>): string {
  if (task.task_type === 'workspace_batch') return '批量多图';
  if (task.task_type === 'workspace_single' || task.source === 'workspace') return '批量单图';
  if (task.source === 'product') return '商品主图';
  if (task.source === 'project') return '项目创作';
  return '自由创作';
}
const MJ_MAX_POLL_TIME_MS = 300000; // Midjourney 最大轮询时间 5分钟
const STALE_TASK_SCAN_INTERVAL_MS = 30000;
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

class TaskQueue {
  private processing = false;
  private activeCount = 0;
  private maxGlobalConcurrent = 50; // 全局安全上限，实际由模型级 max_concurrent 控制
  private staleTaskScanTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startStaleTaskScanner();
  }

  addTask(task: Task) {
    console.log(`[队列] 任务 #${task.id} 已加入队列 (优先级: ${task.priority}, 模型: ${task.model_id})`);
    this.processQueue();
  }

  private startStaleTaskScanner() {
    if (this.staleTaskScanTimer) return;
    void this.recoverStaleTasks();
    this.staleTaskScanTimer = setInterval(() => {
      void this.recoverStaleTasks();
    }, STALE_TASK_SCAN_INTERVAL_MS);
  }

  private async recoverStaleTasks() {
    try {
      const staleTasks = query(
        `SELECT t.*, m.task_timeout, m.api_timeout
         FROM generation_tasks t
         JOIN models m ON m.id = t.model_id
         WHERE t.status IN ('queued', 'processing')
           AND m.task_timeout > 0
           AND t.started_at IS NOT NULL`
      ).rows as Array<Task & { task_timeout?: number; api_timeout?: number; completed_at?: string | null }>;

      for (const task of staleTasks) {
        const taskTimeoutMs = Number(task.task_timeout || 0) * 1000;
        if (taskTimeoutMs <= 0 || !task.started_at) continue;

        const elapsedMs = this.getTaskElapsedMs(task);
        if (elapsedMs < taskTimeoutMs) continue;

        const errorMsg = `任务总超时(已等待 ${(elapsedMs / 1000).toFixed(1)}秒，限制 ${(taskTimeoutMs / 1000).toFixed(1)}秒) [兜底清理]`;
        this.failTask(task, errorMsg, true);
      }
    } catch (error) {
      console.error('[队列] 超时任务兜底清理失败:', error);
    }
  }

  private refundTaskCredits(task: Task) {
    if (task.credits_type === 'project') {
      query('UPDATE users SET project_credits = project_credits + ? WHERE id = ?', [task.credits_charged, task.user_id]);
    } else {
      query('UPDATE users SET creative_credits = creative_credits + ? WHERE id = ?', [task.credits_charged, task.user_id]);
    }
  }

  private syncWorkspaceFailure(taskId: number, errorMsg: string) {
    const cardImageRow = query('SELECT id FROM card_images WHERE generation_task_id = ?', [taskId]);
    if (cardImageRow.rows[0]) {
      query(
        "UPDATE card_images SET status = 'failed', error_message = ? WHERE id = ?",
        [errorMsg, cardImageRow.rows[0].id]
      );
    }
  }

  private getWorkspaceImageLogContext(taskId: number) {
    const row = query(
      `SELECT ci.id as card_image_id, ci.card_id, pc.task_id as workspace_task_id
       FROM card_images ci
       JOIN prompt_cards pc ON ci.card_id = pc.id
       WHERE ci.generation_task_id = ?
       LIMIT 1`,
      [taskId]
    ).rows[0] as { card_image_id?: number; card_id?: number; workspace_task_id?: number } | undefined

    return {
      cardImageId: row?.card_image_id || null,
      cardId: row?.card_id || null,
      workspaceTaskId: row?.workspace_task_id || null,
    }
  }

  private createWorkspaceImageLog(task: Task, model: any, status: 'pending' | 'success' | 'failure', payload: {
    requestParams?: Record<string, unknown>
    responseBody?: string | null
    errorMessage?: string | null
    durationMs?: number | null
    retryCount?: number
  }) {
    if (task.source !== 'workspace') return null

    const context = this.getWorkspaceImageLogContext(task.id)
    if (!context.workspaceTaskId) return null

    const result = query(
      `INSERT INTO workspace_api_logs (user_id, api_type, api_config_id, api_config_name, workspace_task_id, card_id, generation_task_id, request_params, response_status, response_body, duration_ms, retry_count, error_message)
       VALUES (?, 'image', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        task.user_id,
        model?.id || null,
        model?.display_name || model?.name || null,
        context.workspaceTaskId,
        context.cardId,
        task.id,
        payload.requestParams ? JSON.stringify(payload.requestParams) : null,
        status,
        payload.responseBody || null,
        payload.durationMs ?? null,
        payload.retryCount ?? (task.retry_count || 0),
        payload.errorMessage || null,
      ]
    )

    return result.lastInsertRowid
  }

  private updateWorkspaceImageLog(logId: number | null, status: 'success' | 'failure', payload: {
    responseBody?: string | null
    errorMessage?: string | null
    durationMs?: number | null
    retryCount?: number
  }) {
    if (!logId) return

    query(
      `UPDATE workspace_api_logs
       SET response_status = ?, response_body = COALESCE(?, response_body), duration_ms = COALESCE(?, duration_ms), retry_count = COALESCE(?, retry_count), error_message = ?
       WHERE id = ?`,
      [
        status,
        payload.responseBody || null,
        payload.durationMs ?? null,
        payload.retryCount ?? null,
        payload.errorMessage || null,
        logId,
      ]
    )
  }

  private markLatestPendingCallLogFailed(taskId: number, errorMsg: string) {
    const callLogRow = query(
      "SELECT id FROM api_call_logs WHERE task_id = ? AND status = 'pending' ORDER BY call_index DESC, id DESC LIMIT 1",
      [taskId]
    );
    if (callLogRow.rows[0]) {
      query(
        "UPDATE api_call_logs SET status = 'failed', error_message = COALESCE(error_message, ?), elapsed_ms = COALESCE(elapsed_ms, 0) WHERE id = ?",
        [errorMsg, callLogRow.rows[0].id]
      );
    }
  }

  private markLatestPendingWorkspaceLogFailed(taskId: number, errorMsg: string) {
    const context = this.getWorkspaceImageLogContext(taskId)
    if (!context.workspaceTaskId) return

    const logRow = query(
      `SELECT id FROM workspace_api_logs
       WHERE workspace_task_id = ?
         AND card_id = ?
         AND api_type = 'image'
         AND response_status = 'pending'
       ORDER BY id DESC
       LIMIT 1`,
      [context.workspaceTaskId, context.cardId]
    )

    if (logRow.rows[0]) {
      query(
        `UPDATE workspace_api_logs
         SET response_status = 'failure', error_message = COALESCE(error_message, ?), duration_ms = COALESCE(duration_ms, 0)
         WHERE id = ?`,
        [errorMsg, logRow.rows[0].id]
      )
    }
  }

  private failTask(task: Task, errorMsg: string, refundCredits: boolean) {
    const currentTaskRow = query(
      'SELECT status, completed_at FROM generation_tasks WHERE id = ?',
      [task.id]
    );
    const currentTask = currentTaskRow.rows[0] as { status?: string; completed_at?: string | null } | undefined;
    if (!currentTask || currentTask.status === 'completed' || currentTask.status === 'failed') {
      return;
    }

    query(
      "UPDATE generation_tasks SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
      [errorMsg, task.id]
    );

    if (task.source === 'workspace') {
      this.syncWorkspaceFailure(task.id, errorMsg);
    }

    this.markLatestPendingCallLogFailed(task.id, errorMsg);
    this.markLatestPendingWorkspaceLogFailed(task.id, errorMsg);

    if (refundCredits) {
      this.refundTaskCredits(task);
    }

    console.log(`[队列] 任务 #${task.id} 已由兜底逻辑标记失败: ${errorMsg}`);
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
    const taskTimeoutMs = (model?.task_timeout || 0) * 1000; // 0 表示不限制

    // 计算当前是第几次调用
    const callCountResult = query('SELECT COUNT(*) as count FROM api_call_logs WHERE task_id = ?', [task.id]);
    const callIndex = (callCountResult.rows[0]?.count || 0) + 1;
    const taskSource = task.source || 'creative';
    const taskSourceLabel = getTaskSourceLabel(task);
    const referenceImages = this.getReferenceImages(task);
    const modelExtraConfig: ExtraConfig = (() => {
      try { return JSON.parse(model?.extra_config || '{}') } catch { return {} }
    })();
    const requestSummary = buildImageRequestSummary({
      referenceImages,
      referenceImageField: model?.reference_image_field,
      modelFamily: model?.api_format === 'grs' ? modelExtraConfig.grs_model_family || null : model?.api_format || null,
      imageSize: task.image_size,
    });

    // 检查任务总超时
    if (taskTimeoutMs > 0 && task.started_at) {
      const taskElapsed = Date.now() - new Date(task.started_at).getTime();
      if (taskElapsed >= taskTimeoutMs) {
        const errorMsg = `任务总超时(已等待 ${taskElapsed / 1000}秒，限制 ${taskTimeoutMs / 1000}秒)`;
          this.failTask(task, errorMsg, true);
        console.log(`[队列] 任务 #${task.id} 任务总超时: ${errorMsg}`);
        return;
      }
    }

    // 记录本次调用
    const callLogResult = query(
      'INSERT INTO api_call_logs (task_id, call_index, status, request_params, created_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
      [task.id, callIndex, 'pending', JSON.stringify({ source: taskSource, source_label: taskSourceLabel, task_type: task.task_type || null, model: model?.name, prompt: task.prompt?.slice(0, 200), size: task.image_size, format: model?.api_format || 'openai', ...requestSummary })]
    );
    const callLogId = callLogResult.lastInsertRowid;
    const workspaceLogId = this.createWorkspaceImageLog(task, model, 'pending', {
      requestParams: {
        generation_task_id: task.id,
        source: taskSource,
        source_label: taskSourceLabel,
        task_type: task.task_type || null,
        model: model?.name || null,
        prompt: task.prompt?.slice(0, 200) || '',
        size: task.image_size,
        format: model?.api_format || 'openai',
        ...requestSummary,
      },
      retryCount: task.retry_count || 0,
    })

    try {
      query(
        "UPDATE generation_tasks SET status = 'processing', started_at = COALESCE(started_at, CURRENT_TIMESTAMP) WHERE id = ?",
        [task.id]
      );

      if (task.source === 'workspace') {
        const cardImageRow = query('SELECT id FROM card_images WHERE generation_task_id = ?', [task.id]);
        if (cardImageRow.rows[0]) {
          query("UPDATE card_images SET status = 'generating' WHERE id = ?", [cardImageRow.rows[0].id]);
        }
      }

      if (!model || !model.api_endpoint) {
        throw new Error('模型API未配置');
      }

      validateQueuedGeneration(model, this.getReferenceImages(task), task.image_size);

      await this.normalizeTaskReferenceImages(task);
      const imageUrls = await this.callImageAPI(model, task, taskTimeoutMs);
      const elapsed = Date.now() - startTime;

      query(
        "UPDATE api_call_logs SET status = 'success', response_summary = ?, elapsed_ms = ? WHERE id = ?",
        [JSON.stringify({ imageCount: imageUrls.length }), elapsed, callLogId]
      );
      this.updateWorkspaceImageLog(workspaceLogId as number | null, 'success', {
        responseBody: JSON.stringify(buildImageResponseSummary(imageUrls)),
        durationMs: elapsed,
        retryCount: task.retry_count || 0,
      })

      query(
        "UPDATE generation_tasks SET status = 'completed', result_images = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [JSON.stringify(imageUrls), task.id]
      );

      if (task.source === 'workspace') {
        const cardImageRow = query('SELECT id FROM card_images WHERE generation_task_id = ?', [task.id]);
        if (cardImageRow.rows[0]) {
          const primaryImageUrl = imageUrls[0] || '';
          query(
            'UPDATE card_images SET is_selected = 0 WHERE card_id = (SELECT card_id FROM card_images WHERE id = ?)',
            [cardImageRow.rows[0].id]
          );
          query(
            "UPDATE card_images SET status = 'completed', image_url = ?, error_message = NULL, is_selected = 1 WHERE id = ?",
            [primaryImageUrl, cardImageRow.rows[0].id]
          );
          for (const imageUrl of imageUrls.slice(1)) {
            query(
              "INSERT INTO card_images (card_id, image_api_id, image_url, size, status, error_message, is_selected, generation_task_id) SELECT card_id, image_api_id, ?, size, 'completed', NULL, 0, generation_task_id FROM card_images WHERE id = ?",
              [imageUrl, cardImageRow.rows[0].id]
            );
          }
          query(
            'UPDATE prompt_cards SET selected_image_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = (SELECT card_id FROM card_images WHERE id = ?)',
            [cardImageRow.rows[0].id, cardImageRow.rows[0].id]
          );
        }
      }

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
      this.updateWorkspaceImageLog(workspaceLogId as number | null, 'failure', {
        errorMessage,
        durationMs: elapsed,
        retryCount: currentRetry,
      })

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
        if (task.source === 'workspace') {
          const cardImageRow = query('SELECT id FROM card_images WHERE generation_task_id = ?', [task.id]);
          if (cardImageRow.rows[0]) {
            query(
              "UPDATE card_images SET status = 'pending', error_message = ? WHERE id = ?",
              [errorMessage, cardImageRow.rows[0].id]
            );
          }
        }
        console.log(`[队列] 任务 #${task.id} ${errorType} (重试 ${newRetryCount}/${maxRetries}): ${rawMessage}，耗时 ${(elapsed / 1000).toFixed(1)}秒`);
      } else {
        const finalError = `${errorMessage} | 已重试${maxRetries}次均失败`;
        query(
          "UPDATE generation_tasks SET retry_errors = ? WHERE id = ?",
          [retryErrorsJson, task.id]
        );
        this.failTask(task, finalError, true);
        const creditsTypeName = task.credits_type === 'project' ? '项目' : '创作';
        console.log(`[队列] 任务 #${task.id} 最终失败 (${errorType}，已重试${maxRetries}次): ${rawMessage}，耗时 ${(elapsed / 1000).toFixed(1)}秒，已退还 ${task.credits_charged} ${creditsTypeName}积分`);
      }
    }
  }

  private getTaskElapsedMs(task: Task): number {
    if (!task.started_at) return 0;
    return Date.now() - new Date(task.started_at).getTime();
  }

  private getRemainingTaskTimeoutMs(task: Task, taskTimeoutMs: number): number | null {
    if (taskTimeoutMs <= 0) return null;
    return taskTimeoutMs - this.getTaskElapsedMs(task);
  }

  private ensureTaskNotTimedOut(task: Task, taskTimeoutMs: number) {
    const remainingMs = this.getRemainingTaskTimeoutMs(task, taskTimeoutMs);
    if (remainingMs !== null && remainingMs <= 0) {
      const elapsedMs = this.getTaskElapsedMs(task);
      throw new Error(`任务总超时(已等待 ${(elapsedMs / 1000).toFixed(1)}秒，限制 ${(taskTimeoutMs / 1000).toFixed(1)}秒)`);
    }
  }

  private getEffectiveTimeoutMs(task: Task, taskTimeoutMs: number, apiTimeoutMs: number): number {
    const remainingMs = this.getRemainingTaskTimeoutMs(task, taskTimeoutMs);
    if (remainingMs === null) return apiTimeoutMs;
    if (remainingMs <= 0) {
      this.ensureTaskNotTimedOut(task, taskTimeoutMs);
    }
    return Math.max(1, Math.min(apiTimeoutMs, remainingMs ?? apiTimeoutMs));
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

  private async callImageAPI(model: any, task: Task, taskTimeoutMs: number): Promise<string[]> {
    const apiFormat = model.api_format as 'grs' | 'jimeng';
    const extraConfig: ExtraConfig = (() => {
      try {
        return JSON.parse(model.extra_config || '{}');
      } catch { return {}; }
    })();

    // 解密 API Key
    const apiKey = decrypt(model.api_key_encrypted || '');

    console.log(`[API] 使用 ${apiFormat} 格式调用 | model=${model.name}`);

    switch (apiFormat) {
      case 'grs':
        return this.callGRSAPI(model, task, extraConfig, apiKey, taskTimeoutMs);
      case 'jimeng':
        return this.callJimengAPI(model, task, extraConfig, apiKey, taskTimeoutMs);
    }
  }

  private getReferenceImages(task: Task): string[] {
    if (!task.reference_images) return [];
    if (Array.isArray(task.reference_images)) {
      return task.reference_images.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    }
    try {
      const parsed = JSON.parse(task.reference_images);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
      }
      return [];
    } catch {
      return typeof task.reference_images === 'string' && task.reference_images.trim().length > 0 ? [task.reference_images] : [];
    }
  }

  private isDataUrl(value: string): boolean {
    return /^data:image\/[a-zA-Z0-9.+-]+;base64,/.test(value);
  }

  private isRemoteUrl(value: string): boolean {
    return /^https?:\/\//i.test(value);
  }

  private isLikelyBase64(value: string): boolean {
    if (!value || value.length < 128 || value.length % 4 !== 0) return false;
    return /^[A-Za-z0-9+/=\s]+$/.test(value);
  }

  private getExtensionFromMime(mimeType: string): string {
    const normalized = mimeType.toLowerCase();
    if (normalized.includes('jpeg')) return 'jpg';
    if (normalized.includes('png')) return 'png';
    if (normalized.includes('webp')) return 'webp';
    if (normalized.includes('gif')) return 'gif';
    return 'png';
  }

  private async normalizeReferenceImageToUrl(value: string, taskId: number, index: number): Promise<string> {
    if (!value) return value;

    // 本地路径需要读取文件并上传到存储服务（COS），获取外部 API 可访问的公网 URL
    if (value.startsWith('/uploads/')) {
      const fs = await import('fs');
      const path = await import('path');
      const relativePath = value.replace(/^\/uploads\//, '');
      const filePath = path.default.resolve('uploads', relativePath);
      if (fs.default.existsSync(filePath)) {
        const ext = path.default.extname(filePath).replace('.', '') || 'png';
        const filename = generateFilename(taskId, index, ext);
        const buffer = await fs.default.promises.readFile(filePath);
        return await uploadImage(buffer, filename);
      }
      return value;
    }

    if (this.isRemoteUrl(value)) {
      return value;
    }

    if (this.isDataUrl(value)) {
      const [, mimeType, base64] = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/) || [];
      if (!base64) {
        throw new Error('参考图 data URL 格式无效');
      }
      const ext = this.getExtensionFromMime(mimeType || 'image/png');
      const filename = generateFilename(taskId, index, ext);
      return await uploadImage(Buffer.from(base64, 'base64'), filename);
    }

    if (this.isLikelyBase64(value)) {
      const filename = generateFilename(taskId, index);
      return await uploadImage(Buffer.from(value.replace(/\s+/g, ''), 'base64'), filename);
    }

    return value;
  }

  private async normalizeTaskReferenceImages(task: Task): Promise<void> {
    const referenceImages = this.getReferenceImages(task);
    if (referenceImages.length === 0) {
      task.reference_images = JSON.stringify([]);
      return;
    }

    const normalized = await Promise.all(
      referenceImages.map((value, index) => this.normalizeReferenceImageToUrl(value, task.id, index))
    );

    const serialized = JSON.stringify(normalized);
    task.reference_images = serialized;
    query('UPDATE generation_tasks SET reference_images = ? WHERE id = ?', [serialized, task.id]);
  }

  // OpenAI GPT Image 格式
  private async callOpenAIAPI(model: any, task: Task, extraConfig: ExtraConfig, apiKey: string, taskTimeoutMs: number): Promise<string[]> {
    const imageUrls: string[] = [];
    const taskReferenceImages = this.getReferenceImages(task);
    const hasReferenceImages = taskReferenceImages.length > 0;
    const endpoint = this.resolveEndpoint(model.api_endpoint, hasReferenceImages);

    for (let i = 0; i < task.image_count; i++) {
      this.ensureTaskNotTimedOut(task, taskTimeoutMs);
      console.log(`[OpenAI] 请求 ${endpoint} | model=${model.name} | size=${task.image_size} | quality=${extraConfig.quality || 'default'} | 超时=${model.api_timeout || 120}秒`);

      const controller = new AbortController();
      const effectiveTimeoutMs = this.getEffectiveTimeoutMs(task, taskTimeoutMs, (model.api_timeout || 120) * 1000);
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);

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

      // 准备参考图文件上传
      let imageFiles: { fieldName: string; urls: string[] } | undefined;
      if (taskReferenceImages.length > 0) {
        // OpenAI 图像编辑 API 的标准字段名是 "image"，不是 "url" 或 "image_url"
        const fieldName = 'image';
        imageFiles = { fieldName, urls: taskReferenceImages };
        console.log(`[OpenAI] 参考图: ${fieldName}=${JSON.stringify(taskReferenceImages)}`);
        // 注意：不要将 URL 添加到 requestBody，而是通过 imageFiles 参数传递
      }

      // 有参考图时使用 multipart/form-data 格式
      const useMultipart = taskReferenceImages.length > 0;
      const response = await this.fetchWithAuth(endpoint, apiKey, requestBody, controller, effectiveTimeoutMs, useMultipart, imageFiles);
      clearTimeout(timeoutId);

      const data = await this.parseResponse(response, endpoint);
      const imageUrl = await this.extractImageUrl(data, task.id, i);
      imageUrls.push(imageUrl);
    }

    return imageUrls;
  }

  // Gemini Nano Banana 简化格式
  private async callGeminiAPI(model: any, task: Task, apiKey: string, taskTimeoutMs: number): Promise<string[]> {
    const imageUrls: string[] = [];
    const taskReferenceImages = this.getReferenceImages(task);
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
      this.ensureTaskNotTimedOut(task, taskTimeoutMs);
      console.log(`[Gemini] 请求 ${endpoint} | model=${model.name} | image_size=${imageSize} | 超时=${model.api_timeout || 120}秒`);

      const controller = new AbortController();
      const effectiveTimeoutMs = this.getEffectiveTimeoutMs(task, taskTimeoutMs, (model.api_timeout || 120) * 1000);
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);

      const requestBody: Record<string, unknown> = {
        prompt: task.prompt,
        model: model.name,
        image_size: imageSize,
        num: 1,
      };

      // 添加参考图（Gemini 格式）
      if (taskReferenceImages.length > 0) {
        requestBody.reference_images = taskReferenceImages;
        console.log(`[Gemini] 参考图: ${JSON.stringify(taskReferenceImages)}`);
      }

      const response = await this.fetchWithAuth(endpoint, apiKey, requestBody, controller, effectiveTimeoutMs);
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
  private async callMidjourneyAPI(model: any, task: Task, extraConfig: ExtraConfig, apiKey: string, taskTimeoutMs: number): Promise<string[]> {
    const imageUrls: string[] = [];
    const taskReferenceImages = this.getReferenceImages(task);
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
      this.ensureTaskNotTimedOut(task, taskTimeoutMs);
      console.log(`[MJ] 提交任务 ${submitEndpoint} | prompt=${mjPrompt.slice(0, 50)}... | mode=${mjMode}`);

      const controller = new AbortController();
      const effectiveTimeoutMs = this.getEffectiveTimeoutMs(task, taskTimeoutMs, (model.api_timeout || 120) * 1000);
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);

      const requestBody: Record<string, unknown> = {
        prompt: mjPrompt,
        mode: mjMode,
      };

      // 添加参考图（Midjourney 格式：base64Array）
      if (taskReferenceImages.length > 0) {
        requestBody.base64Array = taskReferenceImages;
        console.log(`[MJ] 参考图: ${taskReferenceImages.length} 张`);
      }

      const response = await this.fetchWithAuth(submitEndpoint, apiKey, requestBody, controller, effectiveTimeoutMs);
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
      const imageUrl = await this.pollMidjourneyResult(model.api_endpoint, apiKey, taskId, task.id, i, task, taskTimeoutMs);
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
    imageIndex: number,
    task: Task,
    taskTimeoutMs: number
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
      this.ensureTaskNotTimedOut(task, taskTimeoutMs);
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
  private async callGRSAPI(model: any, task: Task, extraConfig: ExtraConfig, apiKey: string, taskTimeoutMs: number): Promise<string[]> {
    const imageUrls: string[] = [];
    const taskReferenceImages = this.getReferenceImages(task);
    const endpoint = resolveGrsGenerateEndpoint(model.api_endpoint);

    const replyType = extraConfig.reply_type || 'json';
    const modelFamily = extraConfig.grs_model_family;
    if (modelFamily !== 'gpt' && modelFamily !== 'gemini') {
      throw new Error(`GRS 模型 ${model.name} 缺少有效的 grs_model_family 配置（需为 gpt 或 gemini），请在后台模型管理中正确配置`);
    }
    const grsConfig = {
      grs_model_family: modelFamily,
      reply_type: extraConfig.reply_type === 'async' ? 'async' as const : 'json' as const,
      image_size_grs: ['1K', '2K', '4K'].includes(extraConfig.image_size_grs || '')
        ? extraConfig.image_size_grs as '1K' | '2K' | '4K'
        : undefined,
    };

    for (let i = 0; i < task.image_count; i++) {
      this.ensureTaskNotTimedOut(task, taskTimeoutMs);
      const aspectRatioPreview = modelFamily === 'gpt' ? task.image_size : sizeToRatio(task.image_size);
      console.log(`[GRS] 请求 ${endpoint} | model=${model.name} | family=${modelFamily} | aspectRatio=${aspectRatioPreview} | replyType=${replyType} | 超时=${model.api_timeout || 120}秒`);

      const controller = new AbortController();
      const effectiveTimeoutMs = this.getEffectiveTimeoutMs(task, taskTimeoutMs, (model.api_timeout || 120) * 1000);
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);

      const requestBody = buildGrsRequestBody({
        model: model.name,
        prompt: task.prompt,
        imageSize: task.image_size,
        extraConfig: grsConfig,
        referenceImages: taskReferenceImages,
        referenceImageField: model.reference_image_field,
      });

      if (taskReferenceImages.length > 0) {
        console.log(`[GRS] 参考图: ${taskReferenceImages.length} 张`);
      }

      const response = await this.fetchWithAuth(endpoint, apiKey, requestBody, controller, effectiveTimeoutMs);
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
        const imageUrl = await this.pollGRSResult(model.api_endpoint, apiKey, grsTaskId, task.id, i, task, taskTimeoutMs);
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
    imageIndex: number,
    task: Task,
    taskTimeoutMs: number
  ): Promise<string> {
    const pollEndpoint = resolveGrsResultEndpoint(apiEndpoint);

    const separator = pollEndpoint.includes('?') ? '&' : '?';
    const fullPollUrl = `${pollEndpoint}${separator}id=${taskId}`;

    const startTime = Date.now();

    while (Date.now() - startTime < MJ_MAX_POLL_TIME_MS) {
      this.ensureTaskNotTimedOut(task, taskTimeoutMs);
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
  private async callYunwuMJAPI(model: any, task: Task, extraConfig: ExtraConfig, apiKey: string, taskTimeoutMs: number): Promise<string[]> {
    const imageUrls: string[] = [];
    const taskReferenceImages = this.getReferenceImages(task);
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
      this.ensureTaskNotTimedOut(task, taskTimeoutMs);
      console.log(`[云雾MJ] 提交任务 ${submitEndpoint} | prompt=${mjPrompt.slice(0, 50)}... | botType=${botType}`);

      const controller = new AbortController();
      const effectiveTimeoutMs = this.getEffectiveTimeoutMs(task, taskTimeoutMs, (model.api_timeout || 120) * 1000);
      const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);

      const requestBody: Record<string, unknown> = {
        prompt: mjPrompt,
        botType: botType,
        notifyHook: '',
      };

      // 添加参考图（云雾MJ: base64Array）
      if (taskReferenceImages.length > 0) {
        requestBody.base64Array = taskReferenceImages;
        console.log(`[云雾MJ] 参考图: ${taskReferenceImages.length} 张`);
      }

      const response = await this.fetchWithAuth(submitEndpoint, apiKey, requestBody, controller, effectiveTimeoutMs);
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
      const imageUrl = await this.pollYunwuMJResult(model.api_endpoint, apiKey, taskId, task.id, i, task, taskTimeoutMs);
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
    imageIndex: number,
    task: Task,
    taskTimeoutMs: number
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
      this.ensureTaskNotTimedOut(task, taskTimeoutMs);
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
    timeoutMs?: number,
    useMultipart: boolean = false,
    imageFiles?: { fieldName: string; urls: string[] }
  ): Promise<Response> {
    try {
      let requestBody: string | FormData;
      const headers: Record<string, string> = {
        'Authorization': `Bearer ${apiKey}`,
      };

      if (useMultipart) {
        // 使用 multipart/form-data 格式
        const formData = new FormData();
        
        // 先处理图片文件（如果有）
        if (imageFiles && imageFiles.urls.length > 0) {
          console.log(`[fetchWithAuth] 准备上传 ${imageFiles.urls.length} 张图片，字段名: ${imageFiles.fieldName}`);
          for (let i = 0; i < imageFiles.urls.length; i++) {
            const imageUrl = imageFiles.urls[i];
            try {
              console.log(`[fetchWithAuth] 下载参考图 ${i + 1}/${imageFiles.urls.length}: ${imageUrl}`);
              // 下载图片
              const imageResponse = await fetch(imageUrl);
              if (!imageResponse.ok) {
                throw new Error(`下载参考图失败: ${imageUrl}`);
              }
              const imageBuffer = await imageResponse.arrayBuffer();
              const contentType = imageResponse.headers.get('content-type') || 'image/png';
              const blob = new Blob([imageBuffer], { type: contentType });
              
              // 从 URL 提取文件名和扩展名
              const urlPath = new URL(imageUrl).pathname;
              const fileName = urlPath.split('/').pop() || 'image.png';
              
              console.log(`[fetchWithAuth] 图片 ${i + 1} 下载成功: ${fileName}, 大小: ${blob.size} bytes, 类型: ${contentType}`);
              
              // 添加到 FormData（多个图片使用同一个字段名）
              formData.append(imageFiles.fieldName, blob, fileName);
            } catch (err) {
              console.error(`处理参考图失败 (${imageUrl}):`, err);
              throw new Error(`处理参考图失败: ${(err as Error).message}`);
            }
          }
          console.log(`[fetchWithAuth] 所有参考图已添加到 FormData`);
        }
        
        // 再处理其他字段
        for (const [key, value] of Object.entries(body)) {
          // 跳过已经作为文件处理的字段
          if (imageFiles && key === imageFiles.fieldName) {
            continue;
          }
          
          if (Array.isArray(value)) {
            // 数组字段转为 JSON 字符串
            formData.append(key, JSON.stringify(value));
          } else if (typeof value === 'object' && value !== null) {
            formData.append(key, JSON.stringify(value));
          } else {
            formData.append(key, String(value));
          }
          console.log(`[fetchWithAuth] FormData 字段: ${key} = ${String(value).slice(0, 100)}`);
        }
        requestBody = formData;
        console.log(`[fetchWithAuth] FormData 构建完成，准备发送到: ${endpoint}`);
        // 不设置 Content-Type，让浏览器/Node 自动设置 boundary
      } else {
        // 使用 JSON 格式
        headers['Content-Type'] = 'application/json';
        requestBody = JSON.stringify(body);
      }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: requestBody,
        signal: controller.signal,
      });

      return response;
    } catch (fetchErr) {
      const error = fetchErr as Error & { cause?: unknown };
      const cause = error.cause ? String(error.cause) : '';
      const detailParts = [error.message, cause && `原因: ${cause}`, `接口: ${endpoint}`].filter(Boolean);
      if (error.name === 'AbortError') {
        const timeout = timeoutMs || DEFAULT_API_TIMEOUT_MS;
        throw new Error(`API请求超时(已等待${timeout / 1000}秒)，请检查API服务状态或稍后重试`);
      }
      throw new Error(`API请求网络错误: ${detailParts.join(' | ')}`);
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

  // Jimeng 即梦 AI 格式
  private async callJimengAPI(model: any, task: Task, extraConfig: ExtraConfig, apiKey: string, taskTimeoutMs: number): Promise<string[]> {
    const imageUrls: string[] = [];
    const taskReferenceImages = this.getReferenceImages(task);
    let endpoint = model.api_endpoint.replace(/\/+$/, '');

    // 判断是否有参考图（需要使用图生图接口）
    const hasReferenceImages = taskReferenceImages.length > 0;

    // 解析 supported_sizes 获取比例
    let ratio = '1:1';
    try {
      if (model.supported_sizes) {
        const sizes = typeof model.supported_sizes === 'string' 
          ? JSON.parse(model.supported_sizes) 
          : model.supported_sizes;
        if (sizes?.ratios && Array.isArray(sizes.ratios)) {
          // 根据 image_size 匹配对应比例
          const sizeMatch = task.image_size.match(/^(\d+)x(\d+)$/i);
          if (sizeMatch) {
            const w = parseInt(sizeMatch[1]);
            const h = parseInt(sizeMatch[2]);
            const matched = sizes.ratios.find((s: any) => s.width === w && s.height === h);
            if (matched) {
              ratio = matched.ratio;
            } else {
              // 尝试匹配比例
              const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b);
              const d = gcd(w, h);
              const taskRatio = `${w / d}:${h / d}`;
              const found = sizes.ratios.find((s: any) => s.ratio === taskRatio);
              ratio = found ? taskRatio : (sizes.ratios[0]?.ratio || '1:1');
            }
          } else {
            ratio = sizes.ratios[0]?.ratio || '1:1';
          }
        }
      }
    } catch {}

    // 获取分辨率，默认 2k
    const resolution = extraConfig.jimeng_resolution || '2k';
    // 获取单次生成数量，默认 1
    const n = extraConfig.jimeng_n || 1;

    // 构建端点
    if (hasReferenceImages) {
      // 图生图使用 /v1/images/compositions
      if (!endpoint.includes('/images/compositions') && !endpoint.includes('/v1/chat/completions') && !endpoint.includes('/v1/responses')) {
        if (endpoint.endsWith('/v1')) {
          endpoint += '/images/compositions';
        } else if (!endpoint.includes('/v1/')) {
          endpoint += '/v1/images/compositions';
        } else {
          endpoint = endpoint.replace(/\/v1\/.*/, '/v1/images/compositions');
        }
      }
    } else {
      // 文生图使用 /v1/images/generations
      if (!endpoint.includes('/images/generations') && !endpoint.includes('/v1/chat/completions') && !endpoint.includes('/v1/responses') && !endpoint.includes('/images/compositions')) {
        if (endpoint.endsWith('/v1')) {
          endpoint += '/images/generations';
        } else if (!endpoint.includes('/v1/')) {
          endpoint += '/v1/images/generations';
        } else {
          endpoint = endpoint.replace(/\/v1\/.*/, '/v1/images/generations');
        }
      }
    }

    // Jimeng 支持一次生成多张图片，使用 n 参数
    console.log(`[Jimeng] 请求 ${endpoint} | model=${model.name} | ratio=${ratio} | resolution=${resolution} | n=${n} | hasRefImages=${hasReferenceImages} | 超时=${model.api_timeout || 120}秒`);

    this.ensureTaskNotTimedOut(task, taskTimeoutMs);
    const controller = new AbortController();
    const effectiveTimeoutMs = this.getEffectiveTimeoutMs(task, taskTimeoutMs, (model.api_timeout || 120) * 1000);
    const timeoutId = setTimeout(() => controller.abort(), effectiveTimeoutMs);

    const requestBody = buildJimengRequestBody({
      model: model.name,
      prompt: task.prompt,
      ratio,
      resolution,
      count: n,
      referenceImages: taskReferenceImages,
      referenceImageField: model.reference_image_field,
    });

    // 添加参考图（仅图生图）
    if (hasReferenceImages) {
      console.log(`[Jimeng] 参考图: ${taskReferenceImages.length} 张`);
    }

    const response = await this.fetchWithAuth(endpoint, apiKey, requestBody, controller, effectiveTimeoutMs);
    clearTimeout(timeoutId);

    const data = await this.parseResponse(response, endpoint);

    // 从响应中提取所有图片
    let imageDataArray: any[] = [];
    if (data.data && Array.isArray(data.data)) {
      imageDataArray = data.data;
    } else if (data.images && Array.isArray(data.images)) {
      imageDataArray = data.images;
    } else if (data.output && Array.isArray(data.output)) {
      imageDataArray = data.output;
    } else if (data.url) {
      // 单个 URL 的情况
      imageDataArray = [{ url: data.url }];
    } else if (data.b64_json) {
      imageDataArray = [{ b64_json: data.b64_json }];
    }

    if (imageDataArray.length === 0) {
      throw new Error(`Jimeng API 返回数据为空`);
    }

    // 上传每张图片到 COS
    for (let i = 0; i < imageDataArray.length; i++) {
      const imageData = imageDataArray[i];
      let imageUrl: string;

      if (imageData.b64_json) {
        const buffer = Buffer.from(imageData.b64_json, 'base64');
        imageUrl = await uploadImage(buffer, generateFilename(task.id, i));
      } else if (imageData.url) {
        imageUrl = await this.downloadAndUpload(imageData.url, task.id, i);
      } else if (typeof imageData === 'string') {
        imageUrl = await this.downloadAndUpload(imageData, task.id, i);
      } else {
        throw new Error(`Jimeng 返回图片数据格式无法识别`);
      }

      imageUrls.push(imageUrl);
    }

    console.log(`[Jimeng] 生成完成，共 ${imageUrls.length} 张图片`);
    return imageUrls;
  }

  getStatus() {
    return {
      activeCount: this.activeCount,
      maxConcurrent: this.maxGlobalConcurrent,
    };
  }
}

export const taskQueue = new TaskQueue();
