import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { query } from '../db/index.js';
import { authMiddleware, adminMiddleware, AuthRequest } from '../middleware/auth.js';
import { testCosConnection } from '../services/cos.js';

export const adminRouter = Router();

function getSystemSettings() {
  const result = query('SELECT key, value FROM system_settings');
  const map = Object.fromEntries(result.rows.map((row) => [row.key, row.value ?? '']));
  return {
    storage_provider: map.storage_provider || 'local',
    cos_secret_id: map.cos_secret_id || '',
    cos_secret_key: map.cos_secret_key || '',
    cos_bucket: map.cos_bucket || '',
    cos_region: map.cos_region || '',
    cos_base_url: map.cos_base_url || '',
    cos_image_prefix: map.cos_image_prefix || 'image/',
    local_image_prefix: map.local_image_prefix || 'image/',
  };
}

adminRouter.get('/dashboard', authMiddleware, adminMiddleware, async (_req: AuthRequest, res) => {
  try {
    const userCount = query('SELECT COUNT(*) as count FROM users WHERE role = ?', ['user']);
    const taskCount = query('SELECT COUNT(*) as count FROM generation_tasks');
    const todayTasks = query(
      "SELECT COUNT(*) as count FROM generation_tasks WHERE created_at >= date('now')"
    );
    const queuedTasks = query(
      "SELECT COUNT(*) as count FROM generation_tasks WHERE status = 'queued'"
    );
    return res.json({
      totalUsers: parseInt(userCount.rows[0].count),
      totalTasks: parseInt(taskCount.rows[0].count),
      todayTasks: parseInt(todayTasks.rows[0].count),
      queuedTasks: parseInt(queuedTasks.rows[0].count),
    });
  } catch {
    return res.status(500).json({ error: '获取仪表盘数据失败' });
  }
});

adminRouter.get('/dashboard/trend', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 7, 1), 30);
    const result = query(
      `SELECT date(created_at) as date, COUNT(*) as count
       FROM generation_tasks
       WHERE created_at >= date('now', ? || ' days')
       GROUP BY date(created_at)
       ORDER BY date(created_at) ASC`,
      [`-${days}`]
    );
    const trendMap = Object.fromEntries(result.rows.map((row: any) => [row.date, parseInt(row.count)]));
    const trend: { date: string; count: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      trend.push({ date: dateStr, count: trendMap[dateStr] || 0 });
    }
    return res.json({ trend });
  } catch {
    return res.status(500).json({ error: '获取走势数据失败' });
  }
});

adminRouter.get('/dashboard/models-status', authMiddleware, adminMiddleware, async (_req: AuthRequest, res) => {
  try {
    const models = query('SELECT id, name, display_name, icon_url, is_active FROM models ORDER BY id ASC');
    const modelsStatus = models.rows.map((model: any) => {
      const recentTasks = query(
        `SELECT t.status, t.created_at, t.completed_at, u.username
         FROM generation_tasks t
         JOIN users u ON t.user_id = u.id
         WHERE t.model_id = ?
         ORDER BY t.created_at DESC
         LIMIT 24`,
        [model.id]
      );
      const tasks = recentTasks.rows.map((task: any) => ({
        status: task.status,
        created_at: task.created_at,
        completed_at: task.completed_at,
        username: task.username,
      }));
      const hasFailed = tasks.some((t: any) => t.status === 'failed');
      const hasQueuedOrProcessing = tasks.some((t: any) => t.status === 'queued' || t.status === 'processing');
      let status: 'normal' | 'queued' | 'error' = 'normal';
      if (hasFailed) status = 'error';
      else if (hasQueuedOrProcessing) status = 'queued';
      return {
        id: model.id,
        name: model.name,
        display_name: model.display_name,
        icon_url: model.icon_url,
        is_active: model.is_active,
        status,
        recentTasks: tasks.reverse(),
      };
    });
    return res.json({ models: modelsStatus });
  } catch {
    return res.status(500).json({ error: '获取模型状态失败' });
  }
});

