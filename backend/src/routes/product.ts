import { Router, Response, NextFunction } from 'express';
import multer from 'multer';
import { query, transaction } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { uploadImage } from '../services/cos.js';
import { taskQueue } from '../services/queue.js';
import { validateGenerationCapabilities } from '../lib/image-model-config.js';

const router = Router();

// ===== 主图模板管理 =====

const TEMPLATE_GROUP_COLORS = new Set(['slate', 'red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose']);

function selectTemplateWithGroup(templateId: number) {
  return query(`
    SELECT t.*, u.username, g.name as group_name, g.badge_color as group_badge_color
    FROM product_main_templates t
    JOIN users u ON t.user_id = u.id
    LEFT JOIN product_template_groups g ON t.group_id = g.id
    WHERE t.id = ?
  `, [templateId]);
}

router.get('/template-groups', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const result = query(
      'SELECT * FROM product_template_groups WHERE user_id = ? ORDER BY created_at ASC, id ASC',
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

router.post('/template-groups', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const { name, badge_color = 'slate' } = req.body;
    const groupName = typeof name === 'string' ? name.trim() : '';

    if (!groupName) {
      return res.status(400).json({ error: '分组名称不能为空' });
    }

    if (!TEMPLATE_GROUP_COLORS.has(badge_color)) {
      return res.status(400).json({ error: '徽标颜色参数无效' });
    }

    const result = query(`
      INSERT INTO product_template_groups (user_id, name, badge_color)
      VALUES (?, ?, ?)
    `, [userId, groupName, badge_color]);

    const group = query(
      'SELECT * FROM product_template_groups WHERE id = ?',
      [result.lastInsertRowid]
    );

    res.status(201).json(group.rows[0]);
  } catch (error: any) {
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return res.status(409).json({ error: '分组名称已存在' });
    }
    next(error);
  }
});

/**
 * GET /api/product/templates
 * 获取主图模板列表（根据权限过滤）
 */
