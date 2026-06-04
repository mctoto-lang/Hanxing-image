import { Router } from 'express';
import { query } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export const galleryRouter = Router();

galleryRouter.get('/', authMiddleware, async (_req: AuthRequest, res) => {
  try {
    const result = query(
      `SELECT g.image_url, t.prompt, m.display_name as model_name, u.username
       FROM gallery g
       JOIN generation_tasks t ON g.task_id = t.id
       JOIN models m ON t.model_id = m.id
       JOIN users u ON t.user_id = u.id
       WHERE g.is_public = true
       ORDER BY g.created_at DESC`
    );
    return res.json({ gallery: result.rows });
  } catch {
    return res.status(500).json({ error: '获取画廊失败' });
  }
});
