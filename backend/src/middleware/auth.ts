import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { query } from '../db/index.js';

export interface AuthRequest extends Request {
  userId?: number;
  userRole?: string;
}

export function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    return res.status(401).json({ error: '未提供认证令牌' });
  }
  try {
    const JWT_SECRET = process.env.JWT_SECRET!;
    const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; role: string };
    req.userId = decoded.userId;
    req.userRole = decoded.role;
    next();
  } catch {
    return res.status(401).json({ error: '认证令牌无效或已过期' });
  }
}

export function adminMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  next();
}

/**
 * 实时校验用户是否仍为管理员（查询数据库）
 * 防止用户被降权后仍能使用已签发的 token 访问管理员接口
 */
export function adminMiddlewareRealtime(req: AuthRequest, res: Response, next: NextFunction) {
  if (req.userRole !== 'admin') {
    return res.status(403).json({ error: '需要管理员权限' });
  }
  // 实时查询数据库验证用户角色
  const result = query('SELECT role, is_active FROM users WHERE id = ?', [req.userId]);
  const user = result.rows[0];
  if (!user || !user.is_active || user.role !== 'admin') {
    return res.status(403).json({ error: '管理员权限已失效，请重新登录' });
  }
  next();
}