router.get('/templates', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const isAdmin = req.userRole === 'admin';
    const scope = Array.isArray(req.query.scope) ? req.query.scope[0] : req.query.scope;
    const showAllTemplates = isAdmin && scope === 'all';

    let templates;
    if (showAllTemplates) {
      const result = query(`
        SELECT t.*, u.username, g.name as group_name, g.badge_color as group_badge_color,
          (SELECT COUNT(*) FROM product_sub_templates WHERE main_template_id = t.id) as sub_template_count
        FROM product_main_templates t
        JOIN users u ON t.user_id = u.id
        LEFT JOIN product_template_groups g ON t.group_id = g.id
        ORDER BY t.created_at DESC
      `);
      templates = result.rows;
    } else {
      const result = query(`
        SELECT t.*, u.username, g.name as group_name, g.badge_color as group_badge_color,
          (SELECT COUNT(*) FROM product_sub_templates WHERE main_template_id = t.id) as sub_template_count
        FROM product_main_templates t
        JOIN users u ON t.user_id = u.id
        LEFT JOIN product_template_groups g ON t.group_id = g.id
        WHERE t.visibility = 'public' OR t.user_id = ?
        ORDER BY t.created_at DESC
      `, [userId]);
      templates = result.rows;
    }

    res.json(templates);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/product/templates/:id
 * 获取主图模板详情（含所有小模板）
 */
router.get('/templates/:id', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const templateId = parseInt((Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) || "0");
    const userId = req.userId!;
    const isAdmin = req.userRole === 'admin';
    const scope = Array.isArray(req.query.scope) ? req.query.scope[0] : req.query.scope;
    const showAllTemplates = isAdmin && scope === 'all';

    // 查询主模板
    const templateResult = selectTemplateWithGroup(templateId);

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: '模板不存在' });
    }

    const template = templateResult.rows[0];

    if (template.visibility === 'private' && template.user_id !== userId && !showAllTemplates) {
      return res.status(403).json({ error: '无权访问此模板' });
    }

    // 查询所有小模板
    const subTemplatesResult = query(
      'SELECT * FROM product_sub_templates WHERE main_template_id = ? ORDER BY sort_order, id',
      [templateId]
    );

    res.json({
      ...template,
      sub_templates: subTemplatesResult.rows
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/product/templates
 * 创建主图模板
 */
router.post('/templates', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const { name, description, visibility = 'private', group_id } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: '模板名称不能为空' });
    }

    if (!['private', 'public'].includes(visibility)) {
      return res.status(400).json({ error: '可见性参数无效' });
    }

    const groupId = Number(group_id);
    if (!Number.isInteger(groupId) || groupId <= 0) {
      return res.status(400).json({ error: '请选择模板分组' });
    }

    const groupResult = query(
      'SELECT id FROM product_template_groups WHERE id = ? AND user_id = ?',
      [groupId, userId]
    );
    if (groupResult.rows.length === 0) {
      return res.status(400).json({ error: '模板分组不存在' });
    }

    const result = query(`
      INSERT INTO product_main_templates (user_id, group_id, name, description, visibility)
      VALUES (?, ?, ?, ?, ?)
    `, [userId, groupId, name.trim(), description || '', visibility]);

    const newTemplate = selectTemplateWithGroup(result.lastInsertRowid || 0);

    res.status(201).json(newTemplate.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/product/templates/:id
 * 更新主图模板
 */
router.patch('/templates/:id', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const templateId = parseInt((Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) || "0");
    const userId = req.userId!;
    const isAdmin = req.userRole === 'admin';
    const { name, description, visibility, group_id } = req.body;

    // 查询现有模板
    const templateResult = query(
      'SELECT * FROM product_main_templates WHERE id = ?',
      [templateId]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: '模板不存在' });
    }

    const template = templateResult.rows[0];

    // 权限检查：只有创建者和管理员可修改
    if (template.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: '无权修改此模板' });
    }

    // 构建更新语句
    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined && name.trim()) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (description !== undefined) {
      updates.push('description = ?');
      params.push(description);
    }
    if (visibility !== undefined && ['private', 'public'].includes(visibility)) {
      updates.push('visibility = ?');
      params.push(visibility);
    }
    if (group_id !== undefined) {
      const groupId = Number(group_id);
      if (!Number.isInteger(groupId) || groupId <= 0) {
        return res.status(400).json({ error: '模板分组参数无效' });
      }
      const groupResult = query(
        'SELECT id FROM product_template_groups WHERE id = ? AND user_id = ?',
        [groupId, template.user_id]
      );
      if (groupResult.rows.length === 0) {
        return res.status(400).json({ error: '模板分组不存在' });
      }
      updates.push('group_id = ?');
      params.push(groupId);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '没有提供更新字段' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(templateId);

    query(
      `UPDATE product_main_templates SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const updatedTemplate = selectTemplateWithGroup(templateId);

    res.json(updatedTemplate.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/product/templates/:id
 * 删除主图模板（级联删除所有小模板）
 */
router.delete('/templates/:id', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const templateId = parseInt((Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) || "0");
    const userId = req.userId!;
    const isAdmin = req.userRole === 'admin';

    // 查询现有模板
    const templateResult = query(
      'SELECT * FROM product_main_templates WHERE id = ?',
      [templateId]
    );

    if (templateResult.rows.length === 0) {
      return res.status(404).json({ error: '模板不存在' });
    }

    const template = templateResult.rows[0];

    // 权限检查：只有创建者和管理员可删除
    if (template.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: '无权删除此模板' });
    }

    // 删除主模板（会级联删除所有小模板）
    query('DELETE FROM product_main_templates WHERE id = ?', [templateId]);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ===== 小模板管理 =====

/**
 * POST /api/product/templates/:id/sub
 * 为指定主图模板创建小模板
 */
router.post('/templates/:id/sub', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const mainTemplateId = parseInt((Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) || "0");
    const userId = req.userId!;
    const isAdmin = req.userRole === 'admin';
    const { name, fixed_prompt, fixed_reference_images = [], preview_image_url = null, sort_order = 0 } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: '小模板名称不能为空' });
    }
    if (!fixed_prompt || !fixed_prompt.trim()) {
      return res.status(400).json({ error: '固定提示词不能为空' });
    }

    // 查询主模板
    const mainTemplateResult = query(
      'SELECT * FROM product_main_templates WHERE id = ?',
      [mainTemplateId]
    );

    if (mainTemplateResult.rows.length === 0) {
      return res.status(404).json({ error: '主图模板不存在' });
    }

    const mainTemplate = mainTemplateResult.rows[0];

    // 权限检查：只有创建者和管理员可添加小模板
    if (mainTemplate.user_id !== userId && !isAdmin) {
      return res.status(403).json({ error: '无权修改此模板' });
    }

    const result = query(`
      INSERT INTO product_sub_templates 
      (main_template_id, name, fixed_prompt, fixed_reference_images, preview_image_url, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [
      mainTemplateId,
      name.trim(),
      fixed_prompt.trim(),
      JSON.stringify(fixed_reference_images),
      typeof preview_image_url === 'string' && preview_image_url.trim() ? preview_image_url.trim() : null,
      sort_order
    ]);

    const newSubTemplate = query(
      'SELECT * FROM product_sub_templates WHERE id = ?',
      [result.lastInsertRowid]
    );

    res.status(201).json(newSubTemplate.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * PATCH /api/product/sub-templates/:id
 * 更新小模板
 */
router.patch('/sub-templates/:id', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const subTemplateId = parseInt((Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) || "0");
    const userId = req.userId!;
    const isAdmin = req.userRole === 'admin';
    const { name, fixed_prompt, fixed_reference_images, preview_image_url, sort_order } = req.body;

    // 查询小模板及其主模板
    const subTemplateResult = query(`
      SELECT st.*, mt.user_id as owner_id
      FROM product_sub_templates st
      JOIN product_main_templates mt ON st.main_template_id = mt.id
      WHERE st.id = ?
    `, [subTemplateId]);

    if (subTemplateResult.rows.length === 0) {
      return res.status(404).json({ error: '小模板不存在' });
    }

    const subTemplate = subTemplateResult.rows[0];

    // 权限检查：只有主模板创建者和管理员可修改
    if (subTemplate.owner_id !== userId && !isAdmin) {
      return res.status(403).json({ error: '无权修改此小模板' });
    }

    // 构建更新语句
    const updates: string[] = [];
    const params: any[] = [];

    if (name !== undefined && name.trim()) {
      updates.push('name = ?');
      params.push(name.trim());
    }
    if (fixed_prompt !== undefined && fixed_prompt.trim()) {
      updates.push('fixed_prompt = ?');
      params.push(fixed_prompt.trim());
    }
    if (fixed_reference_images !== undefined) {
      updates.push('fixed_reference_images = ?');
      params.push(JSON.stringify(fixed_reference_images));
    }
    if (preview_image_url !== undefined) {
      updates.push('preview_image_url = ?');
      params.push(typeof preview_image_url === 'string' && preview_image_url.trim() ? preview_image_url.trim() : null);
    }
    if (sort_order !== undefined) {
      updates.push('sort_order = ?');
      params.push(sort_order);
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: '没有提供更新字段' });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    params.push(subTemplateId);

    query(
      `UPDATE product_sub_templates SET ${updates.join(', ')} WHERE id = ?`,
      params
    );

    const updatedSubTemplate = query(
      'SELECT * FROM product_sub_templates WHERE id = ?',
      [subTemplateId]
    );

    res.json(updatedSubTemplate.rows[0]);
  } catch (error) {
    next(error);
  }
});