adminRouter.get('/settings/storage', authMiddleware, adminMiddleware, async (_req: AuthRequest, res) => {
  try {
    return res.json({ settings: getSystemSettings() });
  } catch {
    return res.status(500).json({ error: '获取存储设置失败' });
  }
});

adminRouter.put('/settings/storage', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const {
      storage_provider,
      cos_secret_id,
      cos_secret_key,
      cos_bucket,
      cos_region,
      cos_base_url,
      cos_image_prefix,
      local_image_prefix,
    } = req.body;

    const settings = {
      storage_provider: storage_provider === 'cos' ? 'cos' : 'local',
      cos_secret_id: String(cos_secret_id || ''),
      cos_secret_key: String(cos_secret_key || ''),
      cos_bucket: String(cos_bucket || ''),
      cos_region: String(cos_region || ''),
      cos_base_url: String(cos_base_url || ''),
      cos_image_prefix: String(cos_image_prefix || 'image/'),
      local_image_prefix: String(local_image_prefix || 'image/'),
    };

    Object.entries(settings).forEach(([key, value]) => {
      query(
        `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
        [key, value]
      );
    });

    return res.json({ settings: getSystemSettings() });
  } catch {
    return res.status(500).json({ error: '保存存储设置失败' });
  }
});

adminRouter.post('/settings/storage/test-cos', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const {
      storage_provider,
      cos_secret_id,
      cos_secret_key,
      cos_bucket,
      cos_region,
      cos_base_url,
      cos_image_prefix,
      local_image_prefix,
    } = req.body ?? {};

    const result = await testCosConnection({
      storage_provider: storage_provider === 'cos' ? 'cos' : 'local',
      cos_secret_id: String(cos_secret_id || ''),
      cos_secret_key: String(cos_secret_key || ''),
      cos_bucket: String(cos_bucket || ''),
      cos_region: String(cos_region || ''),
      cos_base_url: String(cos_base_url || ''),
      cos_image_prefix: String(cos_image_prefix || 'image/'),
      local_image_prefix: String(local_image_prefix || 'image/'),
    });

    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'COS 测试失败' });
  }
});

adminRouter.get('/groups', authMiddleware, adminMiddleware, async (_req: AuthRequest, res) => {
  try {
    const result = query('SELECT * FROM permission_groups ORDER BY priority DESC');
    return res.json({ groups: result.rows });
  } catch {
    return res.status(500).json({ error: '获取权限组失败' });
  }
});

adminRouter.post('/groups', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, description, max_credits, daily_credits, initial_creative_credits, initial_project_credits, max_concurrent, priority, allowed_models } = req.body;
    query(
      `INSERT INTO permission_groups (name, description, max_credits, daily_credits, initial_creative_credits, initial_project_credits, max_concurrent, priority, allowed_models)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description || 'user', max_credits || 100, daily_credits || 0, initial_creative_credits || 0, initial_project_credits || 0, max_concurrent || 2, priority || 0, JSON.stringify(allowed_models || [])]
    );
    const result = query('SELECT * FROM permission_groups WHERE name = ?', [name]);
    const group = result.rows[0];
    if (group) {
      const newRole = description === 'admin' ? 'admin' : 'user';
      query('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE group_id = ?', [newRole, group.id]);
    }
    return res.status(201).json({ group });
  } catch (err) {
    if ((err as any).message?.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: '权限组名称已存在' });
    }
    return res.status(500).json({ error: '创建权限组失败' });
  }
});

