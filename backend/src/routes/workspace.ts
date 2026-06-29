import { Router } from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { query, transaction } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { fissionPrompts, extractPromptDescriptions, deepenPrompt } from '../services/workspaceAI.js';
import { taskQueue } from '../services/queue.js';
import { chatTaskQueue } from '../services/chatQueue.js';
import sharp from 'sharp';
import PDFDocument from 'pdfkit';
import { zipSync } from 'fflate';

export const workspaceRouter = Router();

const exportTickets = new Map<string, { userId: number; taskId: number; cardIds?: number[]; format: 'jpg' | 'png'; expiresAt: number }>();

function sanitizeExportFilename(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function summarizeWorkspaceCardImages(images: any[]) {
  const pendingCount = images.filter((img: any) => img.status === 'pending' || img.status === 'generating').length;
  const completedImages = images.filter((img: any) => img.status === 'completed' && img.image_url);
  const historyFailedCount = images.filter((img: any) => img.status === 'failed').length;
  const selectedImage = images.find((img: any) => img.id === img.selected_image_id && img.image_url)
    || images.find((img: any) => img.is_selected && img.image_url)
    || completedImages[0]
    || null;
  const hasFailed = pendingCount === 0 && !selectedImage && completedImages.length === 0 && historyFailedCount > 0;

  return {
    pendingCount,
    completedCount: completedImages.length,
    failedCount: hasFailed ? historyFailedCount : 0,
    hasGenerating: pendingCount > 0,
    hasFailed,
    selectedImage,
  };
}

async function buildWorkspaceExportZip(userId: number, taskId: number, cardIds?: number[], format: 'jpg' | 'png' = 'jpg') {
  const taskCheck = query('SELECT id, title FROM workspace_tasks WHERE id = ? AND user_id = ?', [taskId, userId]);
  if (!taskCheck.rows[0]) {
    return { status: 404 as const, body: { error: '任务不存在' } };
  }

  let cards;
  if (Array.isArray(cardIds) && cardIds.length > 0) {
    const placeholders = cardIds.map(() => '?').join(',');
    cards = query(
      `SELECT pc.card_index, ci.image_url, ci.size FROM prompt_cards pc
       JOIN card_images ci ON pc.selected_image_id = ci.id
       WHERE pc.task_id = ? AND pc.id IN (${placeholders}) AND ci.image_url != ''
       ORDER BY pc.card_index ASC`,
      [taskId, ...cardIds]
    );
  } else {
    cards = query(
      `SELECT pc.card_index, ci.image_url, ci.size FROM prompt_cards pc
       JOIN card_images ci ON pc.selected_image_id = ci.id
       WHERE pc.task_id = ? AND ci.image_url != ''
       ORDER BY pc.card_index ASC`,
      [taskId]
    );
  }

  if (cards.rows.length === 0) {
    return { status: 400 as const, body: { error: '没有可导出的图片' } };
  }

  const taskName = sanitizeExportFilename(taskCheck.rows[0].title || '批量生图') || '批量生图';
  const zipEntries: Record<string, Uint8Array> = {};

  for (const row of cards.rows as Array<{ card_index: number; image_url: string }>) {
    const imageUrl = row.image_url;
    let imageBuffer: Buffer;

    if (imageUrl.startsWith('/uploads/')) {
      const filePath = path.resolve(process.cwd(), imageUrl.replace(/^\//, ''));
      if (!fs.existsSync(filePath)) {
        continue;
      }
      imageBuffer = fs.readFileSync(filePath);
    } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);
      const imageResponse = await fetch(imageUrl, {
        redirect: 'follow',
        headers: { 'User-Agent': 'HanxingImageExport/1.0' },
        signal: controller.signal,
      }).finally(() => clearTimeout(timeoutId));
      if (!imageResponse.ok) {
        console.warn('[图片压缩包导出] 远程图片获取失败', { card_index: row.card_index, status: imageResponse.status, imageUrl });
        continue;
      }
      imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
    } else {
      console.warn('[图片压缩包导出] 跳过不支持的图片地址', { card_index: row.card_index, imageUrl });
      continue;
    }

    if (!imageBuffer.length) {
      console.warn('[图片压缩包导出] 图片内容为空', { card_index: row.card_index, imageUrl });
      continue;
    }

    const outputBuffer = format === 'png'
      ? await sharp(imageBuffer).png().toBuffer()
      : await sharp(imageBuffer)
        .flatten({ background: '#ffffff' })
        .jpeg({ quality: 92 })
        .toBuffer();

    const filename = `${taskName}-${String(row.card_index).padStart(2, '0')}.${format}`;
    zipEntries[filename] = new Uint8Array(outputBuffer);
  }

  if (Object.keys(zipEntries).length === 0) {
    return { status: 400 as const, body: { error: '所有图片加载失败，无法导出压缩包' } };
  }

  const zipBuffer = Buffer.from(zipSync(zipEntries));
  const downloadName = `${taskName}-${format.toUpperCase()}图片压缩包.zip`;
  const asciiName = 'workspace-export.zip';
  const encodedName = encodeURIComponent(downloadName);

  return {
    status: 200 as const,
    body: {
      zipBuffer,
      fileCount: Object.keys(zipEntries).length,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${asciiName}"; filename*=UTF-8''${encodedName}`,
        'Content-Length': String(zipBuffer.length),
      },
    },
  };
}

type SubmitSuccess = { cardImageId: number };
type SubmitError = { status: number; error: string };

