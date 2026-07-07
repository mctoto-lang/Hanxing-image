import { Router, type Request, type Response } from 'express'
import fs from 'fs'
import path from 'path'
import dns from 'dns/promises'
import { authMiddleware, AuthRequest } from '../middleware/auth.js'
import { query } from '../db/index.js'

const router = Router()

// 允许代理的远程域名白名单（COS 域名等）
const ALLOWED_PROXY_DOMAINS = [
  '.myqcloud.com',       // 腾讯云 COS
  '.cos.',               // COS 域名通配
  '.aliyuncs.com',       // 阿里云 OSS
  '.amazonaws.com',      // AWS S3
  '.cloudfront.net',     // CloudFront CDN
]

function getConfiguredStorageHostnames(): Set<string> {
  const hostnames = new Set<string>()
  const result = query('SELECT key, value FROM system_settings WHERE key IN (?, ?, ?)', ['cos_base_url', 'cos_bucket', 'cos_region'])
  const settings = Object.fromEntries(result.rows.map((row) => [String(row.key), String(row.value || '')]))
  const baseUrl = settings.cos_base_url?.trim()
  const bucket = settings.cos_bucket?.trim()
  const region = settings.cos_region?.trim()

  if (baseUrl) {
    try {
      hostnames.add(new URL(baseUrl).hostname.toLowerCase())
    } catch {
      const normalized = baseUrl.replace(/^https?:\/\//, '').split('/')[0]?.trim().toLowerCase()
      if (normalized) hostnames.add(normalized)
    }
  }

  if (bucket && region) {
    hostnames.add(`${bucket}.cos.${region}.myqcloud.com`.toLowerCase())
  }

  if (process.env.COS_BASE_URL) {
    try {
      hostnames.add(new URL(process.env.COS_BASE_URL).hostname.toLowerCase())
    } catch {
      const normalized = process.env.COS_BASE_URL.replace(/^https?:\/\//, '').split('/')[0]?.trim().toLowerCase()
      if (normalized) hostnames.add(normalized)
    }
  }

  if (process.env.COS_BUCKET && process.env.COS_REGION) {
    hostnames.add(`${process.env.COS_BUCKET}.cos.${process.env.COS_REGION}.myqcloud.com`.toLowerCase())
  }

  return hostnames
}

// 内网 IP 段（禁止代理访问）
const PRIVATE_IP_RANGES = [
  { start: '0.0.0.0', end: '0.255.255.255' },
  { start: '10.0.0.0', end: '10.255.255.255' },
  { start: '100.64.0.0', end: '100.127.255.255' },
  { start: '127.0.0.0', end: '127.255.255.255' },
  { start: '169.254.0.0', end: '169.254.255.255' },
  { start: '172.16.0.0', end: '172.31.255.255' },
  { start: '192.0.0.0', end: '192.0.0.255' },
  { start: '192.168.0.0', end: '192.168.255.255' },
  { start: '198.18.0.0', end: '198.19.255.255' },
]

function ipToLong(ip: string): number {
  return ip.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet), 0) >>> 0
}

function isPrivateIP(ip: string): boolean {
  // IPv6 回环地址
  if (ip === '::1' || ip === '::') return true
  // 仅检查 IPv4
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return false
  const long = ipToLong(ip)
  return PRIVATE_IP_RANGES.some(
    (range) => long >= ipToLong(range.start) && long <= ipToLong(range.end)
  )
}

function isDomainAllowed(hostname: string): boolean {
  const lower = hostname.toLowerCase()
  return ALLOWED_PROXY_DOMAINS.some((d) => lower.endsWith(d) || lower.includes(d))
}

function isConfiguredStorageHostname(hostname: string): boolean {
  return getConfiguredStorageHostnames().has(hostname.toLowerCase())
}

/**
 * 检查远程 URL 是否安全（域名白名单 + DNS 解析防内网）
 */
