import { query } from '../db/index.js';
import { decrypt } from './crypto.js';

interface ChatTask {
  id: number;
  user_id: number;
  chat_api_id: number;
  task_type: 'deepen' | 'regenerate';
  card_id: number;
  workspace_task_id: number;
  template_id: number;
  original_prompt: string;
  status: string;
  retry_count: number;
  started_at?: string;
}

interface ChatApiConfig {
  id: number;
  name: string;
  endpoint: string;
  model: string;
  api_key: string;
  format_type: string;
  max_concurrent: number;
  max_retries: number;
  api_timeout: number;
}

const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_API_TIMEOUT_MS = 120000;

class ChatTaskQueue {
  private processing = false;
  private activeCount = 0;
  private maxGlobalConcurrent = 20; // 全局安全上限

  addTask(task: ChatTask) {
    console.log(`[对话队列] 任务 #${task.id} 已加入队列 (类型: ${task.task_type}, API: ${task.chat_api_id})`);
    this.processQueue();
  }

  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.activeCount < this.maxGlobalConcurrent) {
      const nextTask = this.getNextTask();
      if (!nextTask) break;

      this.activeCount++;
      console.log(`[对话队列] 开始执行任务 #${nextTask.id} | 全局并发: ${this.activeCount}/${this.maxGlobalConcurrent}`);
      this.executeTask(nextTask).finally(() => {
        this.activeCount--;
        this.processQueue();
      });
    }

    this.processing = false;
  }

  private getNextTask(): ChatTask | null {
    // 查询所有有排队任务的对话API及其当前并发状态
    const apiStatusResult = query(
      `SELECT c.id, c.name, c.max_concurrent,
        (SELECT COUNT(*) FROM chat_tasks t2 WHERE t2.chat_api_id = c.id AND t2.status = 'processing') as active_count
       FROM chat_api_configs c
       WHERE c.status = 'active'
       AND EXISTS (SELECT 1 FROM chat_tasks t3 WHERE t3.chat_api_id = c.id AND t3.status = 'queued')`
    );

    // 找出有可用并发槽位的API ID列表
    const availableApiIds: number[] = [];
    for (const api of apiStatusResult.rows) {
      const active = api.active_count || 0;
      const max = api.max_concurrent || 5;
      if (active < max) {
        availableApiIds.push(api.id);
      } else {
        console.log(`[对话队列] API "${api.name}" 并发已满: ${active}/${max} (跳过)`);
      }
    }

    if (availableApiIds.length === 0) {
      return null;
    }

    // 从有可用槽位的API中，按创建时间选取下一个任务
    const placeholders = availableApiIds.map(() => '?').join(',');
    const result = query(
      `SELECT t.* FROM chat_tasks t
       WHERE t.status = 'queued'
       AND t.chat_api_id IN (${placeholders})
       ORDER BY t.created_at ASC
       LIMIT 1`,
      availableApiIds
    );
    return result.rows[0] || null;
  }

  private async executeTask(task: ChatTask) {
    const startTime = Date.now();

    // 获取API配置
    const apiResult = query(
      'SELECT * FROM chat_api_configs WHERE id = ?',
      [task.chat_api_id]
    );
    const api = apiResult.rows[0] as ChatApiConfig | undefined;
    const maxRetries = api?.max_retries ?? DEFAULT_MAX_RETRIES;
    const apiTimeoutMs = (api?.api_timeout || 120) * 1000;

    // 获取模板内容
    const templateResult = query(
      'SELECT * FROM prompt_templates WHERE id = ?',
      [task.template_id]
    );
    const template = templateResult.rows[0];

    try {
      query(
        "UPDATE chat_tasks SET status = 'processing', started_at = CURRENT_TIMESTAMP WHERE id = ?",
        [task.id]
      );

      if (!api || !api.api_key) {
        throw new Error('对话API未配置或未关联API密钥');
      }

      if (!template) {
        throw new Error('模板不存在');
      }

      // 构建请求内容
      const content = template.content.replace(/\{\{prompt\}\}/g, task.original_prompt);

      // 调用对话API
      const resultPrompt = await this.callChatAPI(api, content, apiTimeoutMs);

      // 更新成功状态
      const elapsed = Date.now() - startTime;
      query(
        "UPDATE chat_tasks SET status = 'completed', result_prompt = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ?",
        [resultPrompt, task.id]
      );

      // 更新卡片的提示词
      query(
        "UPDATE prompt_cards SET prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        [resultPrompt, task.card_id]
      );

      // 记录日志
      query(
        `INSERT INTO workspace_api_logs (user_id, api_type, api_config_id, api_config_name, workspace_task_id, card_id, request_params, response_status, response_body, duration_ms)
         VALUES (?, 'chat', ?, ?, ?, ?, ?, 'success', ?, ?)`,
        [task.user_id, api.id, api.name, task.workspace_task_id, task.card_id, JSON.stringify({ template_id: task.template_id, prompt: task.original_prompt.slice(0, 200) }), resultPrompt.slice(0, 1000), elapsed]
      );

      console.log(`[对话队列] 任务 #${task.id} 完成，耗时 ${(elapsed / 1000).toFixed(1)}秒`);
    } catch (err) {
      const rawMessage = (err as Error).message;
      const elapsed = Date.now() - startTime;
      const currentRetry = task.retry_count || 0;
      const timestamp = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });

      const errorMessage = `[对话API失败] ${rawMessage} | 耗时: ${(elapsed / 1000).toFixed(1)}秒 | 时间: ${timestamp}`;

      // 追加重试错误
      const existingErrors: string[] = (() => {
        try {
          const taskRow = query('SELECT retry_errors FROM chat_tasks WHERE id = ?', [task.id]);
          return JSON.parse(taskRow.rows[0]?.retry_errors || '[]');
        } catch { return []; }
      })();
      existingErrors.push(errorMessage);
      const retryErrorsJson = JSON.stringify(existingErrors);

      // 记录失败日志
      query(
        `INSERT INTO workspace_api_logs (user_id, api_type, api_config_id, api_config_name, workspace_task_id, card_id, request_params, response_status, error_message, duration_ms, retry_count)
         VALUES (?, 'chat', ?, ?, ?, ?, ?, 'failure', ?, ?, ?)`,
        [task.user_id, api?.id, api?.name, task.workspace_task_id, task.card_id, JSON.stringify({ template_id: task.template_id, prompt: task.original_prompt.slice(0, 200) }), errorMessage, elapsed, currentRetry + 1]
      );

      if (currentRetry < maxRetries) {
        const newRetryCount = currentRetry + 1;
        query(
          "UPDATE chat_tasks SET status = 'queued', error_message = ?, retry_count = ?, retry_errors = ? WHERE id = ?",
          [errorMessage, newRetryCount, retryErrorsJson, task.id]
        );
        console.log(`[对话队列] 任务 #${task.id} 失败 (重试 ${newRetryCount}/${maxRetries}): ${rawMessage}`);
      } else {
        const finalError = `${errorMessage} | 已重试${maxRetries}次均失败`;
        query(
          "UPDATE chat_tasks SET status = 'failed', error_message = ?, completed_at = CURRENT_TIMESTAMP, retry_errors = ? WHERE id = ?",
          [finalError, retryErrorsJson, task.id]
        );
        console.log(`[对话队列] 任务 #${task.id} 最终失败: ${rawMessage}`);
      }
    }
  }

  private async callChatAPI(api: ChatApiConfig, content: string, timeoutMs: number): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const endpoint = api.endpoint.replace(/\/$/, '');
      const url = endpoint.endsWith('/chat/completions') ? endpoint : `${endpoint}/chat/completions`;

      const apiKey = decrypt(api.api_key);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: api.model,
          messages: [
            { role: 'user', content: content },
          ],
          temperature: 0.8,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`API 响应错误 ${response.status}: ${errText.slice(0, 200)}`);
      }

      const data = await response.json() as any;
      const resultContent = data?.choices?.[0]?.message?.content;
      if (!resultContent) throw new Error('API 响应中未找到内容');
      return resultContent.trim();
    } finally {
      clearTimeout(timer);
    }
  }

  getStatus() {
    return {
      activeCount: this.activeCount,
      maxConcurrent: this.maxGlobalConcurrent,
    };
  }
}

export const chatTaskQueue = new ChatTaskQueue();