async function submitWorkspaceImageTask(
  userId: number,
  modelId: number,
  size: string,
  prompt: string,
  workspaceTaskId: number,
  cardId: number,
  taskType: 'workspace_single' | 'workspace_batch' = 'workspace_single'
): Promise<SubmitSuccess | SubmitError> {
  const userResult = query(
    `SELECT u.creative_credits, u.project_credits, u.group_id, g.allowed_models, g.max_concurrent, g.priority
     FROM users u LEFT JOIN permission_groups g ON u.group_id = g.id
     WHERE u.id = ?`,
    [userId]
  );
  const user = userResult.rows[0];
  if (!user) return { status: 404, error: '用户不存在' };

  const modelResult = query('SELECT * FROM models WHERE id = ? AND is_active = 1', [modelId]);
  const model = modelResult.rows[0];
  if (!model) return { status: 404, error: '模型不存在或已禁用' };
  if (!model.visible_in_workspace) return { status: 400, error: '该模型不可用于批量生图' };

  const allowedModels: string[] = (() => {
    try { return JSON.parse(user.allowed_models || '[]'); } catch { return []; }
  })();
  if (allowedModels.length > 0 && !allowedModels.includes(String(model.id))) {
    return { status: 403, error: '当前权限组不允许使用此模型' };
  }

  const totalCost = model.cost_per_image || 0;
  const imageCount = Math.min(Math.max(Math.floor(Number(model.default_image_count) || 1), 1), 10);
  const totalImageCost = totalCost * imageCount;
  if (totalImageCost > 0) {
    const available = user.creative_credits || 0;
    if (available < totalImageCost) {
      return { status: 400, error: `创作积分不足，需要 ${totalImageCost} 积分，当前 ${available} 积分` };
    }
  }

  const activeCount = query(
    "SELECT COUNT(*) as count FROM generation_tasks WHERE user_id = ? AND status IN ('queued', 'processing')",
    [userId]
  );
  if (parseInt(activeCount.rows[0].count) >= (user.max_concurrent || 2)) {
    return { status: 429, error: '已达到最大并发任务数，请等待当前任务完成' };
  }

  const taskUuid = crypto.randomUUID();
  let cardImageId: number;
  let genTaskId: number;

  try {
    const result = transaction(() => {
      // 在事务内扣除积分，确保原子性
      if (totalImageCost > 0) {
        const updateResult = query(
          'UPDATE users SET creative_credits = creative_credits - ? WHERE id = ? AND creative_credits >= ?',
          [totalImageCost, userId, totalImageCost]
        );
        if (updateResult.changes === 0) {
          throw new Error('CREATIVE_CREDITS_INSUFFICIENT');
        }
      }

      const cardImageInsert = query(
        `INSERT INTO card_images (card_id, image_api_id, image_url, size, status) VALUES (?, ?, '', ?, 'pending')`,
        [cardId, modelId, size]
      );
      const newCardImageId = cardImageInsert.lastInsertRowid!;

      const taskInsert = query(
        `INSERT INTO generation_tasks (user_id, model_id, prompt, image_size, image_count, status, priority, credits_charged, credits_type, source, task_type, task_uuid, reference_images)
         VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, 'creative', 'workspace', ?, ?, '[]')`,
        [userId, modelId, prompt, size, imageCount, user.priority || 0, totalImageCost, taskType, taskUuid]
      );
      const newGenTaskId = taskInsert.lastInsertRowid!;

      query('UPDATE card_images SET generation_task_id = ? WHERE id = ?', [newGenTaskId, newCardImageId]);

      return { cardImageId: newCardImageId, genTaskId: newGenTaskId };
    });
    cardImageId = result.cardImageId;
    genTaskId = result.genTaskId;
  } catch (err) {
    const errMsg = (err as Error).message;
    if (errMsg === 'CREATIVE_CREDITS_INSUFFICIENT') {
      return { status: 400, error: `创作积分不足，需要 ${totalImageCost} 积分` };
    }
    return { status: 500, error: '创建生图任务失败' };
  }

  const taskRow = query('SELECT * FROM generation_tasks WHERE id = ?', [genTaskId]);
  taskQueue.addTask(taskRow.rows[0]);

  return { cardImageId };
}

workspaceRouter.get('/tasks', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const pageSize = parseInt(req.query.page_size as string) || 20;
    const offset = (page - 1) * pageSize;
    const status = req.query.status as string;
    const search = req.query.search as string;

    let where = 'WHERE t.user_id = ?';
    const params: any[] = [req.userId];

    if (status && status !== 'all') {
      where += ' AND t.status = ?';
      params.push(status);
    }
    if (search) {
      where += ' AND t.title LIKE ?';
      params.push(`%${search}%`);
    }

    const tasks = query(
      `SELECT t.*, pt.name as template_name, CASE WHEN wpt.id IS NULL THEN 0 ELSE 1 END as is_pinned,
        (
          SELECT ci.image_url
          FROM prompt_cards pc
          JOIN card_images ci ON ci.card_id = pc.id
          WHERE pc.task_id = t.id AND ci.status = 'completed' AND ci.image_url != ''
          ORDER BY ci.created_at ASC, ci.id ASC
          LIMIT 1
        ) as thumbnail_url,
        (
          SELECT COUNT(*)
          FROM prompt_cards pc
          JOIN card_images ci ON ci.card_id = pc.id
          WHERE pc.task_id = t.id AND ci.status = 'completed' AND ci.image_url != ''
        ) as completed_image_count
       FROM workspace_tasks t
       LEFT JOIN prompt_templates pt ON t.template_id = pt.id
       LEFT JOIN workspace_pinned_tasks wpt ON wpt.task_id = t.id AND wpt.user_id = ?
       ${where} ORDER BY is_pinned DESC, wpt.created_at DESC, t.created_at DESC LIMIT ? OFFSET ?`,
      [req.userId, ...params, pageSize, offset]
    );
    const total = query(`SELECT COUNT(*) as count FROM workspace_tasks t ${where}`, params);

    // 获取每个任务的缩略图列表（最多3张）
    const taskIds = tasks.rows.map((t: any) => t.id);
    const thumbnailMap: Record<number, string[]> = {};
    const taskBadgeStats = new Map<number, { generating_image_count: number; failed_image_count: number; completed_image_count: number }>();
    for (const taskId of taskIds) {
      const thumbResult = query(
        `SELECT ci.image_url
         FROM prompt_cards pc
         JOIN card_images ci ON ci.card_id = pc.id
         WHERE pc.task_id = ? AND ci.status = 'completed' AND ci.image_url != ''
         ORDER BY ci.created_at ASC, ci.id ASC
         LIMIT 3`,
        [taskId]
      );
      thumbnailMap[taskId] = thumbResult.rows.map((r: any) => r.image_url);

      const taskImageRows = query(
        `SELECT ci.*, pc.selected_image_id
         FROM prompt_cards pc
         LEFT JOIN card_images ci ON ci.card_id = pc.id
         WHERE pc.task_id = ?
         ORDER BY pc.card_index ASC, ci.created_at ASC, ci.id ASC`,
        [taskId]
      );

      const imagesByCard = new Map<number, any[]>();
      for (const row of taskImageRows.rows as any[]) {
        const cardId = row.card_id || row.id;
        if (!imagesByCard.has(cardId)) imagesByCard.set(cardId, []);
        if (row.id !== null) {
          imagesByCard.get(cardId)!.push(row);
        }
      }

      let generatingImageCount = 0;
      let failedImageCount = 0;
      let completedImageCount = 0;
      for (const images of imagesByCard.values()) {
        const summary = summarizeWorkspaceCardImages(images);
        completedImageCount += summary.completedCount;
        if (summary.hasGenerating) generatingImageCount += 1;
        if (summary.hasFailed) failedImageCount += 1;
      }

      taskBadgeStats.set(taskId, {
        generating_image_count: generatingImageCount,
        failed_image_count: failedImageCount,
        completed_image_count: completedImageCount,
      });
    }

    const tasksWithThumbnails = tasks.rows.map((task: any) => ({
      ...task,
      ...(taskBadgeStats.get(task.id) || {
        generating_image_count: 0,
        failed_image_count: 0,
        completed_image_count: Number(task.completed_image_count || 0),
      }),
      thumbnail_urls: thumbnailMap[task.id] || [],
    }));

    return res.json({
      tasks: tasksWithThumbnails,
      total: parseInt(total.rows[0].count),
      page,
      page_size: pageSize,
    });
  } catch {
    return res.status(500).json({ error: '获取任务列表失败' });
  }
});

