import { Router } from 'express';
import { query } from '../db/index.js';
import { authMiddleware, adminMiddlewareRealtime, AuthRequest } from '../middleware/auth.js';
import { encrypt } from '../services/crypto.js';

export const workspaceAdminRouter = Router();

workspaceAdminRouter.use(authMiddleware, adminMiddlewareRealtime);

workspaceAdminRouter.get('/chat-apis', async (_req, res) => {
  try {
    const result = query('SELECT id, name, endpoint, model, format_type, status, max_concurrent, max_retries, api_timeout, created_at FROM chat_api_configs ORDER BY created_at DESC');
    return res.json({ apis: result.rows });
  } catch {
    return res.status(500).json({ error: '获取对话API列表失败' });
  }
});

workspaceAdminRouter.post('/chat-apis', async (req, res) => {
  try {
    const { name, endpoint, model, api_key, format_type, status, max_concurrent, max_retries, api_timeout } = req.body;
    if (!name || !endpoint || !model || !api_key) {
      return res.status(400).json({ error: '名称、接口地址、模型标识和 API Key 不能为空' });
    }
    const result = query(
      `INSERT INTO chat_api_configs (name, endpoint, model, api_key, format_type, status, max_concurrent, max_retries, api_timeout) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name, endpoint, model, encrypt(api_key), format_type || 'openai', status || 'active', max_concurrent || 5, max_retries || 3, api_timeout || 120]
    );
    const created = query('SELECT id, name, endpoint, model, format_type, status, max_concurrent, max_retries, api_timeout, created_at FROM chat_api_configs WHERE id = ?', [result.lastInsertRowid]);
    return res.status(201).json({ api: created.rows[0] });
  } catch {
    return res.status(500).json({ error: '创建对话API失败' });
  }
});

workspaceAdminRouter.patch('/chat-apis/:id', async (req, res) => {
  try {
    const { name, endpoint, model, api_key, format_type, status, max_concurrent, max_retries, api_timeout } = req.body;
    const existing = query('SELECT id FROM chat_api_configs WHERE id = ?', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: '对话API不存在' });

    const fields: string[] = [];
    const params: any[] = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (endpoint !== undefined) { fields.push('endpoint = ?'); params.push(endpoint); }
    if (model !== undefined) { fields.push('model = ?'); params.push(model); }
    if (api_key !== undefined) { fields.push('api_key = ?'); params.push(encrypt(api_key)); }
    if (format_type !== undefined) { fields.push('format_type = ?'); params.push(format_type); }
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }
    if (max_concurrent !== undefined) { fields.push('max_concurrent = ?'); params.push(max_concurrent); }
    if (max_retries !== undefined) { fields.push('max_retries = ?'); params.push(max_retries); }
    if (api_timeout !== undefined) { fields.push('api_timeout = ?'); params.push(api_timeout); }
    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    query(`UPDATE chat_api_configs SET ${fields.join(', ')} WHERE id = ?`, params);
    return res.json({ message: '已更新' });
  } catch {
    return res.status(500).json({ error: '更新对话API失败' });
  }
});

workspaceAdminRouter.delete('/chat-apis/:id', async (req, res) => {
  try {
    const existing = query('SELECT id FROM chat_api_configs WHERE id = ?', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: '对话API不存在' });

    query('DELETE FROM chat_api_configs WHERE id = ?', [req.params.id]);
    return res.json({ message: '已删除' });
  } catch {
    return res.status(500).json({ error: '删除对话API失败' });
  }
});

workspaceAdminRouter.get('/templates', async (req, res) => {
  try {
    const type = req.query.type as string;
    let sql = `SELECT pt.*, c.name as api_name FROM prompt_templates pt LEFT JOIN chat_api_configs c ON pt.chat_api_id = c.id`;
    const params: any[] = [];
    if (type) { sql += ' WHERE pt.type = ?'; params.push(type); }
    sql += ' ORDER BY pt.created_at DESC';
    const result = query(sql, params);
    return res.json({ templates: result.rows });
  } catch {
    return res.status(500).json({ error: '获取模板列表失败' });
  }
});

workspaceAdminRouter.post('/templates', async (req, res) => {
  try {
    const { type, name, content, chat_api_id, fission_count } = req.body;
    if (!type || !name || !content || !chat_api_id) {
      return res.status(400).json({ error: '模板类型、名称、内容和关联API不能为空' });
    }
    if (!['fission', 'deepen', 'regenerate', 'extract', 'translate'].includes(type)) {
      return res.status(400).json({ error: '模板类型必须为 fission / deepen / regenerate / extract / translate' });
    }

    const result = query(
      `INSERT INTO prompt_templates (type, name, content, chat_api_id, fission_count) VALUES (?, ?, ?, ?, ?)`,
      [type, name, content, chat_api_id, fission_count || null]
    );
    const created = query(
      `SELECT pt.*, c.name as api_name FROM prompt_templates pt LEFT JOIN chat_api_configs c ON pt.chat_api_id = c.id WHERE pt.id = ?`,
      [result.lastInsertRowid]
    );
    return res.status(201).json({ template: created.rows[0] });
  } catch {
    return res.status(500).json({ error: '创建模板失败' });
  }
});

workspaceAdminRouter.patch('/templates/:id', async (req, res) => {
  try {
    const existing = query('SELECT id FROM prompt_templates WHERE id = ?', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: '模板不存在' });

    const { name, content, chat_api_id, fission_count, status } = req.body;
    const fields: string[] = [];
    const params: any[] = [];
    if (name !== undefined) { fields.push('name = ?'); params.push(name); }
    if (content !== undefined) { fields.push('content = ?'); params.push(content); }
    if (chat_api_id !== undefined) { fields.push('chat_api_id = ?'); params.push(chat_api_id); }
    if (fission_count !== undefined) { fields.push('fission_count = ?'); params.push(fission_count); }
    if (status !== undefined) { fields.push('status = ?'); params.push(status); }
    fields.push('updated_at = CURRENT_TIMESTAMP');
    params.push(req.params.id);

    query(`UPDATE prompt_templates SET ${fields.join(', ')} WHERE id = ?`, params);
    return res.json({ message: '已更新' });
  } catch {
    return res.status(500).json({ error: '更新模板失败' });
  }
});

workspaceAdminRouter.delete('/templates/:id', async (req, res) => {
  try {
    const existing = query('SELECT id FROM prompt_templates WHERE id = ?', [req.params.id]);
    if (!existing.rows[0]) return res.status(404).json({ error: '模板不存在' });

    const workspaceTaskReferences = query(
      'SELECT COUNT(*) as count FROM workspace_tasks WHERE template_id = ?',
      [req.params.id]
    );
    const chatTaskReferences = query(
      'SELECT COUNT(*) as count FROM chat_tasks WHERE template_id = ?',
      [req.params.id]
    );
    const referenceCount = Number(workspaceTaskReferences.rows[0]?.count || 0) + Number(chatTaskReferences.rows[0]?.count || 0);
    if (referenceCount > 0) {
      return res.status(409).json({ error: '模板已被任务引用，无法删除' });
    }

    const deleted = query('DELETE FROM prompt_templates WHERE id = ?', [req.params.id]);
    if (deleted.changes !== 1) return res.status(404).json({ error: '模板不存在' });
    return res.json({ message: '已删除' });
  } catch (error: any) {
    if (error?.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
      return res.status(409).json({ error: '模板已被任务引用，无法删除' });
    }
    return res.status(500).json({ error: '删除模板失败' });
  }
});

workspaceAdminRouter.get('/workspace-logs', async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.page_size as string) || 50;
    const offset = (page - 1) * pageSize;
    const apiType = req.query.api_type as string;
    const status = req.query.status as string;
    const generationTaskId = req.query.generation_task_id as string;

    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (apiType) { where += ' AND l.api_type = ?'; params.push(apiType); }
    if (status) { where += ' AND l.response_status = ?'; params.push(status); }
    if (generationTaskId && /^\d+$/.test(generationTaskId)) { where += ' AND l.generation_task_id = ?'; params.push(generationTaskId); }

    const logs = query(
      `SELECT l.*, u.username FROM workspace_api_logs l LEFT JOIN users u ON l.user_id = u.id
       ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const total = query(`SELECT COUNT(*) as count FROM workspace_api_logs l ${where}`, params);

    return res.json({
      logs: logs.rows,
      total: parseInt(total.rows[0].count),
      page,
      page_size: pageSize,
    });
  } catch {
    return res.status(500).json({ error: '获取工作台日志失败' });
  }
});

workspaceAdminRouter.get('/workspace-tasks', async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.page_size as string) || 20;
    const offset = (page - 1) * pageSize;
    const status = req.query.status as string;
    const search = req.query.search as string;

    let where = 'WHERE 1=1';
    const params: any[] = [];
    if (status && status !== 'all') { where += ' AND t.status = ?'; params.push(status); }
    if (search) { where += ' AND (t.title LIKE ? OR u.username LIKE ?)'; params.push(`%${search}%`, `%${search}%`); }

    const tasks = query(
      `SELECT t.*, u.username, pt.name as template_name FROM workspace_tasks t
       LEFT JOIN users u ON t.user_id = u.id
       LEFT JOIN prompt_templates pt ON t.template_id = pt.id
       ${where} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`,
      [...params, pageSize, offset]
    );
    const total = query(
      `SELECT COUNT(*) as count FROM workspace_tasks t LEFT JOIN users u ON t.user_id = u.id ${where}`,
      params
    );

    return res.json({
      tasks: tasks.rows,
      total: parseInt(total.rows[0].count),
      page,
      page_size: pageSize,
    });
  } catch {
    return res.status(500).json({ error: '获取工作台任务列表失败' });
  }
});
