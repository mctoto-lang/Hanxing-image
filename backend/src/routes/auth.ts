import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { query } from '../db/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

export const authRouter = Router();

// 登录接口速率限制：每 IP 每 15 分钟最多 10 次尝试
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: any) => ipKeyGenerator(req.ip),
  message: { error: '登录尝试过于频繁，请 15 分钟后重试' },
});

authRouter.post('/login', loginLimiter, async (req: AuthRequest, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ error: '用户名和密码不能为空' });
    }
    const result = query('SELECT * FROM users WHERE username = ? AND is_active = 1', [username]);
    const user = result.rows[0];
    if (!user) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: '用户名或密码错误' });
    }
    const JWT_SECRET = process.env.JWT_SECRET!;
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );
    query(
      'INSERT INTO login_logs (user_id, ip_address, user_agent) VALUES (?, ?, ?)',
      [user.id, req.ip, req.headers['user-agent']]
    );
    return res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        credits: user.credits,
        creative_credits: user.creative_credits || 0,
        project_credits: user.project_credits || 0,
      },
    });
  } catch (err) {
    console.error('登录异常:', err);
    return res.status(500).json({ error: '登录失败' });
  }
});

authRouter.get('/me', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const result = query(
      `SELECT u.id, u.username, u.role, u.credits, u.creative_credits, u.project_credits, u.group_id,
       g.name as group_name, g.allowed_pages
       FROM users u LEFT JOIN permission_groups g ON u.group_id = g.id
       WHERE u.id = ?`,
      [req.userId]
    );
    const user = result.rows[0];
    if (!user) {
      return res.status(404).json({ error: '用户不存在' });
    }
    return res.json({ user });
  } catch {
    return res.status(500).json({ error: '获取用户信息失败' });
  }
});

authRouter.get('/credit-logs', authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { type } = req.query;
    const creditsType = type === 'project' ? 'project' : 'creative';
    
    const result = query(
      `SELECT id, credits_charged, credits_type, prompt, status, created_at
       FROM generation_tasks
       WHERE user_id = ? AND credits_type = ? AND credits_charged > 0
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.userId, creditsType]
    );
    
    return res.json({ logs: result.rows });
  } catch {
    return res.status(500).json({ error: '获取积分明细失败' });
  }
});