workspaceRouter.get('/tasks/pinned', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = query('SELECT task_id FROM workspace_pinned_tasks WHERE user_id = ?', [req.userId]);
    return res.json({ pinned_ids: result.rows.map((r: any) => r.task_id) });
  } catch {
    return res.status(500).json({ error: '获取置顶列表失败' });
  }
});

workspaceRouter.post('/tasks', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { title, theme_prompt, template_id, mode, extract_template_id } = req.body;
    const taskMode = mode === 'extract' ? 'extract' : 'smart';
    const promptTemplateId = taskMode === 'extract' ? extract_template_id : template_id;
    if (!title || !theme_prompt || !promptTemplateId) {
      return res.status(400).json({ error: taskMode === 'extract' ? '任务标题、长提示词和提取模板不能为空' : '任务标题、主题提示词和裂变模板不能为空' });
    }

    const insertResult = query(
      `INSERT INTO workspace_tasks (user_id, title, theme_prompt, template_id, status, card_count)
       VALUES (?, ?, ?, ?, 'generating', 0)`,
      [req.userId, title, theme_prompt, promptTemplateId]
    );
    const taskId = insertResult.lastInsertRowid!;

    const taskResult = query('SELECT * FROM workspace_tasks WHERE id = ?', [taskId]);
    const task = taskResult.rows[0];

    setImmediate(async () => {
      try {
        const prompts = taskMode === 'extract'
          ? await extractPromptDescriptions(promptTemplateId, theme_prompt, taskId, req.userId!)
          : await fissionPrompts(promptTemplateId, theme_prompt, taskId, req.userId!);

        for (let i = 0; i < prompts.length; i++) {
          query(
            `INSERT INTO prompt_cards (task_id, card_index, prompt) VALUES (?, ?, ?)`,
            [taskId, i + 1, prompts[i]]
          );
        }

        query(
          `UPDATE workspace_tasks SET status = 'completed', card_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [prompts.length, taskId]
        );
      } catch (err) {
        const errorMsg = (err as Error).message;
        query(
          `UPDATE workspace_tasks SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
          [errorMsg, taskId]
        );
      }
    });

    return res.status(201).json({ task });
  } catch {
    return res.status(500).json({ error: '创建任务失败' });
  }
});

workspaceRouter.post('/tasks/:id/pin', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = query(
      'SELECT id FROM workspace_tasks WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '任务不存在' });

    query('INSERT OR IGNORE INTO workspace_pinned_tasks (user_id, task_id) VALUES (?, ?)', [req.userId, req.params.id]);
    return res.json({ message: '已置顶' });
  } catch {
    return res.status(500).json({ error: '置顶失败' });
  }
});

workspaceRouter.delete('/tasks/:id/pin', authMiddleware, async (req: AuthRequest, res) => {
  try {
    query('DELETE FROM workspace_pinned_tasks WHERE user_id = ? AND task_id = ?', [req.userId, req.params.id]);
    return res.json({ message: '已取消置顶' });
  } catch {
    return res.status(500).json({ error: '取消置顶失败' });
  }
});

workspaceRouter.get('/tasks/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = query(
      'SELECT t.*, pt.name as template_name FROM workspace_tasks t LEFT JOIN prompt_templates pt ON t.template_id = pt.id WHERE t.id = ? AND t.user_id = ?',
      [req.params.id, req.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '任务不存在' });
    return res.json({ task: result.rows[0] });
  } catch {
    return res.status(500).json({ error: '获取任务失败' });
  }
});

workspaceRouter.get('/tasks/:id/status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = query(
      'SELECT id, status, card_count, error_message FROM workspace_tasks WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '任务不存在' });
    return res.json(result.rows[0]);
  } catch {
    return res.status(500).json({ error: '获取任务状态失败' });
  }
});

workspaceRouter.delete('/tasks/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = query(
      'SELECT id FROM workspace_tasks WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!result.rows[0]) return res.status(404).json({ error: '任务不存在' });

    const taskId = req.params.id;
    // 使用事务清理所有关联数据
    transaction(() => {
      // 先删除 workspace_api_logs（没有 ON DELETE CASCADE，需手动清理）
      query('DELETE FROM workspace_api_logs WHERE workspace_task_id = ?', [taskId]);
      query('DELETE FROM chat_tasks WHERE workspace_task_id = ?', [taskId]);

      // 清空卡片对已选图片的引用，避免删除 card_images 时触发外键约束
      query(
        `UPDATE prompt_cards
         SET selected_image_id = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE task_id = ? AND selected_image_id IS NOT NULL`,
        [taskId]
      );

      // 查询关联的 generation_tasks ID（用于后续清理）
      const genTaskIds = query(
        `SELECT generation_task_id FROM card_images WHERE card_id IN (SELECT id FROM prompt_cards WHERE task_id = ?) AND generation_task_id IS NOT NULL`,
        [taskId]
      ).rows.map((r: any) => r.generation_task_id);

      const cardIds = query(
        'SELECT id FROM prompt_cards WHERE task_id = ?',
        [taskId]
      ).rows.map((r: any) => r.id);

      if (cardIds.length > 0) {
        const placeholders = cardIds.map(() => '?').join(',');
        query(`DELETE FROM workspace_api_logs WHERE card_id IN (${placeholders})`, cardIds);
        query(`DELETE FROM chat_tasks WHERE card_id IN (${placeholders})`, cardIds);
      }

      // 清理其他关联数据
      query('DELETE FROM workspace_pinned_tasks WHERE task_id = ?', [taskId]);
      // card_images 和 prompt_cards 通过 ON DELETE CASCADE 自动清理
      query('DELETE FROM workspace_tasks WHERE id = ?', [taskId]);
      // 清理关联的 generation_tasks（不依赖 CASCADE）
      if (genTaskIds.length > 0) {
        const placeholders = genTaskIds.map(() => '?').join(',');
        query(`DELETE FROM api_call_logs WHERE task_id IN (${placeholders})`, genTaskIds);
        query(`DELETE FROM generation_tasks WHERE id IN (${placeholders})`, genTaskIds);
      }
    });
    return res.json({ message: '任务已删除' });
  } catch (err) {
    console.error('[删除任务] 失败:', err);
    return res.status(500).json({ error: '删除任务失败' });
  }
});

