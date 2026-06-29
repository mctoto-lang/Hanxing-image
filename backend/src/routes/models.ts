import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { query } from '../db/index.js';
import { authMiddleware, adminMiddlewareRealtime, AuthRequest } from '../middleware/auth.js';
import { encrypt } from '../services/crypto.js';

export const modelRouter = Router();

// 确保图标上传目录存在
const iconsDir = path.resolve(process.cwd(), 'uploads/icons');
if (!fs.existsSync(iconsDir)) {
  fs.mkdirSync(iconsDir, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: 'uploads/icons/',
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `model-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 1 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.png', '.jpg', '.jpeg', '.svg', '.webp'];
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, allowed.includes(ext));
  },
});

modelRouter.get('/', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const source = req.query.source as string;
    const page = req.query.page as string;
    let whereClause = 'WHERE is_active = true';

    if (source === 'generate' || page === 'generate') {
      whereClause += ' AND visible_in_generate = 1';
    } else if (source === 'canvas' || page === 'canvas') {
      whereClause += ' AND visible_in_canvas = 1';
    } else if (source === 'workspace' || page === 'workspace') {
      whereClause += ' AND visible_in_workspace = 1';
    } else if (page === 'product') {
      whereClause += ' AND visible_in_product = 1';
    }

    const result = query(
      `SELECT id, name, display_name, api_endpoint, icon_url, supported_sizes, cost_per_image, max_concurrent, max_retries, api_timeout, task_timeout, default_image_count, is_active, visible_in_generate, visible_in_canvas, visible_in_workspace, visible_in_product, supports_reference_image, max_reference_images, api_format, extra_config FROM models ${whereClause} ORDER BY id`
    );

    // 根据用户权限组过滤模型
    let models = result.rows;
    if (req.userId) {
      const userResult = query(
        'SELECT u.group_id, g.allowed_models FROM users u LEFT JOIN permission_groups g ON u.group_id = g.id WHERE u.id = ?',
        [req.userId]
      );
      const user = userResult.rows[0];
      const allowedModels: string[] = user?.allowed_models || [];
      if (allowedModels.length > 0) {
        // allowed_models 存储的是模型ID字符串数组
        models = models.filter((m: any) => allowedModels.includes(String(m.id)));
      }
    }

    // 对于 product 页面，直接返回数组而不是对象
    if (page === 'product') {
      return res.json(models);
    }
    
    return res.json({ models });
  } catch {
    return res.status(500).json({ error: '获取模型列表失败' });
  }
});

modelRouter.get('/all', authMiddleware, adminMiddlewareRealtime, async (_req: AuthRequest, res) => {
  try {
    const result = query(
      'SELECT id, name, display_name, api_endpoint, icon_url, supported_sizes, cost_per_image, max_concurrent, max_retries, api_timeout, task_timeout, default_image_count, is_active, visible_in_generate, visible_in_canvas, visible_in_workspace, visible_in_product, supports_reference_image, max_reference_images, reference_image_field, api_format, extra_config FROM models ORDER BY id'
    );
    return res.json({ models: result.rows });
  } catch {
    return res.status(500).json({ error: '获取模型列表失败' });
  }
});

modelRouter.post('/', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
  try {
    const { name, display_name, api_endpoint, api_key, cost_per_image, max_concurrent, max_retries, api_timeout, task_timeout, icon_url, supported_sizes, visible_in_generate, visible_in_canvas, visible_in_workspace, visible_in_product, supports_reference_image, max_reference_images, reference_image_field, api_format, extra_config, default_image_count } = req.body;
    const insertResult = query(
      'INSERT INTO models (name, display_name, api_endpoint, api_key_encrypted, cost_per_image, max_concurrent, max_retries, api_timeout, task_timeout, icon_url, supported_sizes, visible_in_generate, visible_in_canvas, visible_in_workspace, visible_in_product, supports_reference_image, max_reference_images, reference_image_field, api_format, extra_config, default_image_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [name, display_name, api_endpoint, api_key ? encrypt(api_key) : null, cost_per_image || 1, max_concurrent || 5, max_retries || 3, api_timeout || 120, task_timeout || 0, icon_url || null, supported_sizes || null, visible_in_generate !== false ? 1 : 0, visible_in_canvas !== false ? 1 : 0, visible_in_workspace !== false ? 1 : 0, visible_in_product ? 1 : 0, supports_reference_image ? 1 : 0, max_reference_images || 1, reference_image_field || 'image_url', api_format || 'openai', extra_config || '{}', default_image_count || 1]
    );
    const result = query(
      'SELECT id, name, display_name, icon_url, supported_sizes, cost_per_image, max_concurrent, max_retries, api_timeout, task_timeout, default_image_count, visible_in_generate, visible_in_canvas, visible_in_workspace, visible_in_product, supports_reference_image, max_reference_images, reference_image_field, api_format, extra_config FROM models WHERE id = ?',
      [insertResult.lastInsertRowid]
    );
    return res.status(201).json({ model: result.rows[0] });
  } catch (err) {
    if ((err as any).message?.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: '该模型标识与接口地址的组合已存在' });
    }
    return res.status(500).json({ error: '创建模型失败' });
  }
});

modelRouter.put('/:id', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
  try {
    const { name, display_name, api_endpoint, api_key, cost_per_image, max_concurrent, max_retries, api_timeout, task_timeout, is_active, icon_url, supported_sizes, visible_in_generate, visible_in_canvas, visible_in_workspace, visible_in_product, supports_reference_image, max_reference_images, reference_image_field, api_format, extra_config, default_image_count } = req.body;
    
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    
    if (name !== undefined) { updateFields.push('name = COALESCE(NULLIF(?, \'\'), name)'); updateValues.push(name); }
    if (display_name !== undefined) { updateFields.push('display_name = COALESCE(NULLIF(?, \'\'), display_name)'); updateValues.push(display_name); }
    if (api_endpoint !== undefined) { updateFields.push('api_endpoint = COALESCE(NULLIF(?, \'\'), api_endpoint)'); updateValues.push(api_endpoint); }
    if (api_key !== undefined && api_key !== '') { updateFields.push('api_key_encrypted = ?'); updateValues.push(encrypt(api_key)); }
    if (cost_per_image !== undefined) { updateFields.push('cost_per_image = ?'); updateValues.push(cost_per_image); }
    if (max_concurrent !== undefined) { updateFields.push('max_concurrent = ?'); updateValues.push(max_concurrent); }
    if (max_retries !== undefined) { updateFields.push('max_retries = ?'); updateValues.push(max_retries); }
    if (api_timeout !== undefined) { updateFields.push('api_timeout = ?'); updateValues.push(api_timeout); }
    if (task_timeout !== undefined) { updateFields.push('task_timeout = ?'); updateValues.push(task_timeout); }
    if (is_active !== undefined) { updateFields.push('is_active = ?'); updateValues.push(is_active); }
    if (icon_url !== undefined) { updateFields.push('icon_url = ?'); updateValues.push(icon_url); }
    if (supported_sizes !== undefined) { updateFields.push('supported_sizes = ?'); updateValues.push(supported_sizes); }
    if (visible_in_generate !== undefined) { updateFields.push('visible_in_generate = ?'); updateValues.push(visible_in_generate ? 1 : 0); }
    if (visible_in_canvas !== undefined) { updateFields.push('visible_in_canvas = ?'); updateValues.push(visible_in_canvas ? 1 : 0); }
    if (visible_in_workspace !== undefined) { updateFields.push('visible_in_workspace = ?'); updateValues.push(visible_in_workspace ? 1 : 0); }
    if (visible_in_product !== undefined) { updateFields.push('visible_in_product = ?'); updateValues.push(visible_in_product ? 1 : 0); }
    if (supports_reference_image !== undefined) { updateFields.push('supports_reference_image = ?'); updateValues.push(supports_reference_image ? 1 : 0); }
    if (max_reference_images !== undefined) { updateFields.push('max_reference_images = ?'); updateValues.push(max_reference_images); }
    if (reference_image_field !== undefined) { updateFields.push('reference_image_field = ?'); updateValues.push(reference_image_field); }
    if (api_format !== undefined) { updateFields.push('api_format = ?'); updateValues.push(api_format); }
    if (extra_config !== undefined) { updateFields.push('extra_config = ?'); updateValues.push(extra_config); }
    if (default_image_count !== undefined) { updateFields.push('default_image_count = ?'); updateValues.push(default_image_count); }
    
    if (updateFields.length === 0) {
      return res.status(400).json({ error: '未提供更新数据' });
    }
    
    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(req.params.id);
    
    query(
      `UPDATE models SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );
    const result = query(
      'SELECT id, name, display_name, api_endpoint, icon_url, supported_sizes, cost_per_image, max_concurrent, max_retries, api_timeout, task_timeout, default_image_count, is_active, visible_in_generate, visible_in_canvas, visible_in_workspace, visible_in_product, supports_reference_image, max_reference_images, reference_image_field, api_format, extra_config FROM models WHERE id = ?',
      [req.params.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: '模型不存在' });
    }
    return res.json({ model: result.rows[0] });
  } catch {
    return res.status(500).json({ error: '更新模型失败' });
  }
});

modelRouter.delete('/:id', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
  try {
    const modelId = req.params.id;
    // 始终软删除（禁用模型），保留数据完整性
    const result = query('UPDATE models SET is_active = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [modelId]);
    if (result.changes === 0) {
      return res.status(404).json({ error: '模型不存在' });
    }
    return res.json({ message: '模型已禁用' });
  } catch {
    return res.status(500).json({ error: '禁用模型失败' });
  }
});

modelRouter.post('/:id/icon', authMiddleware, adminMiddlewareRealtime, upload.single('icon'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传图标文件' });
    }
    const iconUrl = `/uploads/icons/${req.file.filename}`;
    query('UPDATE models SET icon_url = ? WHERE id = ?', [iconUrl, req.params.id]);
    return res.json({ icon_url: iconUrl });
  } catch {
    return res.status(500).json({ error: '图标上传失败' });
  }
});
