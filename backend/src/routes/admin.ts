import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { query } from '../db/index.js';
import { authMiddleware, adminMiddlewareRealtime, AuthRequest } from '../middleware/auth.js';
import { testCosConnection } from '../services/cos.js';
import { encrypt, decrypt } from '../services/crypto.js';

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

/**
 * 返回给前端的设置（隐藏敏感字段）
 */
function getSystemSettingsForClient() {
  const settings = getSystemSettings();
  return {
    ...settings,
    cos_secret_key: settings.cos_secret_key ? '******' : '',
  };
}

/**
 * 获取解密后的存储设置（供内部使用）
 */
function getDecryptedStorageSettings() {
  const settings = getSystemSettings();
  return {
    ...settings,
    cos_secret_key: decrypt(settings.cos_secret_key),
  };
}

adminRouter.get('/dashboard', authMiddleware, adminMiddlewareRealtime, async (_req: AuthRequest, res) => {
  try {
    const userCount = query('SELECT COUNT(*) as count FROM users WHERE role = ?', ['user']);
    const taskCount = query('SELECT COUNT(*) as count FROM generation_tasks');
    const todayTasks = query(
      "SELECT COUNT(*) as count FROM generation_tasks WHERE date(created_at, 'localtime') >= date('now', 'localtime')"
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

adminRouter.get('/dashboard/trend', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days as string) || 7, 1), 30);
    const result = query(
      `SELECT date(created_at, 'localtime') as date, COUNT(*) as count
       FROM generation_tasks
       WHERE date(created_at, 'localtime') >= date('now', 'localtime', ? || ' days')
       GROUP BY date(created_at, 'localtime')
       ORDER BY date(created_at, 'localtime') ASC`,
      [`-${days}`]
    );
    const trendMap = Object.fromEntries(result.rows.map((row: any) => [row.date, parseInt(row.count)]));
    const trend: { date: string; count: number }[] = [];
    const now = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      // 使用本地日期（与数据库 localtime 一致），避免 toISOString 返回 UTC 日期
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      trend.push({ date: dateStr, count: trendMap[dateStr] || 0 });
    }
    return res.json({ trend });
  } catch {
    return res.status(500).json({ error: '获取走势数据失败' });
  }
});