/**
 * DELETE /api/product/sub-templates/:id
 * 删除小模板
 */
router.delete('/sub-templates/:id', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const subTemplateId = parseInt((Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) || "0");
    const userId = req.userId!;
    const isAdmin = req.userRole === 'admin';

    // 查询小模板及其主模板
    const subTemplateResult = query(`
      SELECT st.*, mt.user_id as owner_id
      FROM product_sub_templates st
      JOIN product_main_templates mt ON st.main_template_id = mt.id
      WHERE st.id = ?
    `, [subTemplateId]);

    if (subTemplateResult.rows.length === 0) {
      return res.status(404).json({ error: '小模板不存在' });
    }

    const subTemplate = subTemplateResult.rows[0];

    // 权限检查：只有主模板创建者和管理员可删除
    if (subTemplate.owner_id !== userId && !isAdmin) {
      return res.status(403).json({ error: '无权删除此小模板' });
    }

    query('DELETE FROM product_sub_templates WHERE id = ?', [subTemplateId]);

    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

// ===== 生图任务管理 =====

/**
 * POST /api/product/generate
 * 创建商品主图生成任务（入队）
 */
router.post('/generate', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const {
      mode, // 'single' | 'template'
      model_id,
      reference_images = [], // 用户上传的商品参考图
      prompt = '',
      size = '1024x1024',
      count = 1,
      // 模板生成模式专用
      main_template_id,
      sub_template_ids = [],
      template_sub_templates = [],
      template_prompt_overrides = [],
      additional_prompt = ''
    } = req.body;

    // 参数验证
    if (!mode || !['single', 'template'].includes(mode)) {
      return res.status(400).json({ error: '生成模式参数无效' });
    }
    if (!model_id) {
      return res.status(400).json({ error: '请选择生图模型' });
    }

    // 查询模型配置
    const modelResult = query(
      'SELECT * FROM models WHERE id = ? AND is_active = 1 AND visible_in_product = 1',
      [model_id]
    );

    if (modelResult.rows.length === 0) {
      return res.status(400).json({ error: '模型不存在或不可用' });
    }

    const model = modelResult.rows[0];

    let validatedReferenceImages: string[];
    try {
      validatedReferenceImages = validateGenerationCapabilities(model, reference_images, size);
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }

    // 查询用户信息
    const userResult = query('SELECT creative_credits FROM users WHERE id = ?', [userId]);
    const user = userResult.rows[0];

    const taskIds: number[] = [];
    let totalCost = 0;

    const result = transaction(() => {
      if (mode === 'single') {
        // 单张生成模式
        totalCost = model.cost_per_image * count;

        // 检查积分
        if (user.creative_credits < totalCost) {
          throw new Error('创作积分不足');
        }

        // 扣除积分
        query(
          'UPDATE users SET creative_credits = creative_credits - ? WHERE id = ?',
          [totalCost, userId]
        );

        // 创建任务
        for (let i = 0; i < count; i++) {
          const taskResult = query(`
            INSERT INTO generation_tasks (
              user_id, model_id, prompt, image_size, image_count,
              reference_images, credits_charged, credits_type,
              source, template_info, status, priority
            ) VALUES (?, ?, ?, ?, 1, ?, ?, 'creative', 'product', ?, 'queued', 0)
          `, [
            userId,
            model_id,
            prompt,
            size,
            JSON.stringify(validatedReferenceImages),
            model.cost_per_image,
            JSON.stringify({ mode: 'single' })
          ]);

          taskIds.push(taskResult.lastInsertRowid as number);
        }
      } else {
        // 模板生成模式
        const templateSelections = Array.isArray(template_sub_templates) && template_sub_templates.length > 0
          ? template_sub_templates.map((item: any) => ({
              main_template_id: Number(item.main_template_id),
              sub_template_id: Number(item.sub_template_id)
            })).filter((item: any) => item.main_template_id && item.sub_template_id)
          : Array.isArray(sub_template_ids) && sub_template_ids.length > 0 && main_template_id
            ? sub_template_ids.map((id: any) => ({ main_template_id: Number(main_template_id), sub_template_id: Number(id) })).filter((item: any) => item.main_template_id && item.sub_template_id)
            : [];

        if (templateSelections.length === 0) {
          throw new Error('模板生成模式需要指定主图模板和小模板');
        }

        const selectionKeys = new Set(templateSelections.map((item: any) => `${item.main_template_id}:${item.sub_template_id}`));
        const uniqueSelections = Array.from(selectionKeys).map((key) => {
          const [mainTemplateId, subTemplateId] = key.split(':').map(Number);
          return { main_template_id: mainTemplateId, sub_template_id: subTemplateId };
        });
        const selectionKeySet = new Set(uniqueSelections.map((item) => `${item.main_template_id}:${item.sub_template_id}`));
        const promptOverrideMap = new Map<string, string>();
        if (Array.isArray(template_prompt_overrides)) {
          for (const item of template_prompt_overrides) {
            const mainTemplateId = Number(item?.main_template_id);
            const subTemplateId = Number(item?.sub_template_id);
            const overridePrompt = typeof item?.prompt === 'string' ? item.prompt.trim() : '';
            const key = `${mainTemplateId}:${subTemplateId}`;
            if (!mainTemplateId || !subTemplateId || !selectionKeySet.has(key)) {
              throw new Error('提示词覆盖的小模板不在本次选择中');
            }
            if (!overridePrompt) {
              throw new Error('模板提示词不能为空');
            }
            promptOverrideMap.set(key, overridePrompt);
          }
        }
        const subTemplateIds = uniqueSelections.map(item => item.sub_template_id);
        const subTemplatesResult = query(`
          SELECT st.*, mt.name as main_template_name, mt.visibility, mt.user_id as main_template_user_id
          FROM product_sub_templates st
          JOIN product_main_templates mt ON st.main_template_id = mt.id
          WHERE st.id IN (${subTemplateIds.map(() => '?').join(',')})
        `, subTemplateIds);

        if (subTemplatesResult.rows.length !== uniqueSelections.length) {
          throw new Error('部分小模板不存在');
        }

        const isAdmin = req.userRole === 'admin';
        for (const subTemplate of subTemplatesResult.rows) {
          const matched = uniqueSelections.some(item => item.main_template_id === subTemplate.main_template_id && item.sub_template_id === subTemplate.id);
          if (!matched) {
            throw new Error('小模板归属关系不正确');
          }
          if (subTemplate.visibility === 'private' && subTemplate.main_template_user_id !== userId && !isAdmin) {
            throw new Error('无权访问部分小模板');
          }
        }

        totalCost = model.cost_per_image * subTemplatesResult.rows.length;

        // 检查积分
        if (user.creative_credits < totalCost) {
          throw new Error('创作积分不足');
        }

        // 扣除积分
        query(
          'UPDATE users SET creative_credits = creative_credits - ? WHERE id = ?',
          [totalCost, userId]
        );

        // 为每个小模板创建任务
        for (const subTemplate of subTemplatesResult.rows) {
          const overridePrompt = promptOverrideMap.get(`${subTemplate.main_template_id}:${subTemplate.id}`);
          const basePrompt = overridePrompt || subTemplate.fixed_prompt;
          const mergedPrompt = basePrompt + (additional_prompt ? ' ' + additional_prompt : '');

          const taskResult = query(`
            INSERT INTO generation_tasks (
              user_id, model_id, prompt, image_size, image_count,
              reference_images, credits_charged, credits_type,
              source, template_info, status, priority
            ) VALUES (?, ?, ?, ?, 1, ?, ?, 'creative', 'product', ?, 'queued', 0)
          `, [
            userId,
            model_id,
            mergedPrompt,
            size,
            JSON.stringify(validatedReferenceImages),
            model.cost_per_image,
            JSON.stringify({
              mode: 'template',
              main_template_id: subTemplate.main_template_id,
              main_template_name: subTemplate.main_template_name,
              sub_template_id: subTemplate.id,
              sub_template_name: subTemplate.name,
              prompt_overridden: Boolean(overridePrompt)
            })
          ]);

          taskIds.push(taskResult.lastInsertRowid as number);
        }
      }

      return { task_ids: taskIds, total_cost: totalCost };
    });

    const queuedTasksResult = query(
      `SELECT * FROM generation_tasks WHERE id IN (${taskIds.map(() => '?').join(',')})`,
      taskIds
    );

    for (const task of queuedTasksResult.rows) {
      taskQueue.addTask(task);
    }

    res.json(result);
  } catch (error: any) {
    // 如果是业务错误（如积分不足），返回400
    if (error.message === '创作积分不足' || error.message.includes('小模板')) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
});

