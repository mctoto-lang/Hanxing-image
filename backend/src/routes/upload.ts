import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { uploadImage } from '../services/cos.js';

export const uploadRouter = Router();

// 允许的图片扩展名白名单
const ALLOWED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif']);

const referenceImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    cb(null, allowed.includes(file.mimetype));
  },
});

uploadRouter.post('/reference-image', authMiddleware, referenceImageUpload.single('image'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传图片文件' });
    }

    // 扩展名白名单校验（防止上传 .html/.svg 等危险文件）
    const ext = (req.file.originalname.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return res.status(400).json({ error: `不支持的文件类型: .${ext}，仅支持 ${[...ALLOWED_EXTENSIONS].map(e => '.' + e).join('/')}` });
    }

    const filename = `ref_${req.userId}_${Date.now()}.${ext}`;
    const url = await uploadImage(req.file.buffer, filename);

    return res.json({ url });
  } catch {
    return res.status(500).json({ error: '参考图上传失败' });
  }
});