async function isRemoteUrlSafe(url: string): Promise<{ safe: boolean; reason?: string }> {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return { safe: false, reason: 'URL 格式无效' }
  }

  // 仅允许 http/https
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: '仅支持 http/https 协议' }
  }

  const hostname = parsed.hostname
  const isConfiguredStorageHost = isConfiguredStorageHostname(hostname)

  // 域名白名单校验
  if (!isDomainAllowed(hostname)) {
    return { safe: false, reason: `域名 ${hostname} 不在代理白名单中` }
  }

  // DNS 解析后检查是否为内网 IP（防止 DNS 重绑定攻击）
  try {
    const addresses = await dns.resolve4(hostname)
    for (const addr of addresses) {
      if (isPrivateIP(addr) && !isConfiguredStorageHost) {
        return { safe: false, reason: '解析到内网 IP，禁止访问' }
      }
    }
  } catch {
    // DNS 解析失败，可能是 IPv6
    try {
      const v6Addresses = await dns.resolve6(hostname)
      for (const addr of v6Addresses) {
        if ((addr === '::1' || addr === '::' || addr.startsWith('fc') || addr.startsWith('fd') || addr.startsWith('fe80')) && !isConfiguredStorageHost) {
          return { safe: false, reason: '解析到内网 IPv6 地址，禁止访问' }
        }
      }
    } catch {
      return { safe: false, reason: 'DNS 解析失败' }
    }
  }

  return { safe: true }
}

// 缩略图缓存目录
const THUMB_DIR = path.resolve('uploads/thumb')
if (!fs.existsSync(THUMB_DIR)) {
  fs.mkdirSync(THUMB_DIR, { recursive: true })
}

// 允许的缩略图尺寸（防止任意尺寸攻击）
const ALLOWED_SIZES = new Set([
  '100x100', '150x150', '200x200', '400x400', '400x600',
])

// 允许的仅宽度缩略图（保持原始比例，只限制宽度）
const ALLOWED_WIDTHS = new Set([100, 150, 200, 400])

/**
 * GET /api/image/thumb?url=/uploads/image/xxx.png&w=200&h=200
 * 本地图片缩略图接口，首次请求时用 sharp 生成并缓存到 uploads/thumb/
 */
router.get('/thumb', async (req: Request, res: Response) => {
  const { url, w, h } = req.query
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: '缺少 url 参数' })
    return
  }

  const width = parseInt(String(w)) || 0
  const height = parseInt(String(h)) || 0
  if (width <= 0 && height <= 0) {
    res.status(400).json({ error: '缺少 w 或 h 参数' })
    return
  }

  // 判断模式：只传宽度时保持原始比例，同时传宽高时裁剪为指定尺寸
  const fitMode = height <= 0 ? 'inside' : 'cover'
  const finalWidth = width
  const finalHeight = height
  if (fitMode === 'cover') {
    // cover 模式：需要完整的尺寸校验
    const sizeKey = `${finalWidth}x${finalHeight}`
    if (!ALLOWED_SIZES.has(sizeKey)) {
      res.status(400).json({ error: `不支持的缩略图尺寸: ${sizeKey}` })
      return
    }
  } else {
    // inside 模式：只校验宽度
    if (!ALLOWED_WIDTHS.has(finalWidth)) {
      res.status(400).json({ error: `不支持的缩略图宽度: ${finalWidth}` })
      return
    }
  }

  const sizeKey = fitMode === 'cover' ? `${finalWidth}x${finalHeight}` : `${finalWidth}w`

  // 安全检查：只允许 /uploads/ 下的本地图片
  if (!url.startsWith('/uploads/')) {
    res.status(400).json({ error: '只支持本地图片' })
    return
  }

  // 将 URL 路径映射到文件系统路径
  const relativePath = url.replace(/^\/uploads\//, '')
  const originalPath = path.resolve('uploads', relativePath)

  // 防止路径遍历攻击
  if (!originalPath.startsWith(path.resolve('uploads'))) {
    res.status(403).json({ error: '非法路径' })
    return
  }

  if (!fs.existsSync(originalPath)) {
    res.status(404).json({ error: '原图不存在' })
    return
  }

  // 缩略图缓存路径: uploads/thumb/{sizeKey}_{原相对路径hash}.{ext}
  const ext = path.extname(originalPath) || '.png'
  const thumbFilename = `${sizeKey}_${Buffer.from(relativePath).toString('base64url')}${ext}`
  const thumbPath = path.join(THUMB_DIR, thumbFilename)

  // 如果缓存存在，直接返回
  if (fs.existsSync(thumbPath)) {
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
    res.setHeader('Content-Type', ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png')
    fs.createReadStream(thumbPath).pipe(res)
    return
  }

  // 使用 sharp 生成缩略图
  try {
    const sharp = (await import('sharp')).default
    const resizeOptions: { width?: number; height?: number; fit?: string; withoutEnlargement?: boolean } = {}
    if (fitMode === 'inside') {
      // 只限制宽度，保持原始比例
      resizeOptions.width = finalWidth
      resizeOptions.fit = 'inside'
      resizeOptions.withoutEnlargement = true
    } else {
      // cover 模式：裁剪为指定尺寸
      if (finalWidth > 0) resizeOptions.width = finalWidth
      if (finalHeight > 0) resizeOptions.height = finalHeight
      resizeOptions.fit = 'cover'
    }

    await sharp(originalPath)
      .resize(resizeOptions as any)
      .png({ quality: 85 })
      .toFile(thumbPath)

    res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
    res.setHeader('Content-Type', 'image/png')
    fs.createReadStream(thumbPath).pipe(res)
  } catch (err) {
    console.error('[缩略图] 生成失败:', err)
    // 降级：返回原图
    res.setHeader('Cache-Control', 'public, max-age=3600')
    res.setHeader('Content-Type', ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : 'image/png')
    fs.createReadStream(originalPath).pipe(res)
  }
})

