import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../db/index.js';
import { authMiddleware, adminMiddlewareRealtime, AuthRequest } from '../middleware/auth.js';

export const userRouter = Router();

userRouter.get('/', authMiddleware, adminMiddlewareRealtime, async (_req: AuthRequest, res) => {
  try {
    const result = query(
      `SELECT u.id, u.username, u.role, u.credits, u.creative_credits, u.project_credits, u.daily_credits_remaining, u.daily_credits_date, u.is_active, u.created_at, g.name as group_name
       FROM users u LEFT JOIN permission_groups g ON u.group_id = g.id
       ORDER BY u.created_at DESC`
    );
    return res.json({ users: result.rows });
  } catch {
    return res.status(500).json({ error: '获取用户列表失败' });
  }
});

userRouter.post('/', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
  try {
    const { username, password, group_id, role } = req.body;
    if (!username || typeof username !== 'string' || username.trim().length < 3 || username.length > 50) {
      return res.status(400).json({ error: '用户名长度需为 3-50 个字符' });
    }
    if (!password || typeof password !== 'string' || password.length < 4 || password.length > 100) {
      return res.status(400).json({ error: '密码长度需为 4-100 个字符' });
    }
    const passwordHash = await bcrypt.hash(password, 10);

    let initialCreativeCredits = 0;
    let initialProjectCredits = 0;
    if (group_id) {
      const groupResult = query('SELECT initial_creative_credits, initial_project_credits FROM permission_groups WHERE id = ?', [group_id]);
      if (groupResult.rows.length > 0) {
        initialCreativeCredits = groupResult.rows[0].initial_creative_credits || 0;
        initialProjectCredits = groupResult.rows[0].initial_project_credits || 0;
      }
    }

    const userRole = role === 'admin' ? 'admin' : 'user';
    const result = query(
      'INSERT INTO users (username, password_hash, role, creative_credits, project_credits, group_id) VALUES (?, ?, ?, ?, ?, ?)',
      [username, passwordHash, userRole, initialCreativeCredits, initialProjectCredits, group_id || null]
    );
    const inserted = query(
      'SELECT id, username, role, creative_credits, project_credits, group_id FROM users WHERE id = ?',
      [result.lastInsertRowid]
    );
    return res.status(201).json({ user: inserted.rows[0] });
  } catch (err) {
    if ((err as any).message?.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: '用户名已存在' });
    }
    return res.status(500).json({ error: '创建用户失败' });
  }
});

userRouter.put('/:id/credits', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
  try {
    const { credits, creative_credits, project_credits } = req.body;
    const updateFields: string[] = [];
    const updateValues: any[] = [];

    // 校验积分值为非负整数
    const validateCredits = (val: any): boolean => Number.isInteger(val) && val >= 0;
    if (creative_credits !== undefined) {
      if (!validateCredits(creative_credits)) return res.status(400).json({ error: '创作积分必须为非负整数' });
      updateFields.push('creative_credits = ?');
      updateValues.push(creative_credits);
    }
    if (project_credits !== undefined) {
      if (!validateCredits(project_credits)) return res.status(400).json({ error: '项目积分必须为非负整数' });
      updateFields.push('project_credits = ?');
      updateValues.push(project_credits);
    }
    if (credits !== undefined) {
      if (!validateCredits(credits)) return res.status(400).json({ error: '积分必须为非负整数' });
      updateFields.push('credits = ?');
      updateValues.push(credits);
    }

    if (updateFields.length === 0) {
      return res.status(400).json({ error: '未提供积分更新数据' });
    }

    updateFields.push('updated_at = CURRENT_TIMESTAMP');
    updateValues.push(req.params.id);

    const result = query(
      `UPDATE users SET ${updateFields.join(', ')} WHERE id = ?`,
      updateValues
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const updated = query(
      'SELECT id, username, credits, creative_credits, project_credits FROM users WHERE id = ?',
      [req.params.id]
    );
    return res.json({ user: updated.rows[0] });
  } catch {
    return res.status(500).json({ error: '更新积分失败' });
  }
});

userRouter.put('/:id/group', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
  try {
    const { group_id } = req.body;
    if (group_id === null || group_id === undefined) {
      return res.status(400).json({ error: '权限组ID不能为空' });
    }
    if (!Number.isInteger(group_id) || group_id <= 0) {
      return res.status(400).json({ error: '无效的权限组ID' });
    }
    const groupCheck = query('SELECT id FROM permission_groups WHERE id = ?', [group_id]);
    if (groupCheck.rows.length === 0) {
      return res.status(400).json({ error: '权限组不存在' });
    }
    const result = query(
      'UPDATE users SET group_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [group_id, req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const updated = query(
      'SELECT id, username, group_id FROM users WHERE id = ?',
      [req.params.id]
    );
    return res.json({ user: updated.rows[0] });
  } catch {
    return res.status(500).json({ error: '更新权限组失败' });
  }
});

userRouter.put('/:id/toggle-active', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
  try {
    const result = query(
      'UPDATE users SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const updated = query(
      'SELECT id, username, is_active FROM users WHERE id = ?',
      [req.params.id]
    );
    return res.json({ user: updated.rows[0] });
  } catch {
    return res.status(500).json({ error: '更新用户状态失败' });
  }
});

userRouter.put('/:id/password', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
  try {
    const { new_password } = req.body;
    if (!new_password || new_password.length < 4) {
      return res.status(400).json({ error: '新密码不能少于4位' });
    }
    const passwordHash = await bcrypt.hash(new_password, 10);
    const result = query(
      'UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [passwordHash, req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    return res.json({ message: '密码已更新' });
  } catch {
    return res.status(500).json({ error: '更新密码失败' });
  }
});

userRouter.put('/:id/role', authMiddleware, adminMiddlewareRealtime, async (req: AuthRequest, res) => {
  try {
    const { role } = req.body;
    if (!role || !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: '无效的角色值' });
    }
    const result = query(
      'UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [role, req.params.id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: '用户不存在' });
    }
    const updated = query(
      'SELECT id, username, role FROM users WHERE id = ?',
      [req.params.id]
    );
    return res.json({ user: updated.rows[0] });
  } catch {
    return res.status(500).json({ error: '更新角色失败' });
  }
});