workspaceRouter.get('/tasks/:id/cards', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const taskCheck = query(
      'SELECT id FROM workspace_tasks WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!taskCheck.rows[0]) return res.status(404).json({ error: '任务不存在' });

    const page = parseInt(req.query.page as string) || 1;
    const requestedPageSize = parseInt(req.query.page_size as string) || 60;
    const pageSize = Math.max(1, Math.min(requestedPageSize, 1000));
    const offset = (page - 1) * pageSize;

    const cards = query(
      `SELECT c.*, ci.id as sel_img_id, ci.image_url as sel_img_url, ci.size as sel_img_size, wl.api_config_name as sel_img_model_name
       FROM prompt_cards c
       LEFT JOIN card_images ci ON c.selected_image_id = ci.id
       LEFT JOIN workspace_api_logs wl ON ci.generation_task_id = wl.generation_task_id AND wl.api_type = 'image'
       WHERE c.task_id = ? ORDER BY c.card_index ASC LIMIT ? OFFSET ?`,
      [req.params.id, pageSize, offset]
    );
    const total = query('SELECT COUNT(*) as count FROM prompt_cards WHERE task_id = ?', [req.params.id]);

    return res.json({
      cards: cards.rows,
      total: parseInt(total.rows[0].count),
      page,
      page_size: pageSize,
    });
  } catch {
    return res.status(500).json({ error: '获取卡片列表失败' });
  }
});

workspaceRouter.get('/tasks/:id/card-images', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const taskCheck = query(
      'SELECT id FROM workspace_tasks WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!taskCheck.rows[0]) return res.status(404).json({ error: '任务不存在' });

    const rows = query(
      `SELECT ci.*, gt.started_at as generation_started_at, gt.completed_at as generation_completed_at, wl.api_config_name as model_name_from_log
       FROM card_images ci
       JOIN prompt_cards pc ON ci.card_id = pc.id
       LEFT JOIN generation_tasks gt ON ci.generation_task_id = gt.id
       LEFT JOIN workspace_api_logs wl ON ci.generation_task_id = wl.generation_task_id AND wl.api_type = 'image'
       WHERE pc.task_id = ?
       ORDER BY pc.card_index ASC, ci.created_at ASC, ci.id ASC`,
      [req.params.id]
    );

    const imagesByCard: Record<number, any[]> = {};
    const cardsSummary: Record<number, any> = {};

    for (const row of rows.rows as any[]) {
      const cardId = row.card_id;
      if (!imagesByCard[cardId]) imagesByCard[cardId] = [];
      imagesByCard[cardId].push(row);
    }

    for (const [cardIdText, images] of Object.entries(imagesByCard)) {
      const cardId = parseInt(cardIdText, 10);
      const summary = summarizeWorkspaceCardImages(images);

      cardsSummary[cardId] = {
        card_id: cardId,
        pending_count: summary.pendingCount,
        completed_count: summary.completedCount,
        failed_count: summary.failedCount,
        selected_image: summary.selectedImage ? {
          id: summary.selectedImage.id,
          image_url: summary.selectedImage.image_url,
          model_name: summary.selectedImage.model_name_from_log || null,
          size: summary.selectedImage.size,
          started_at: summary.selectedImage.generation_started_at || null,
          completed_at: summary.selectedImage.generation_completed_at || null,
          created_at: summary.selectedImage.created_at,
        } : null,
        images,
      };
    }

    return res.json({ cards: cardsSummary });
  } catch {
    return res.status(500).json({ error: '获取任务卡片图片状态失败' });
  }
});

workspaceRouter.post('/tasks/:id/cards', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const taskCheck = query(
      'SELECT id, card_count FROM workspace_tasks WHERE id = ? AND user_id = ?',
      [req.params.id, req.userId]
    );
    if (!taskCheck.rows[0]) return res.status(404).json({ error: '任务不存在' });

    const { prompt } = req.body;
    const newPrompt = typeof prompt === 'string' ? prompt : '';

    const maxIndexResult = query(
      'SELECT MAX(card_index) as max_index FROM prompt_cards WHERE task_id = ?',
      [req.params.id]
    );
    const newIndex = (maxIndexResult.rows[0]?.max_index || 0) + 1;

    const insertResult = query(
      'INSERT INTO prompt_cards (task_id, card_index, prompt) VALUES (?, ?, ?)',
      [req.params.id, newIndex, newPrompt]
    );
    const newCardId = insertResult.lastInsertRowid;

    const newCount = (taskCheck.rows[0].card_count || 0) + 1;
    query(
      'UPDATE workspace_tasks SET card_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newCount, req.params.id]
    );

    return res.status(201).json({
      id: newCardId,
      task_id: parseInt(String(req.params.id)),
      card_index: newIndex,
      prompt: newPrompt,
      selected_image_id: null,
      sel_img_id: null,
      sel_img_url: null,
      sel_img_size: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  } catch {
    return res.status(500).json({ error: '创建卡片失败' });
  }
});

workspaceRouter.patch('/cards/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) return res.status(400).json({ error: '提示词不能为空' });

    const cardCheck = query(
      `SELECT pc.id FROM prompt_cards pc JOIN workspace_tasks t ON pc.task_id = t.id WHERE pc.id = ? AND t.user_id = ?`,
      [req.params.id, req.userId]
    );
    if (!cardCheck.rows[0]) return res.status(404).json({ error: '卡片不存在' });

    query(
      'UPDATE prompt_cards SET prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [prompt, req.params.id]
    );
    return res.json({ message: '已保存' });
  } catch {
    return res.status(500).json({ error: '保存提示词失败' });
  }
});

