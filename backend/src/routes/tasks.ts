import { Router } from 'express';
import crypto from 'crypto';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { query, transaction } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { taskQueue } from '../services/queue.js';
import { validateGenerationCapabilities, validateQueuedGeneration } from '../lib/image-model-config.js';

export const taskRouter = Router();

function normalizeStaleProductTasks(tasks: any[]) {
  const now = Date.now();
  const staleThresholdMs = 30 * 60 * 1000;

  return tasks.map((task) => {
    if (task.source !== 'product') return task;
    if (task.status !== 'queued' && task.status !== 'pending' && task.status !== 'processing') return task;

    const createdAtMs = task.created_at ? new Date(task.created_at).getTime() : NaN;
    const startedAtMs = task.started_at ? new Date(task.started_at).getTime() : NaN;
    const baseTime = Number.isFinite(startedAtMs) ? startedAtMs : createdAtMs;
    const ageMs = Number.isFinite(baseTime) ? now - baseTime : 0;
    const hasResultImages = Array.isArray(task.result_images) && task.result_images.length > 0;
    const hasErrorMessage = Boolean(task.error_message);

    if (ageMs < staleThresholdMs || hasResultImages || hasErrorMessage) {
      return task;
    }

    return {
      ...task,
      status: 'failed',
      error_message: '任务状态异常：长时间未开始或未完成，已自动标记为失败',
      completed_at: task.completed_at || new Date(now).toISOString(),
    };
  });
}

// 生图接口速率限制：每用户每分钟最多 10 次
const generateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => {
    // 优先使用用户 ID（已登录用户）
    if (req.userId) return String(req.userId);
    // 未登录用户使用 IP，并通过 ipKeyGenerator 处理 IPv6
    return ipKeyGenerator(req.ip);
  },
  message: { error: '请求过于频繁，请稍后重试' },
});

// 批量查询任务状态（供前端轮询使用）
// GET /api/tasks?ids=1,2,3
taskRouter.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const idsParam = req.query.ids as string | undefined;
    if (!idsParam) {
      return res.json({ tasks: [] });
    }
    const ids = idsParam
      .split(',')
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n) && n > 0);
    if (ids.length === 0) {
      return res.json({ tasks: [] });
    }
    const placeholders = ids.map(() => '?').join(',');
    const result = query(
      `SELECT t.id, t.status, t.result_images, t.error_message, t.template_info, t.prompt, t.image_size, t.started_at, t.completed_at, t.created_at, m.display_name as model_name
       FROM generation_tasks t
       LEFT JOIN models m ON t.model_id = m.id
       WHERE t.user_id = ? AND t.id IN (${placeholders})`,
      [req.userId, ...ids]
    );
    const tasks = result.rows.map((t: any) => ({
      id: t.id,
      status: t.status,
      result_images: t.result_images ? JSON.parse(t.result_images) : [],
      error_message: t.error_message,
      prompt: t.prompt,
      model_name: t.model_name,
      image_size: t.image_size,
      started_at: t.started_at,
      completed_at: t.completed_at,
      created_at: t.created_at,
      template_info: t.template_info ? JSON.parse(t.template_info) : undefined,
    }));

    return res.json({ tasks });
  } catch {
    return res.status(500).json({ error: '查询任务状态失败' });
  }
});

