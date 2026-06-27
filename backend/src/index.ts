import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { authRouter } from './routes/auth.js';
import { userRouter } from './routes/users.js';
import { modelRouter } from './routes/models.js';
import { taskRouter } from './routes/tasks.js';
import { adminRouter } from './routes/admin.js';
import { uploadRouter } from './routes/upload.js';
import { workspaceRouter } from './routes/workspace.js';
import { workspaceAdminRouter } from './routes/workspaceAdmin.js';
import { imageRouter } from './routes/image.js';
import productRouter from './routes/product.js';
import { errorHandler } from './middleware/errorHandler.js';
import { migrate } from './db/migrate.js';
import { seed } from './db/seed.js';

dotenv.config();

// 启动时校验关键环境变量
const INSECURE_JWT_SECRETS = new Set(['', 'hanxing-secret-key', 'hanxing-jwt-secret-change-me']);
if (INSECURE_JWT_SECRETS.has(process.env.JWT_SECRET || '')) {
  console.error('[启动失败] 必须配置安全的 JWT_SECRET 环境变量（不要使用默认值）');
  process.exit(1);
}
if (!process.env.ENCRYPTION_KEY) {
  console.error('[启动失败] 必须配置 ENCRYPTION_KEY 环境变量（用于加密 API Key 等敏感数据）');
  process.exit(1);
}

migrate();
seed().catch(console.error);

// 确保必要的上传目录存在
const uploadDirs = ['uploads/image', 'uploads/icons', 'uploads/thumb'];
for (const dir of uploadDirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[初始化] 创建目录: ${dir}`);
  }
}

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));
app.use(express.json());
app.use('/uploads', express.static('uploads', {
  maxAge: '7d',
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // 图片文件设置长期缓存
    if (/\.(png|jpe?g|webp|gif|svg|ico)$/i.test(filePath)) {
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  },
}));

// 健康检查端点（用于Docker健康检查）
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRouter);
app.use('/api/admin/users', userRouter);
app.use('/api/models', modelRouter);
app.use('/api/tasks', taskRouter);
app.use('/api/admin', adminRouter);
app.use('/api/upload', uploadRouter);
app.use('/api/workspace', workspaceRouter);
app.use('/api/admin/workspace', workspaceAdminRouter);
app.use('/api/image', imageRouter);
app.use('/api/product', productRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[瀚星AI图片工作台] 后端服务已启动: http://localhost:${PORT}`);
});

export default app;
