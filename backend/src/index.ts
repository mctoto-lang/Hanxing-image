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
import { galleryRouter } from './routes/gallery.js';
import { uploadRouter } from './routes/upload.js';
import { errorHandler } from './middleware/errorHandler.js';
import { migrate } from './db/migrate.js';
import { seed } from './db/seed.js';

dotenv.config();

migrate();
seed().catch(console.error);

// 确保必要的上传目录存在
const uploadDirs = ['uploads/image', 'uploads/icons'];
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
app.use('/uploads', express.static('uploads'));

app.use('/api/auth', authRouter);
app.use('/api/admin/users', userRouter);
app.use('/api/models', modelRouter);
app.use('/api/tasks', taskRouter);
app.use('/api/admin', adminRouter);
app.use('/api/gallery', galleryRouter);
app.use('/api/upload', uploadRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`[瀚星AI图片工作台] 后端服务已启动: http://localhost:${PORT}`);
});

export default app;
