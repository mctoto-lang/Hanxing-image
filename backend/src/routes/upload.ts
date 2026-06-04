import { Router } from 'express';
import multer from 'multer';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { uploadImage } from '../services/cos.js';

export const uploadRouter = Router();

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

    const ext = req.file.originalname.split('.').pop() || 'png';
    const filename = `ref_${req.userId}_${Date.now()}.${ext}`;
    const url = await uploadImage(req.file.buffer, filename);

    return res.json({ url });
  } catch {
    return res.status(500).json({ error: '参考图上传失败' });
  }
});