taskRouter.post('/generate', authMiddleware, generateLimiter, async (req: AuthRequest, res) => {
  try {
    const { model_id, prompt, image_size, image_count, source, reference_images } = req.body;
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({ error: '提示词不能为空' });
    }
    if (prompt.length > 5000) {
      return res.status(400).json({ error: '提示词过长（最多 5000 字符）' });
    }
    if (!model_id) {
      return res.status(400).json({ error: '模型不能为空' });
    }

    // 校验生图数量范围
    const count = Math.min(Math.max(Math.floor(Number(image_count) || 1), 1), 10);
    if (!Number.isFinite(count) || count < 1) {
      return res.status(400).json({ error: '生图数量无效' });
    }

    const creditsType = source === 'project' ? 'project' : 'creative';

    const userResult = query(
      `SELECT u.credits, u.creative_credits, u.project_credits, u.group_id, g.allowed_models, g.max_concurrent, g.priority
       FROM users u LEFT JOIN permission_groups g ON u.group_id = g.id
       WHERE u.id = ?`,
      [req.userId]
    );
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }

    const modelResult = query('SELECT * FROM models WHERE id = ? AND is_active = true', [model_id]);
    const model = modelResult.rows[0];
    if (!model) {
      return res.status(404).json({ error: '模型不存在或已禁用' });
    }

    if (creditsType === 'project' && !model.visible_in_canvas) {
      return res.status(400).json({ error: '该模型不可用于项目创作' });
    }
    if (creditsType === 'creative' && !model.visible_in_generate) {
      return res.status(400).json({ error: '该模型不可用于自由创作' });
    }

    let validatedReferenceImages: string[];
    const resolvedImageSize = image_size || '1024x1024';
    try {
      validatedReferenceImages = validateGenerationCapabilities(model, reference_images, resolvedImageSize);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }

    const allowedModels = user.allowed_models || [];
    // allowed_models 存储的是模型ID字符串数组
    if (allowedModels.length > 0 && !allowedModels.includes(String(model.id))) {
      return res.status(403).json({ error: '当前权限组不允许使用此模型' });
    }

    const totalCost = model.cost_per_image * count;

    const availableCredits = creditsType === 'project' ? (user.project_credits || 0) : (user.creative_credits || 0);
    if (availableCredits < totalCost) {
      const creditsTypeName = creditsType === 'project' ? '项目' : '创作';
      return res.status(400).json({ error: `${creditsTypeName}积分不足，需要 ${totalCost} 积分，当前 ${availableCredits} 积分` });
    }

    const activeCount = query(
      "SELECT COUNT(*) as count FROM generation_tasks WHERE user_id = ? AND status IN ('queued', 'processing')",
      [req.userId]
    );
    if (parseInt(activeCount.rows[0].count) >= (user.max_concurrent || 2)) {
      return res.status(429).json({ error: '已达到最大并发任务数' });
    }

    // 使用事务确保积分扣除和任务创建的原子性
    const taskUuid = crypto.randomUUID();
    const refImagesJson = JSON.stringify(validatedReferenceImages);
    let insertResult;
    try {
      insertResult = transaction(() => {
        // 在事务内扣除积分，确保原子性
        if (creditsType === 'project') {
          const updateResult = query(
            'UPDATE users SET project_credits = project_credits - ? WHERE id = ? AND project_credits >= ?',
            [totalCost, req.userId, totalCost]
          );
          if (updateResult.changes === 0) {
            throw new Error('PROJECT_CREDITS_INSUFFICIENT');
          }
        } else {
          const updateResult = query(
            'UPDATE users SET creative_credits = creative_credits - ? WHERE id = ? AND creative_credits >= ?',
            [totalCost, req.userId, totalCost]
          );
          if (updateResult.changes === 0) {
            throw new Error('CREATIVE_CREDITS_INSUFFICIENT');
          }
        }

        return query(
          `INSERT INTO generation_tasks (user_id, model_id, prompt, image_size, image_count, status, priority, credits_charged, credits_type, source, task_type, task_uuid, reference_images)
           VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, 'normal', ?, ?)`,
          [req.userId, model_id, prompt, resolvedImageSize, count, user.priority || 0, totalCost, creditsType, creditsType, taskUuid, refImagesJson]
        );
      });
    } catch (err) {
      const errMsg = (err as Error).message;
      if (errMsg === 'PROJECT_CREDITS_INSUFFICIENT') {
        return res.status(400).json({ error: `项目积分不足，需要 ${totalCost} 积分` });
      }
      if (errMsg === 'CREATIVE_CREDITS_INSUFFICIENT') {
        return res.status(400).json({ error: `创作积分不足，需要 ${totalCost} 积分` });
      }
      return res.status(500).json({ error: '创建生图任务失败' });
    }
    const taskResult = query(
      'SELECT * FROM generation_tasks WHERE id = ?',
      [insertResult.lastInsertRowid]
    );

    taskQueue.addTask(taskResult.rows[0]);

    return res.status(201).json({ task: taskResult.rows[0] });
  } catch {
    return res.status(500).json({ error: '创建生图任务失败' });
  }
});

taskRouter.get('/queue', authMiddleware, async (_req: AuthRequest, res) => {
  try {
    const result = query(
      "SELECT COUNT(*) as queued_count FROM generation_tasks WHERE status = 'queued'"
    );
    const processing = query(
      "SELECT COUNT(*) as processing_count FROM generation_tasks WHERE status = 'processing'"
    );
    return res.json({
      queued: parseInt(result.rows[0].queued_count),
      processing: parseInt(processing.rows[0].processing_count),
    });
  } catch {
    return res.status(500).json({ error: '获取队列状态失败' });
  }
});