workspaceRouter.delete('/cards/:id', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const cardCheck = query(
      `SELECT pc.id, pc.task_id FROM prompt_cards pc JOIN workspace_tasks t ON pc.task_id = t.id WHERE pc.id = ? AND t.user_id = ?`,
      [req.params.id, req.userId]
    );
    if (!cardCheck.rows[0]) return res.status(404).json({ error: '卡片不存在' });

    query(
      'UPDATE prompt_cards SET selected_image_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND selected_image_id IS NOT NULL',
      [req.params.id]
    );

    query('DELETE FROM workspace_api_logs WHERE card_id = ?', [req.params.id]);
    query('DELETE FROM chat_tasks WHERE card_id = ?', [req.params.id]);

    query('DELETE FROM prompt_cards WHERE id = ?', [req.params.id]);

    const taskId = cardCheck.rows[0].task_id;
    const countResult = query('SELECT COUNT(*) as count FROM prompt_cards WHERE task_id = ?', [taskId]);
    query('UPDATE workspace_tasks SET card_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
      parseInt(countResult.rows[0].count), taskId
    ]);

    return res.json({ message: '卡片已删除' });
  } catch {
    return res.status(500).json({ error: '删除卡片失败' });
  }
});

workspaceRouter.post('/cards/batch-delete', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { card_ids } = req.body;
    if (!Array.isArray(card_ids) || card_ids.length === 0) {
      return res.status(400).json({ error: '请提供要删除的卡片ID列表' });
    }

    const placeholders = card_ids.map(() => '?').join(',');
    const cardCheck = query(
      `SELECT pc.id, pc.task_id FROM prompt_cards pc JOIN workspace_tasks t ON pc.task_id = t.id WHERE pc.id IN (${placeholders}) AND t.user_id = ?`,
      [...card_ids, req.userId]
    );

    if (cardCheck.rows.length === 0) return res.status(404).json({ error: '未找到有权操作的卡片' });

    const ownedIds = cardCheck.rows.map((r: any) => r.id);
    const taskIds = [...new Set(cardCheck.rows.map((r: any) => r.task_id))];
    const ownedPlaceholders = ownedIds.map(() => '?').join(',');

    query(
      `UPDATE prompt_cards
       SET selected_image_id = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE id IN (${ownedPlaceholders}) AND selected_image_id IS NOT NULL`,
      ownedIds
    );

    query(`DELETE FROM workspace_api_logs WHERE card_id IN (${ownedPlaceholders})`, ownedIds);
    query(`DELETE FROM chat_tasks WHERE card_id IN (${ownedPlaceholders})`, ownedIds);

    query(`DELETE FROM prompt_cards WHERE id IN (${ownedPlaceholders})`, ownedIds);

    for (const taskId of taskIds) {
      const countResult = query('SELECT COUNT(*) as count FROM prompt_cards WHERE task_id = ?', [taskId]);
      query('UPDATE workspace_tasks SET card_count = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [
        parseInt(countResult.rows[0].count), taskId
      ]);
    }

    return res.json({ message: `已删除 ${ownedIds.length} 张卡片` });
  } catch {
    return res.status(500).json({ error: '批量删除失败' });
  }
});

workspaceRouter.post('/cards/:id/deepen', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { prompt, template_id } = req.body;
    if (!prompt || !template_id) return res.status(400).json({ error: '提示词和模板不能为空' });

    const cardCheck = query(
      `SELECT pc.id, pc.task_id FROM prompt_cards pc JOIN workspace_tasks t ON pc.task_id = t.id WHERE pc.id = ? AND t.user_id = ?`,
      [req.params.id, req.userId]
    );
    if (!cardCheck.rows[0]) return res.status(404).json({ error: '卡片不存在' });

    const newPrompt = await deepenPrompt(template_id, prompt, parseInt(req.params.id as string), cardCheck.rows[0].task_id, req.userId!);

    query(
      'UPDATE prompt_cards SET prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newPrompt, req.params.id]
    );

    return res.json({ new_prompt: newPrompt });
  } catch (err) {
    return res.status(500).json({ error: `细化失败: ${(err as Error).message}` });
  }
});

workspaceRouter.post('/cards/:id/regenerate-prompt', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { prompt, template_id } = req.body;
    if (!prompt || !template_id) return res.status(400).json({ error: '提示词和模板不能为空' });

    const cardCheck = query(
      `SELECT pc.id, pc.task_id FROM prompt_cards pc JOIN workspace_tasks t ON pc.task_id = t.id WHERE pc.id = ? AND t.user_id = ?`,
      [req.params.id, req.userId]
    );
    if (!cardCheck.rows[0]) return res.status(404).json({ error: '卡片不存在' });

    const newPrompt = await deepenPrompt(template_id, prompt, parseInt(req.params.id as string), cardCheck.rows[0].task_id, req.userId!);

    query(
      'UPDATE prompt_cards SET prompt = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newPrompt, req.params.id]
    );

    return res.json({ new_prompt: newPrompt });
  } catch (err) {
    return res.status(500).json({ error: `重新生成失败: ${(err as Error).message}` });
  }
});

workspaceRouter.post('/cards/:id/generate-image', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { prompt, api_id, size } = req.body;
    if (!prompt || !api_id || !size) return res.status(400).json({ error: '提示词、模型和尺寸不能为空' });

    const cardCheck = query(
      `SELECT pc.id, pc.task_id FROM prompt_cards pc JOIN workspace_tasks t ON pc.task_id = t.id WHERE pc.id = ? AND t.user_id = ?`,
      [req.params.id, req.userId]
    );
    if (!cardCheck.rows[0]) return res.status(404).json({ error: '卡片不存在' });

    const submitResult = await submitWorkspaceImageTask(req.userId!, api_id, size, prompt, cardCheck.rows[0].task_id, parseInt(req.params.id as string), 'workspace_single');
    if ('error' in submitResult) {
      return res.status(submitResult.status).json({ error: submitResult.error });
    }

    return res.status(202).json({ card_image_id: submitResult.cardImageId, status: 'pending' });
  } catch {
    return res.status(500).json({ error: '提交生图任务失败' });
  }
});

workspaceRouter.post('/cards/:id/regenerate-image', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { prompt, api_id, size } = req.body;
    if (!prompt || !api_id || !size) return res.status(400).json({ error: '提示词、模型和尺寸不能为空' });

    const cardCheck = query(
      `SELECT pc.id, pc.task_id FROM prompt_cards pc JOIN workspace_tasks t ON pc.task_id = t.id WHERE pc.id = ? AND t.user_id = ?`,
      [req.params.id, req.userId]
    );
    if (!cardCheck.rows[0]) return res.status(404).json({ error: '卡片不存在' });

    const submitResult = await submitWorkspaceImageTask(req.userId!, api_id, size, prompt, cardCheck.rows[0].task_id, parseInt(req.params.id as string), 'workspace_single');
    if ('error' in submitResult) {
      return res.status(submitResult.status).json({ error: submitResult.error });
    }

    return res.status(202).json({ card_image_id: submitResult.cardImageId, status: 'pending' });
  } catch {
    return res.status(500).json({ error: '提交重新生图任务失败' });
  }
});