adminRouter.put('/groups/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { name, description, max_credits, daily_credits, initial_creative_credits, initial_project_credits, max_concurrent, priority, allowed_models } = req.body;
    query(
      `UPDATE permission_groups SET name = COALESCE(?, name), description = COALESCE(?, description),
       max_credits = COALESCE(?, max_credits), daily_credits = COALESCE(?, daily_credits),
       initial_creative_credits = COALESCE(?, initial_creative_credits), initial_project_credits = COALESCE(?, initial_project_credits),
       max_concurrent = COALESCE(?, max_concurrent), priority = COALESCE(?, priority),
       allowed_models = COALESCE(?, allowed_models),
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [name, description, max_credits, daily_credits, initial_creative_credits, initial_project_credits, max_concurrent, priority, JSON.stringify(allowed_models), req.params.id]
    );
    const result = query('SELECT * FROM permission_groups WHERE id = ?', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '权限组不存在' });
    }
    const group = result.rows[0];
    if (description) {
      const newRole = description === 'admin' ? 'admin' : 'user';
      query('UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE group_id = ?', [newRole, group.id]);
    }
    return res.json({ group });
  } catch {
    return res.status(500).json({ error: '更新权限组失败' });
  }
});

adminRouter.delete('/groups/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    // 检查是否有用户在该权限组中
    const userCheck = query('SELECT COUNT(*) as count FROM users WHERE group_id = ?', [req.params.id]);
    const userCount = userCheck.rows[0]?.count || 0;
    if (userCount > 0) {
      return res.status(400).json({ error: `该权限组下有 ${userCount} 个用户，请先将用户移至其他权限组` });
    }
    const result = query('DELETE FROM permission_groups WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: '权限组不存在' });
    }
    return res.json({ message: '权限组已删除' });
  } catch {
    return res.status(500).json({ error: '删除权限组失败' });
  }
});

adminRouter.get('/images', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 30;
    const offset = (page - 1) * limit;
    const username = req.query.username as string | undefined;
    const startDate = req.query.startDate as string | undefined;
    const endDate = req.query.endDate as string | undefined;

    let whereClause = "WHERE t.status = 'completed' AND t.result_images != '[]' AND t.result_images IS NOT NULL";
    const params: any[] = [];

    if (username) {
      whereClause += ' AND u.username = ?';
      params.push(username);
    }
    if (startDate) {
      whereClause += ' AND t.created_at >= ?';
      params.push(startDate);
    }
    if (endDate) {
      whereClause += ' AND t.created_at <= ?';
      params.push(endDate + ' 23:59:59');
    }

    const result = query(
      `SELECT t.id, t.prompt, t.status, t.result_images, t.created_at, t.started_at, t.completed_at,
       u.username, m.display_name as model_name
       FROM generation_tasks t
       JOIN users u ON t.user_id = u.id
       LEFT JOIN models m ON t.model_id = m.id
       ${whereClause}
       ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    return res.json({ images: result.rows, page, limit });
  } catch {
    return res.status(500).json({ error: '获取图片列表失败' });
  }
});

adminRouter.get('/logs/login', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const result = query(
      `SELECT l.*, u.username FROM login_logs l JOIN users u ON l.user_id = u.id ORDER BY l.login_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    return res.json({ logs: result.rows, page, limit });
  } catch {
    return res.status(500).json({ error: '获取登录日志失败' });
  }
});

adminRouter.get('/logs/tasks', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const result = query(
      `SELECT t.id, t.prompt, t.status, t.credits_charged, t.credits_type, t.source, t.retry_count, t.error_message, t.retry_errors,
       t.image_size, t.image_count, t.result_images, t.created_at, t.started_at, t.completed_at,
       u.username, m.display_name as model_name
       FROM generation_tasks t
       JOIN users u ON t.user_id = u.id
       LEFT JOIN models m ON t.model_id = m.id
       ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    return res.json({ logs: result.rows, page, limit });
  } catch {
    return res.status(500).json({ error: '获取任务日志失败' });
  }
});

adminRouter.get('/logs/tasks/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = query(
      `SELECT t.*, u.username, m.display_name as model_name
       FROM generation_tasks t
       JOIN users u ON t.user_id = u.id
       LEFT JOIN models m ON t.model_id = m.id
       WHERE t.id = ?`,
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '任务不存在' });
    }
    // 获取 API 调用记录
    const callLogs = query(
      'SELECT * FROM api_call_logs WHERE task_id = ? ORDER BY call_index ASC',
      [req.params.id]
    );
    const task = result.rows[0];
    task.api_call_logs = callLogs.rows;
    return res.json({ task });
  } catch {
    return res.status(500).json({ error: '获取任务详情失败' });
  }
});