adminRouter.get('/dashboard/models-status', authMiddleware, adminMiddlewareRealtime, async (_req: AuthRequest, res) => {
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
      const failedCount = tasks.filter((t: any) => t.status === 'failed').length;
      const hasQueuedOrProcessing = tasks.some((t: any) => t.status === 'queued' || t.status === 'processing');
      // 只有最近5个任务中3个以上失败，或失败率超过50%才标记为error
      const recent5Failed = tasks.slice(0, 5).filter((t: any) => t.status === 'failed').length;
      let status: 'normal' | 'queued' | 'error' = 'normal';
      if (recent5Failed >= 3 || (tasks.length >= 5 && failedCount / tasks.length > 0.5)) status = 'error';
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

adminRouter.get('/settings/storage', authMiddleware, adminMiddlewareRealtime, async (_req: AuthRequest, res) => {
  try {
    return res.json({ settings: getSystemSettingsForClient() });
  } catch {
    return res.status(500).json({ error: '获取存储设置失败' });
  }
});

adminRouter.put('/settings/storage', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
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

    console.log('[存储设置] 保存请求:', {
      storage_provider,
      cos_secret_id: cos_secret_id ? `${String(cos_secret_id).substring(0, 4)}***` : '(empty)',
      cos_secret_key: cos_secret_key ? (cos_secret_key === '******' ? '(masked)' : '(new value)') : '(empty)',
      cos_bucket,
      cos_region,
      cos_base_url,
    });

    // 获取当前设置，用于判断是否需要更新 secret_key
    const currentSettings = getSystemSettings();

    const settings: Record<string, string> = {
      storage_provider: storage_provider === 'cos' ? 'cos' : 'local',
      cos_secret_id: String(cos_secret_id || ''),
      cos_bucket: String(cos_bucket || ''),
      cos_region: String(cos_region || ''),
      cos_base_url: String(cos_base_url || ''),
      cos_image_prefix: String(cos_image_prefix || 'image/'),
      local_image_prefix: String(local_image_prefix || 'image/'),
    };

    // 仅当提供了非掩码值时才更新 secret_key
    if (cos_secret_key && cos_secret_key !== '******') {
      settings.cos_secret_key = encrypt(String(cos_secret_key));
    } else {
      settings.cos_secret_key = currentSettings.cos_secret_key;
    }

    Object.entries(settings).forEach(([key, value]) => {
      query(
        `INSERT INTO system_settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
        [key, value]
      );
    });

    return res.json({ settings: getSystemSettingsForClient() });
  } catch (err) {
    console.error('[存储设置] 保存失败:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : '保存存储设置失败' });
  }
});

adminRouter.post('/settings/storage/test-cos', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
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

    // 如果前端传来的是掩码值，使用已存储的解密值
    const currentDecrypted = getDecryptedStorageSettings();
    const actualSecretKey = (!cos_secret_key || cos_secret_key === '******')
      ? currentDecrypted.cos_secret_key
      : String(cos_secret_key);

    const result = await testCosConnection({
      storage_provider: storage_provider === 'cos' ? 'cos' : 'local',
      cos_secret_id: String(cos_secret_id || currentDecrypted.cos_secret_id),
      cos_secret_key: actualSecretKey,
      cos_bucket: String(cos_bucket || currentDecrypted.cos_bucket),
      cos_region: String(cos_region || currentDecrypted.cos_region),
      cos_base_url: String(cos_base_url || currentDecrypted.cos_base_url),
      cos_image_prefix: String(cos_image_prefix || currentDecrypted.cos_image_prefix || 'image/'),
      local_image_prefix: String(local_image_prefix || currentDecrypted.local_image_prefix || 'image/'),
    });

    return res.json(result);
  } catch (err) {
    return res.status(400).json({ error: err instanceof Error ? err.message : 'COS 测试失败' });
  }
});

adminRouter.get('/groups', authMiddleware, adminMiddlewareRealtime, async (_req: AuthRequest, res) => {
  try {
    const result = query('SELECT * FROM permission_groups ORDER BY priority DESC');
    return res.json({ groups: result.rows });
  } catch {
    return res.status(500).json({ error: '获取权限组失败' });
  }
});

adminRouter.post('/groups', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
  try {
    const { name, description, max_credits, daily_credits, initial_creative_credits, initial_project_credits, max_concurrent, priority, allowed_models, allowed_pages } = req.body;
    query(
      `INSERT INTO permission_groups (name, description, max_credits, daily_credits, initial_creative_credits, initial_project_credits, max_concurrent, priority, allowed_models, allowed_pages)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, description || 'user', max_credits || 100, daily_credits || 0, initial_creative_credits || 0, initial_project_credits || 0, max_concurrent || 2, priority || 0, JSON.stringify(allowed_models || []), JSON.stringify(allowed_pages || [])]
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

adminRouter.put('/groups/:id', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
  try {
    const { name, description, max_credits, daily_credits, initial_creative_credits, initial_project_credits, max_concurrent, priority, allowed_models, allowed_pages } = req.body;
    query(
      `UPDATE permission_groups SET name = COALESCE(?, name), description = COALESCE(?, description),
       max_credits = COALESCE(?, max_credits), daily_credits = COALESCE(?, daily_credits),
       initial_creative_credits = COALESCE(?, initial_creative_credits), initial_project_credits = COALESCE(?, initial_project_credits),
       max_concurrent = COALESCE(?, max_concurrent), priority = COALESCE(?, priority),
       allowed_models = COALESCE(?, allowed_models), allowed_pages = COALESCE(?, allowed_pages),
       updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [name, description, max_credits, daily_credits, initial_creative_credits, initial_project_credits, max_concurrent, priority, JSON.stringify(allowed_models), JSON.stringify(allowed_pages), req.params.id]
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

adminRouter.delete('/groups/:id', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
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

adminRouter.get('/images', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
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
      whereClause += " AND date(t.created_at, 'localtime') >= ?";
      params.push(startDate);
    }
    if (endDate) {
      whereClause += " AND date(t.created_at, 'localtime') <= ?";
      params.push(endDate);
    }

    const result = query(
      `SELECT t.id, t.prompt, t.status, t.result_images, t.image_size, t.created_at, t.started_at, t.completed_at,
       u.username, m.display_name as model_name
       FROM generation_tasks t
       JOIN users u ON t.user_id = u.id
       LEFT JOIN models m ON t.model_id = m.id
       ${whereClause}
       ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const totalResult = query(
      `SELECT COUNT(*) as count
       FROM generation_tasks t
       JOIN users u ON t.user_id = u.id
       ${whereClause}`,
      params
    );
    const total = parseInt(totalResult.rows[0].count);
    return res.json({ images: result.rows, total, page, limit });
  } catch {
    return res.status(500).json({ error: '获取图片列表失败' });
  }
});

adminRouter.get('/logs/login', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const result = query(
      `SELECT l.*, u.username FROM login_logs l JOIN users u ON l.user_id = u.id ORDER BY l.login_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const total = query('SELECT COUNT(*) as count FROM login_logs');
    return res.json({ logs: result.rows, total: parseInt(total.rows[0].count), page, limit });
  } catch {
    return res.status(500).json({ error: '获取登录日志失败' });
  }
});

adminRouter.get('/logs/chat', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const result = query(
      `SELECT l.*, u.username
       FROM workspace_api_logs l
       LEFT JOIN users u ON l.user_id = u.id
       WHERE l.api_type != 'image'
       ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const total = query("SELECT COUNT(*) as count FROM workspace_api_logs WHERE api_type != 'image'");
    return res.json({ logs: result.rows, total: parseInt(total.rows[0].count), page, limit });
  } catch {
    return res.status(500).json({ error: '获取对话日志失败' });
  }
});

adminRouter.get('/logs/tasks', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    const result = query(
      `SELECT t.id, t.prompt, t.status, t.credits_charged, t.credits_type, t.source, t.task_type, t.retry_count, t.error_message, t.retry_errors,
       t.image_size, t.image_count, t.result_images, t.created_at, t.started_at, t.completed_at,
       u.username, m.display_name as model_name
       FROM generation_tasks t
       JOIN users u ON t.user_id = u.id
       LEFT JOIN models m ON t.model_id = m.id
       ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    const total = query('SELECT COUNT(*) as count FROM generation_tasks');
    return res.json({ tasks: result.rows, total: parseInt(total.rows[0].count), page, limit });
  } catch {
    return res.status(500).json({ error: '获取任务日志失败' });
  }
});

adminRouter.get('/logs/tasks/:id', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
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

adminRouter.delete('/logs/tasks/:id', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
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
    query('UPDATE card_images SET generation_task_id = NULL WHERE generation_task_id = ?', [taskId]);
    query('DELETE FROM generation_tasks WHERE id = ?', [taskId]);

    return res.json({ message: '任务及关联图片已删除' });
  } catch {
    return res.status(500).json({ error: '删除任务失败' });
  }
});

// 系统设置 API
adminRouter.get('/settings', authMiddleware, adminMiddlewareRealtime, async (_req: AuthRequest, res) => {
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

adminRouter.put('/settings', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
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