workspaceRouter.post('/cards/batch-generate-image', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { card_ids, api_id, size } = req.body;
    if (!Array.isArray(card_ids) || card_ids.length === 0 || !api_id || !size) {
      return res.status(400).json({ error: '参数不完整' });
    }

    const placeholders = card_ids.map(() => '?').join(',');
    const cards = query(
      `SELECT pc.id, pc.task_id, pc.prompt FROM prompt_cards pc JOIN workspace_tasks t ON pc.task_id = t.id WHERE pc.id IN (${placeholders}) AND t.user_id = ?`,
      [...card_ids, req.userId]
    );

    if (cards.rows.length === 0) return res.status(404).json({ error: '未找到有权操作的卡片' });

    const submitted: number[] = [];
    const errors: { card_id: number; error: string }[] = [];

    for (const card of cards.rows) {
      const submitResult = await submitWorkspaceImageTask(req.userId!, api_id, size, card.prompt, card.task_id, card.id, 'workspace_batch');
      if ('error' in submitResult) {
        errors.push({ card_id: card.id, error: submitResult.error });
      } else {
        submitted.push(submitResult.cardImageId);
      }
    }

    return res.status(202).json({ submitted: submitted.length, card_image_ids: submitted, errors });
  } catch {
    return res.status(500).json({ error: '批量生图提交失败' });
  }
});

// 批量细化提示词
workspaceRouter.post('/cards/batch-deepen', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { card_ids, template_id } = req.body;
    if (!Array.isArray(card_ids) || card_ids.length === 0 || !template_id) {
      return res.status(400).json({ error: '参数不完整' });
    }

    // 检查模板是否存在并获取关联的chat_api_id
    const templateResult = query(
      'SELECT pt.*, c.max_concurrent, c.max_retries, c.api_timeout FROM prompt_templates pt LEFT JOIN chat_api_configs c ON pt.chat_api_id = c.id WHERE pt.id = ?',
      [template_id]
    );
    const template = templateResult.rows[0];
    if (!template) return res.status(404).json({ error: '模板不存在' });
    if (!template.chat_api_id) return res.status(400).json({ error: '模板未关联对话API' });

    // 获取用户有权限的卡片
    const placeholders = card_ids.map(() => '?').join(',');
    const cards = query(
      `SELECT pc.id, pc.task_id, pc.prompt FROM prompt_cards pc JOIN workspace_tasks t ON pc.task_id = t.id WHERE pc.id IN (${placeholders}) AND t.user_id = ?`,
      [...card_ids, req.userId]
    );

    if (cards.rows.length === 0) return res.status(404).json({ error: '未找到有权操作的卡片' });

    const submitted: number[] = [];
    const errors: { card_id: number; error: string }[] = [];

    // 为每张卡片创建对话任务
    for (const card of cards.rows) {
      try {
        const taskResult = query(
          `INSERT INTO chat_tasks (user_id, chat_api_id, task_type, card_id, workspace_task_id, template_id, original_prompt, status)
           VALUES (?, ?, 'deepen', ?, ?, ?, ?, 'queued')`,
          [req.userId!, template.chat_api_id, card.id, card.task_id, template_id, card.prompt]
        );
        const chatTaskId = taskResult.lastInsertRowid;

        // 获取完整任务记录并加入队列
        const fullTask = query('SELECT * FROM chat_tasks WHERE id = ?', [chatTaskId]);
        if (fullTask.rows[0]) {
          chatTaskQueue.addTask(fullTask.rows[0]);
          submitted.push(card.id);
        }
      } catch (err) {
        errors.push({ card_id: card.id, error: (err as Error).message });
      }
    }

    return res.status(202).json({ submitted: submitted.length, card_ids: submitted, errors });
  } catch (err) {
    return res.status(500).json({ error: `批量细化提交失败: ${(err as Error).message}` });
  }
});

// 批量重新生成提示词
workspaceRouter.post('/cards/batch-regenerate-prompt', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { card_ids, template_id } = req.body;
    if (!Array.isArray(card_ids) || card_ids.length === 0 || !template_id) {
      return res.status(400).json({ error: '参数不完整' });
    }

    // 检查模板是否存在并获取关联的chat_api_id
    const templateResult = query(
      'SELECT pt.*, c.max_concurrent, c.max_retries, c.api_timeout FROM prompt_templates pt LEFT JOIN chat_api_configs c ON pt.chat_api_id = c.id WHERE pt.id = ?',
      [template_id]
    );
    const template = templateResult.rows[0];
    if (!template) return res.status(404).json({ error: '模板不存在' });
    if (!template.chat_api_id) return res.status(400).json({ error: '模板未关联对话API' });

    // 获取用户有权限的卡片
    const placeholders = card_ids.map(() => '?').join(',');
    const cards = query(
      `SELECT pc.id, pc.task_id, pc.prompt FROM prompt_cards pc JOIN workspace_tasks t ON pc.task_id = t.id WHERE pc.id IN (${placeholders}) AND t.user_id = ?`,
      [...card_ids, req.userId]
    );

    if (cards.rows.length === 0) return res.status(404).json({ error: '未找到有权操作的卡片' });

    const submitted: number[] = [];
    const errors: { card_id: number; error: string }[] = [];

    // 为每张卡片创建对话任务
    for (const card of cards.rows) {
      try {
        const taskResult = query(
          `INSERT INTO chat_tasks (user_id, chat_api_id, task_type, card_id, workspace_task_id, template_id, original_prompt, status)
           VALUES (?, ?, 'regenerate', ?, ?, ?, ?, 'queued')`,
          [req.userId!, template.chat_api_id, card.id, card.task_id, template_id, card.prompt]
        );
        const chatTaskId = taskResult.lastInsertRowid;

        // 获取完整任务记录并加入队列
        const fullTask = query('SELECT * FROM chat_tasks WHERE id = ?', [chatTaskId]);
        if (fullTask.rows[0]) {
          chatTaskQueue.addTask(fullTask.rows[0]);
          submitted.push(card.id);
        }
      } catch (err) {
        errors.push({ card_id: card.id, error: (err as Error).message });
      }
    }

    return res.status(202).json({ submitted: submitted.length, card_ids: submitted, errors });
  } catch (err) {
    return res.status(500).json({ error: `批量重新生成提交失败: ${(err as Error).message}` });
  }
});