adminRouter.delete('/logs/tasks/:id', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const taskId = req.params.id;
    const taskResult = query('SELECT result_images FROM generation_tasks WHERE id = ?', [taskId]);
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: '任务不存在' });
    }

    const images: string[] = taskResult.rows[0].result_images || [];
    for (const imageUrl of images) {
      if (imageUrl.startsWith('/uploads/')) {
        const filePath = path.resolve(process.cwd(), imageUrl.slice(1));
        if (fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); } catch {}
        }
      }
    }

    query('DELETE FROM api_call_logs WHERE task_id = ?', [taskId]);
    query('DELETE FROM gallery WHERE task_id = ?', [taskId]);
    query('DELETE FROM generation_tasks WHERE id = ?', [taskId]);

    return res.json({ message: '任务及关联图片已删除' });
  } catch {
    return res.status(500).json({ error: '删除任务失败' });
  }
});

adminRouter.post('/gallery/:taskId/toggle', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const taskResult = query('SELECT * FROM generation_tasks WHERE id = ?', [req.params.taskId]);
    if (taskResult.rows.length === 0) {
      return res.status(404).json({ error: '任务不存在' });
    }
    const task = taskResult.rows[0];
    const images = task.result_images || [];
    if (!images || images.length === 0) {
      return res.status(400).json({ error: '该任务没有生成的图片' });
    }
    // 检查是否所有图片都已在画廊中
    const allInGallery = images.every((imageUrl: string) => {
      const existing = query('SELECT * FROM gallery WHERE task_id = ? AND image_url = ?', [task.id, imageUrl]);
      return existing.rows.length > 0;
    });

    if (allInGallery) {
      // 全部移除
      for (const imageUrl of images) {
        query('DELETE FROM gallery WHERE task_id = ? AND image_url = ?', [task.id, imageUrl]);
      }
    } else {
      // 全部添加
      for (const imageUrl of images) {
        query('INSERT OR IGNORE INTO gallery (task_id, image_url, is_public) VALUES (?, ?, true)', [task.id, imageUrl]);
      }
    }
    return res.json({ message: '画廊状态已更新', inGallery: !allInGallery });
  } catch {
    return res.status(500).json({ error: '更新画廊状态失败' });
  }
});

// 系统设置 API
adminRouter.get('/settings', authMiddleware, adminMiddleware, async (_req: AuthRequest, res) => {
  try {
    const result = query('SELECT key, value FROM system_settings WHERE key IN (?, ?)', ['queue_green_threshold', 'queue_yellow_threshold']);
    const map = Object.fromEntries(result.rows.map((row) => [row.key, parseInt(row.value) || 10]));
    return res.json({
      queue_green_threshold: map.queue_green_threshold || 10,
      queue_yellow_threshold: map.queue_yellow_threshold || 15,
    });
  } catch {
    return res.status(500).json({ error: '获取系统设置失败' });
  }
});

adminRouter.put('/settings', authMiddleware, adminMiddleware, async (req: AuthRequest, res) => {
  try {
    const { queue_green_threshold, queue_yellow_threshold } = req.body;

    if (typeof queue_green_threshold === 'number') {
      query(
        `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
        ['queue_green_threshold', String(queue_green_threshold)]
      );
    }

    if (typeof queue_yellow_threshold === 'number') {
      query(
        `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
        ['queue_yellow_threshold', String(queue_yellow_threshold)]
      );
    }

    const result = query('SELECT key, value FROM system_settings WHERE key IN (?, ?)', ['queue_green_threshold', 'queue_yellow_threshold']);
    const map = Object.fromEntries(result.rows.map((row) => [row.key, parseInt(row.value) || 10]));
    return res.json({
      queue_green_threshold: map.queue_green_threshold || 10,
      queue_yellow_threshold: map.queue_yellow_threshold || 15,
    });
  } catch {
    return res.status(500).json({ error: '保存系统设置失败' });
  }
});