// ===== 模板库图片管理 =====

// 上传图片用的 multer 配置
const libraryImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

/**
 * GET /api/product/library-images
 * 获取当前用户的模板库图片列表
 */
router.get('/library-images', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const result = query(
      'SELECT id, url, name, created_at FROM product_library_images WHERE user_id = ? ORDER BY created_at DESC',
      [userId]
    );
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/product/library-images
 * 上传一张模板库图片
 */
router.post('/library-images', authMiddleware, libraryImageUpload.single('image'), async (req: AuthRequest, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传图片文件' });
    }
    const userId = req.userId!;
    const ext = (req.file.originalname.split('.').pop() || 'png').toLowerCase();
    const filename = `library_${userId}_${Date.now()}.${ext}`;
    const url = await uploadImage(req.file.buffer, filename);
    const name = (req.body.name as string) || req.file.originalname;

    const result = query(
      'INSERT INTO product_library_images (user_id, url, name) VALUES (?, ?, ?)',
      [userId, url, name]
    );
    res.json({ id: result.lastInsertRowid, url, name });
  } catch (error) {
    console.error('上传模板库图片失败:', error);
    res.status(500).json({ error: '上传模板库图片失败' });
  }
});

/**
 * DELETE /api/product/library-images/:id
 * 删除一张模板库图片
 */
router.delete('/library-images/:id', authMiddleware, async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const userId = req.userId!;
    const imageId = parseInt((Array.isArray(req.params.id) ? req.params.id[0] : req.params.id) || '0');

    const existing = query('SELECT id, user_id FROM product_library_images WHERE id = ?', [imageId]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: '图片不存在' });
    }
    if (existing.rows[0].user_id !== userId) {
      return res.status(403).json({ error: '无权删除此图片' });
    }

    query('DELETE FROM product_library_images WHERE id = ?', [imageId]);
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

export default router;