workspaceRouter.get('/cards/:id/images', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const cardCheck = query(
      `SELECT pc.id, pc.selected_image_id FROM prompt_cards pc JOIN workspace_tasks t ON pc.task_id = t.id WHERE pc.id = ? AND t.user_id = ?`,
      [req.params.id, req.userId]
    );
    if (!cardCheck.rows[0]) return res.status(404).json({ error: '卡片不存在' });

    const images = query(
      `SELECT ci.*, wl.api_config_name as model_name
       FROM card_images ci
       LEFT JOIN workspace_api_logs wl ON ci.generation_task_id = wl.generation_task_id AND wl.api_type = 'image'
       WHERE ci.card_id = ? ORDER BY ci.created_at ASC`,
      [req.params.id]
    );

    return res.json({ images: images.rows });
  } catch {
    return res.status(500).json({ error: '获取图片列表失败' });
  }
});

workspaceRouter.get('/cards/:id/status', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const cardCheck = query(
      `SELECT pc.id, pc.prompt, pc.selected_image_id FROM prompt_cards pc JOIN workspace_tasks t ON pc.task_id = t.id WHERE pc.id = ? AND t.user_id = ?`,
      [req.params.id, req.userId]
    );
    if (!cardCheck.rows[0]) return res.status(404).json({ error: '卡片不存在' });

    const card = cardCheck.rows[0];
    const images = query(
      "SELECT id, status, image_url, size, is_selected FROM card_images WHERE card_id = ? ORDER BY created_at ASC",
      [req.params.id]
    );

    const generatingCount = images.rows.filter((i: any) => i.status === 'generating' || i.status === 'pending').length;
    const selectedImage = images.rows.find((i: any) => i.is_selected) || images.rows.find((i: any) => i.status === 'completed');

    return res.json({
      card_id: card.id,
      image_status: generatingCount > 0 ? 'generating' : 'idle',
      images_count: images.rows.length,
      selected_image_url: selectedImage?.image_url || null,
      images: images.rows,
    });
  } catch {
    return res.status(500).json({ error: '获取卡片状态失败' });
  }
});

workspaceRouter.patch('/images/:id/select', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const imageCheck = query(
      `SELECT ci.id, ci.card_id FROM card_images ci
       JOIN prompt_cards pc ON ci.card_id = pc.id
       JOIN workspace_tasks t ON pc.task_id = t.id
       WHERE ci.id = ? AND t.user_id = ?`,
      [req.params.id, req.userId]
    );
    if (!imageCheck.rows[0]) return res.status(404).json({ error: '图片不存在' });

    const { card_id } = imageCheck.rows[0];

    query('UPDATE card_images SET is_selected = 0 WHERE card_id = ?', [card_id]);
    query('UPDATE card_images SET is_selected = 1 WHERE id = ?', [req.params.id]);
    query('UPDATE prompt_cards SET selected_image_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [req.params.id, card_id]);

    return res.json({ message: '已选定图片', image_id: parseInt(req.params.id as string), card_id });
  } catch {
    return res.status(500).json({ error: '选定图片失败' });
  }
});

workspaceRouter.get('/images/history', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 100;
    const images = query(
      `SELECT ci.id, ci.image_url, ci.size, ci.created_at, ci.is_selected,
              pc.prompt, pc.card_index,
              t.id as task_id, t.title as task_title, t.created_at as task_created_at
       FROM card_images ci
       JOIN prompt_cards pc ON ci.card_id = pc.id
       JOIN workspace_tasks t ON pc.task_id = t.id
       WHERE t.user_id = ? AND ci.status = 'completed' AND ci.image_url != ''
       ORDER BY ci.created_at DESC LIMIT ?`,
      [req.userId, limit]
    );
    return res.json({ images: images.rows });
  } catch {
    return res.status(500).json({ error: '获取批量生图历史失败' });
  }
});

workspaceRouter.post('/export', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { task_id, card_ids, format } = req.body;
    console.log('[图片压缩包导出] 开始导出', { task_id, card_ids_count: Array.isArray(card_ids) ? card_ids.length : 0, userId: req.userId });
    if (!task_id) return res.status(400).json({ error: '缺少 task_id' });
    const exportFormat: 'jpg' | 'png' = format === 'png' ? 'png' : 'jpg';

    const result = await buildWorkspaceExportZip(req.userId!, task_id, Array.isArray(card_ids) ? card_ids : undefined, exportFormat);
    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }

    console.log('[图片压缩包导出] 导出完成', { fileCount: result.body.fileCount, size: result.body.zipBuffer.length });
    Object.entries(result.body.headers).forEach(([key, value]) => res.setHeader(key, value));
    return res.send(result.body.zipBuffer);
  } catch (err) {
    console.error('[图片压缩包导出] 导出失败:', err);
    return res.status(500).json({ error: '导出失败' });
  }
});

workspaceRouter.post('/export-ticket', authMiddleware, async (req: AuthRequest, res) => {
  const { task_id, card_ids, format } = req.body;
  if (!task_id) return res.status(400).json({ error: '缺少 task_id' });
  const exportFormat: 'jpg' | 'png' = format === 'png' ? 'png' : 'jpg';

  const ticket = crypto.randomUUID();
  exportTickets.set(ticket, {
    userId: req.userId!,
    taskId: task_id,
    cardIds: Array.isArray(card_ids) ? card_ids : undefined,
    format: exportFormat,
    expiresAt: Date.now() + 2 * 60 * 1000,
  });

  return res.json({ download_url: `/api/workspace/export-download?ticket=${encodeURIComponent(ticket)}` });
});