taskRouter.get('/history', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;
    const source = req.query.source as string;

    let whereClause = 'WHERE t.user_id = ?';
    const params: any[] = [req.userId];

    if (source && (source === 'creative' || source === 'project' || source === 'product')) {
      whereClause += ' AND t.source = ?';
      params.push(source);
    }

    const result = query(
      `SELECT t.*, m.display_name as model_name
       FROM generation_tasks t LEFT JOIN models m ON t.model_id = m.id
       ${whereClause}
       ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const normalizedRows = normalizeStaleProductTasks(result.rows);
    const countResult = query(
      `SELECT COUNT(*) as count FROM generation_tasks t ${whereClause}`,
      params
    );

    return res.json({
      tasks: normalizedRows,
      total: parseInt(countResult.rows[0].count),
      page,
      limit,
    });

  } catch {
    return res.status(500).json({ error: '获取历史记录失败' });
  }
});

taskRouter.post('/:id/retry', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const taskResult = query(
      'SELECT * FROM generation_tasks WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    const task = taskResult.rows[0];
    if (!task) {
      return res.status(404).json({ error: '任务不存在' });
    }
    if (task.status !== 'failed') {
      return res.status(400).json({ error: '只能重试失败的任务' });
    }

    const model = query('SELECT * FROM models WHERE id = ? AND is_active = 1', [task.model_id]).rows[0];
    if (!model) return res.status(400).json({ error: '模型不存在或已停用' });
    try {
      validateQueuedGeneration(model, task.reference_images, task.image_size);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }

    const userResult = query(
      `SELECT u.credits, u.creative_credits, u.project_credits, u.group_id, g.max_concurrent
       FROM users u LEFT JOIN permission_groups g ON u.group_id = g.id
       WHERE u.id = ?`,
      [req.userId]
    );
    const user = userResult.rows[0];

    const activeCount = query(
      "SELECT COUNT(*) as count FROM generation_tasks WHERE user_id = ? AND status IN ('queued', 'processing')",
      [req.userId]
    );
    if (parseInt(activeCount.rows[0].count) >= (user.max_concurrent || 2)) {
      return res.status(429).json({ error: '已达到最大并发任务数' });
    }

    const totalCost = task.credits_charged;
    const creditsType = task.credits_type || 'creative';
    const availableCredits = creditsType === 'project' ? (user.project_credits || 0) : (user.creative_credits || 0);
    if (availableCredits < totalCost) {
      const creditsTypeName = creditsType === 'project' ? '项目' : '创作';
      return res.status(400).json({ error: `${creditsTypeName}积分不足，需要 ${totalCost} 积分` });
    }

    // 将积分扣除和任务重试放入同一事务，确保原子性
    try {
      transaction(() => {
        // 在事务内扣除积分
        if (creditsType === 'project') {
          const updateResult = query(
            'UPDATE users SET project_credits = project_credits - ? WHERE id = ? AND project_credits >= ?',
            [totalCost, req.userId, totalCost]
          );
          if (updateResult.changes === 0) {
            throw new Error('PROJECT_CREDITS_INSUFFICIENT');
          }
        } else {
          const updateResult = query(
            'UPDATE users SET creative_credits = creative_credits - ? WHERE id = ? AND creative_credits >= ?',
            [totalCost, req.userId, totalCost]
          );
          if (updateResult.changes === 0) {
            throw new Error('CREATIVE_CREDITS_INSUFFICIENT');
          }
        }

        query(
          "UPDATE generation_tasks SET status = 'queued', error_message = NULL, retry_count = 0, retry_errors = '[]', result_images = '[]', started_at = NULL, completed_at = NULL, task_uuid = ? WHERE id = ?",
          [crypto.randomUUID(), task.id]
        );
      });
    } catch (err) {
      const errMsg = (err as Error).message;
      if (errMsg === 'PROJECT_CREDITS_INSUFFICIENT') {
        return res.status(400).json({ error: `项目积分不足，需要 ${totalCost} 积分` });
      }
      if (errMsg === 'CREATIVE_CREDITS_INSUFFICIENT') {
        return res.status(400).json({ error: `创作积分不足，需要 ${totalCost} 积分` });
      }
      return res.status(500).json({ error: '重试任务失败' });
    }

    const updatedTask = query('SELECT * FROM generation_tasks WHERE id = ?', [task.id]);
    taskQueue.addTask(updatedTask.rows[0]);

    return res.json({ task: updatedTask.rows[0] });
  } catch {
    return res.status(500).json({ error: '重试任务失败' });
  }
});

taskRouter.get('/pinned', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = query(
      'SELECT task_id FROM pinned_tasks WHERE user_id = ?',
      [req.userId]
    );
    return res.json({ pinned_ids: result.rows.map((r: any) => r.task_id) });
  } catch {
    return res.status(500).json({ error: '获取置顶列表失败' });
  }
});

taskRouter.post('/:id/pin', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.id;
    const taskResult = query(
      'SELECT id FROM generation_tasks WHERE id = ? AND user_id = ?',
      [taskId, req.userId]
    );
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: '任务不存在' });
    }

    query(
      'INSERT OR IGNORE INTO pinned_tasks (user_id, task_id) VALUES (?, ?)',
      [req.userId, taskId]
    );
    return res.json({ message: '已置顶' });
  } catch {
    return res.status(500).json({ error: '置顶失败' });
  }
});

taskRouter.delete('/:id/pin', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.id;
    query(
      'DELETE FROM pinned_tasks WHERE user_id = ? AND task_id = ?',
      [req.userId, taskId]
    );
    return res.json({ message: '已取消置顶' });
  } catch {
    return res.status(500).json({ error: '取消置顶失败' });
  }
});
