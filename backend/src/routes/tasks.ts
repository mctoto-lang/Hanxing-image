import { Router } from 'express';
import crypto from 'crypto';
import { query } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { taskQueue } from '../services/queue.js';

export const taskRouter = Router();

taskRouter.post('/generate', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { model_id, prompt, image_size, image_count, source, reference_images } = req.body;
    if (!prompt || !model_id) {
      return res.status(400).json({ error: '提示词和模型不能为空' });
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

    const allowedModels = user.allowed_models || [];
    // allowed_models 存储的是模型ID字符串数组
    if (allowedModels.length > 0 && !allowedModels.includes(String(model.id))) {
      return res.status(403).json({ error: '当前权限组不允许使用此模型' });
    }

    const count = image_count || 1;
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

    if (creditsType === 'project') {
      const updateResult = query(
        'UPDATE users SET project_credits = project_credits - ? WHERE id = ? AND project_credits >= ?',
        [totalCost, req.userId, totalCost]
      );
      if (updateResult.changes === 0) {
        return res.status(400).json({ error: `项目积分不足，需要 ${totalCost} 积分` });
      }
    } else {
      const updateResult = query(
        'UPDATE users SET creative_credits = creative_credits - ? WHERE id = ? AND creative_credits >= ?',
        [totalCost, req.userId, totalCost]
      );
      if (updateResult.changes === 0) {
        return res.status(400).json({ error: `创作积分不足，需要 ${totalCost} 积分` });
      }
    }

    const taskUuid = crypto.randomUUID();
    const refImagesJson = JSON.stringify(Array.isArray(reference_images) ? reference_images : []);
    const insertResult = query(
      `INSERT INTO generation_tasks (user_id, model_id, prompt, image_size, image_count, status, priority, credits_charged, credits_type, source, task_uuid, reference_images)
       VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, ?, ?, ?)`,
      [req.userId, model_id, prompt, image_size || '1024x1024', count, user.priority || 0, totalCost, creditsType, creditsType, taskUuid, refImagesJson]
    );
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

    if (source && (source === 'creative' || source === 'project')) {
      whereClause += ' AND t.source = ?';
      params.push(source);
    }

    const result = query(
      `SELECT t.*, m.display_name as model_name
       FROM generation_tasks t JOIN models m ON t.model_id = m.id
       ${whereClause}
       ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const countResult = query(
      `SELECT COUNT(*) as count FROM generation_tasks t ${whereClause}`,
      params
    );
    return res.json({
      tasks: result.rows,
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

    if (creditsType === 'project') {
      const updateResult = query(
        'UPDATE users SET project_credits = project_credits - ? WHERE id = ? AND project_credits >= ?',
        [totalCost, req.userId, totalCost]
      );
      if (updateResult.changes === 0) {
        return res.status(400).json({ error: `项目积分不足，需要 ${totalCost} 积分` });
      }
    } else {
      const updateResult = query(
        'UPDATE users SET creative_credits = creative_credits - ? WHERE id = ? AND creative_credits >= ?',
        [totalCost, req.userId, totalCost]
      );
      if (updateResult.changes === 0) {
        return res.status(400).json({ error: `创作积分不足，需要 ${totalCost} 积分` });
      }
    }

    query(
      "UPDATE generation_tasks SET status = 'queued', error_message = NULL, retry_count = 0, result_images = '[]', started_at = NULL, completed_at = NULL, task_uuid = ? WHERE id = ?",
      [crypto.randomUUID(), task.id]
    );

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