/**
 * GET /api/image/proxy?url=xxx
 * 图片代理接口：用于前端导出 PDF 时绕过 CORS 限制
 * 支持 /uploads/ 本地路径和 http/https 远程 URL（需认证，远程 URL 需在白名单内）
 */
router.get('/proxy', authMiddleware, async (req: AuthRequest, res: Response) => {
  const { url } = req.query
  const format = req.query.format === 'png' ? 'png' : req.query.format === 'jpg' || req.query.format === 'jpeg' ? 'jpg' : null
  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: '缺少 url 参数' })
    return
  }

  // 本地图片：直接读取文件返回
  if (url.startsWith('/uploads/')) {
    const relativePath = url.replace(/^\/uploads\//, '')
    const filePath = path.resolve('uploads', relativePath)
    if (!filePath.startsWith(path.resolve('uploads'))) {
      res.status(403).json({ error: '非法路径' })
      return
    }
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: '文件不存在' })
      return
    }
    if (format) {
      try {
        const sharp = (await import('sharp')).default
        const output = format === 'png'
          ? await sharp(filePath).png().toBuffer()
          : await sharp(filePath).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer()
        res.setHeader('Content-Type', format === 'png' ? 'image/png' : 'image/jpeg')
        res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
        res.send(output)
        return
      } catch (err) {
        console.error('[图片代理] 本地图片转码失败:', err)
        res.status(500).json({ error: '图片转码失败' })
        return
      }
    }

    const ext = path.extname(filePath).toLowerCase()
    const contentType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/png'
    res.setHeader('Content-Type', contentType)
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
    fs.createReadStream(filePath).pipe(res)
    return
  }

  // 远程图片：服务端代理下载（需通过安全检查）
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const safety = await isRemoteUrlSafe(url)
    if (!safety.safe) {
      res.status(403).json({ error: safety.reason })
      return
    }

    try {
      const imgRes = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'HanxingImageProxy/1.0' },
      })
      if (!imgRes.ok) {
        res.status(imgRes.status).json({ error: `远程图片获取失败: ${imgRes.status}` })
        return
      }
      // 校验响应 Content-Type 为图片
      const contentType = imgRes.headers.get('content-type') || ''
      if (!contentType.startsWith('image/')) {
        res.status(400).json({ error: '远程资源不是图片类型' })
        return
      }
      const buffer = Buffer.from(await imgRes.arrayBuffer())
      // 限制代理响应大小（10MB）
      if (buffer.length > 10 * 1024 * 1024) {
        res.status(413).json({ error: '远程图片过大' })
        return
      }
      if (format) {
        try {
          const sharp = (await import('sharp')).default
          const output = format === 'png'
            ? await sharp(buffer).png().toBuffer()
            : await sharp(buffer).flatten({ background: '#ffffff' }).jpeg({ quality: 92 }).toBuffer()
          res.setHeader('Content-Type', format === 'png' ? 'image/png' : 'image/jpeg')
          res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
          res.send(output)
          return
        } catch (err) {
          console.error('[图片代理] 远程图片转码失败:', err)
          res.status(500).json({ error: '图片转码失败' })
          return
        }
      }
      res.setHeader('Content-Type', contentType)
      res.setHeader('Cache-Control', 'public, max-age=604800, immutable')
      res.send(buffer)
    } catch (err) {
      console.error('[图片代理] 远程图片下载失败:', err)
      res.status(502).json({ error: '远程图片下载失败' })
    }
    return
  }

  res.status(400).json({ error: '不支持的 URL 格式' })
})

export const imageRouter = router
