import { Router } from 'express';
import multer from 'multer';
import sharp from 'sharp';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { uploadImage } from '../services/cos.js';

export const uploadRouter = Router();

// 允许的图片扩展名白名单
const ALLOWED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg']);
const ALLOWED_MIME_TYPES = new Set(['image/png', 'image/jpeg']);
const MAX_IMAGE_DIMENSION = 8192;

const referenceImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

uploadRouter.post('/reference-image', authMiddleware, referenceImageUpload.single('image'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '请上传图片文件' });
    }

    const ext = (req.file.originalname.split('.').pop() || '').toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_MIME_TYPES.has(req.file.mimetype)) {
      return res.status(400).json({ error: `不支持的文件类型: .${ext}，仅支持 ${[...ALLOWED_EXTENSIONS].map(e => '.' + e).join('/')}` });
    }

    const metadata = await sharp(req.file.buffer).metadata();
    if (!metadata.width || !metadata.height || !['png', 'jpeg'].includes(metadata.format || '')) {
      return res.status(400).json({ error: '无法读取图片，请上传 PNG、JPG、JPEG 格式图片' });
    }
    if (metadata.width > MAX_IMAGE_DIMENSION || metadata.height > MAX_IMAGE_DIMENSION) {
      return res.status(400).json({ error: `图片尺寸为 ${metadata.width}×${metadata.height}，宽和高最大支持 8192px` });
    }

    const filename = `ref_${req.userId}_${Date.now()}.${ext}`;
    const url = await uploadImage(req.file.buffer, filename);

    return res.json({ url });
  } catch (error) {
    if (error instanceof Error && /unsupported image format|input buffer contains unsupported image format/i.test(error.message)) {
      return res.status(400).json({ error: '无法读取图片，请上传 PNG、JPG、JPEG 格式图片' });
    }
    return res.status(500).json({ error: '参考图上传失败' });
  }
});