workspaceRouter.get('/export-download', async (req, res) => {
  try {
    const ticket = String(req.query.ticket || '');
    const record = exportTickets.get(ticket);
    if (!ticket || !record) {
      return res.status(404).json({ error: '下载票据不存在或已失效' });
    }
    if (record.expiresAt < Date.now()) {
      exportTickets.delete(ticket);
      return res.status(410).json({ error: '下载票据已过期' });
    }

    exportTickets.delete(ticket);
    console.log('[图片压缩包导出] 通过下载票据开始导出', { task_id: record.taskId, card_ids_count: record.cardIds?.length || 0, userId: record.userId });
    const result = await buildWorkspaceExportZip(record.userId, record.taskId, record.cardIds, record.format);
    if (result.status !== 200) {
      return res.status(result.status).json(result.body);
    }

    console.log('[图片压缩包导出] 通过下载票据导出完成', { fileCount: result.body.fileCount, size: result.body.zipBuffer.length });
    Object.entries(result.body.headers).forEach(([key, value]) => res.setHeader(key, value));
    return res.send(result.body.zipBuffer);
  } catch (err) {
    console.error('[图片压缩包导出] 通过下载票据导出失败:', err);
    return res.status(500).json({ error: '导出失败' });
  }
});

// 导出 PDF：后端用 pdfkit 生成，每页一张图片，按图片原始尺寸
workspaceRouter.post('/export-pdf', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { task_id, card_ids } = req.body;
    if (!task_id) return res.status(400).json({ error: '缺少 task_id' });

    const taskCheck = query('SELECT id, title FROM workspace_tasks WHERE id = ? AND user_id = ?', [task_id, req.userId]);
    if (!taskCheck.rows[0]) return res.status(404).json({ error: '任务不存在' });

    // 查询有首选图片的卡片
    let cards;
    if (Array.isArray(card_ids) && card_ids.length > 0) {
      const placeholders = card_ids.map(() => '?').join(',');
      cards = query(
        `SELECT pc.card_index, ci.image_url FROM prompt_cards pc
         JOIN card_images ci ON pc.selected_image_id = ci.id
         WHERE pc.task_id = ? AND pc.id IN (${placeholders}) AND ci.image_url != ''
         ORDER BY pc.card_index ASC`,
        [task_id, ...card_ids]
      );
    } else {
      cards = query(
        `SELECT pc.card_index, ci.image_url FROM prompt_cards pc
         JOIN card_images ci ON pc.selected_image_id = ci.id
         WHERE pc.task_id = ? AND ci.image_url != ''
         ORDER BY pc.card_index ASC`,
        [task_id]
      );
    }

    console.log(`[PDF导出] 查询到 ${cards.rows.length} 张有首选图片的卡片`);

    if (cards.rows.length === 0) {
      return res.status(400).json({ error: '没有可导出的图片' });
    }

    // A4 尺寸 (PDF 点, 1点 = 1/72英寸)
    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const MARGIN = 20;

    // 下载每张图片并用 sharp 转为 PNG（pdfkit 对 PNG 支持更好）
    const imagePages: { data: Buffer; width: number; height: number }[] = [];

    for (const row of cards.rows) {
      const imageUrl: string = row.image_url;
      try {
        let imgBuffer: Buffer;

        if (imageUrl.startsWith('/uploads/')) {
          const filePath = path.resolve(process.cwd(), imageUrl.replace(/^\//, ''));
          console.log(`[PDF导出] 本地图片路径: ${filePath}`);
          if (!fs.existsSync(filePath)) {
            console.error(`[PDF导出] 文件不存在: ${filePath}`);
            continue;
          }
          imgBuffer = fs.readFileSync(filePath);
        } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
          console.log(`[PDF导出] 远程图片URL: ${imageUrl}`);
          const imgRes = await fetch(imageUrl);
          if (!imgRes.ok) {
            console.error(`[PDF导出] 远程图片获取失败: HTTP ${imgRes.status}`);
            continue;
          }
          imgBuffer = Buffer.from(await imgRes.arrayBuffer());
        } else {
          console.warn(`[PDF导出] 跳过不支持的URL格式: ${imageUrl}`);
          continue;
        }

        console.log(`[PDF导出] 原始buffer大小: ${imgBuffer.length} bytes`);

        if (imgBuffer.length === 0) {
          console.error(`[PDF导出] 图片buffer为空，跳过`);
          continue;
        }

        // 用 sharp 转为 PNG 并获取尺寸
        const pngBuf = await sharp(imgBuffer).png().toBuffer();
        const metadata = await sharp(pngBuf).metadata();
        const width = metadata.width || 0;
        const height = metadata.height || 0;
        if (width <= 0 || height <= 0) {
          console.error(`[PDF导出] 图片尺寸无效: ${width}x${height}`);
          continue;
        }

        console.log(`[PDF导出] 图片尺寸: ${width}x${height}, PNG buffer: ${pngBuf.length} bytes`);
        imagePages.push({ data: pngBuf, width, height });
      } catch (err) {
        console.error(`[PDF导出] 图片处理失败(card_index=${row.card_index}):`, err);
      }
    }

    if (imagePages.length === 0) {
      return res.status(400).json({ error: '所有图片加载失败，无法生成 PDF' });
    }

    console.log(`[PDF导出] 共 ${imagePages.length} 张图片准备生成PDF`);

    // 用 pdfkit 生成 PDF
    const pdfDoc = new PDFDocument({ autoFirstPage: false, bufferPages: true });

    // 先绑定 data 事件，确保不丢失数据
    const pdfBuffers: Buffer[] = [];
    pdfDoc.on('data', (chunk: Buffer) => pdfBuffers.push(chunk));

    for (let i = 0; i < imagePages.length; i++) {
      const { data, width, height } = imagePages[i];
      // 使用 A4 页面，图片居中缩放显示
      pdfDoc.addPage({ size: 'A4', margin: 0 });
      const maxW = PAGE_W - MARGIN * 2;
      const maxH = PAGE_H - MARGIN * 2;
      const scale = Math.min(maxW / width, maxH / height);
      const drawW = width * scale;
      const drawH = height * scale;
      const x = (PAGE_W - drawW) / 2;
      const y = (PAGE_H - drawH) / 2;
      pdfDoc.image(data, x, y, { width: drawW, height: drawH });
    }

    const pdfBytes = await new Promise<Buffer>((resolve, reject) => {
      pdfDoc.on('end', () => resolve(Buffer.concat(pdfBuffers)));
      pdfDoc.on('error', reject);
      pdfDoc.end();
    });

    console.log(`[PDF导出] PDF生成完成, 大小: ${pdfBytes.length} bytes`);

    // 设置响应头，返回 PDF 文件
    const filename = encodeURIComponent(`${taskCheck.rows[0].title || '批量生图'}_导出.pdf`);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"; filename*=UTF-8''${filename}`);
    res.setHeader('Content-Length', pdfBytes.length);
    res.send(pdfBytes);
  } catch (err) {
    console.error('[PDF导出] 生成失败:', err);
    return res.status(500).json({ error: 'PDF 导出失败' });
  }
});
