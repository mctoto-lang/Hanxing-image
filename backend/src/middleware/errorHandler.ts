import { Request, Response, NextFunction } from 'express';

export function errorHandler(err: any, _req: Request, res: Response, _next: NextFunction) {
  console.error('服务器错误:', err.message, err.stack);
  const status = typeof err.status === 'number' && err.status >= 400 && err.status < 600
    ? err.status
    : 500;
  const isProduction = process.env.NODE_ENV === 'production';
  res.status(status).json({
    error: status < 500 ? '请求错误' : '服务器内部错误',
    ...(isProduction ? {} : { detail: err.message }),
  });
}
