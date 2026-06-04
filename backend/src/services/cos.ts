import COS from 'cos-nodejs-sdk-v5'
import fs from 'fs'
import path from 'path'
import { query } from '../db/index.js'

interface StorageSettings {
  storage_provider: 'local' | 'cos'
  cos_secret_id: string
  cos_secret_key: string
  cos_bucket: string
  cos_region: string
  cos_base_url: string
  cos_image_prefix: string
  local_image_prefix: string
}

function getStorageSettings(): StorageSettings {
  const result = query('SELECT key, value FROM system_settings')
  const map = Object.fromEntries(result.rows.map((row) => [row.key, row.value ?? '']))

  return {
    storage_provider: map.storage_provider === 'cos' ? 'cos' : 'local',
    cos_secret_id: map.cos_secret_id || process.env.COS_SECRET_ID || '',
    cos_secret_key: map.cos_secret_key || process.env.COS_SECRET_KEY || '',
    cos_bucket: map.cos_bucket || process.env.COS_BUCKET || '',
    cos_region: map.cos_region || process.env.COS_REGION || '',
    cos_base_url: map.cos_base_url || '',
    cos_image_prefix: map.cos_image_prefix || process.env.COS_IMAGE_PREFIX || 'image/',
    local_image_prefix: map.local_image_prefix || 'image/',
  }
}

function normalizePrefix(prefix: string) {
  if (!prefix) return ''
  return prefix.endsWith('/') ? prefix : `${prefix}/`
}

function ensureUploadsDir() {
  const uploadsDir = path.resolve(process.cwd(), 'uploads')
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true })
  }
  return uploadsDir
}

async function uploadToLocal(buffer: Buffer, filename: string, prefix: string): Promise<string> {
  const uploadsDir = ensureUploadsDir()
  const normalizedPrefix = normalizePrefix(prefix)
  const relativeDir = normalizedPrefix ? normalizedPrefix.replace(/^\/+|\/+$/g, '') : ''
  const targetDir = relativeDir ? path.join(uploadsDir, relativeDir) : uploadsDir

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  const targetPath = path.join(targetDir, filename)
  await fs.promises.writeFile(targetPath, buffer)
  const urlPath = relativeDir ? `${relativeDir}/${filename}` : filename
  return `/uploads/${urlPath}`
}

async function uploadToCos(buffer: Buffer, filename: string, settings: StorageSettings): Promise<string> {
  if (!settings.cos_secret_id || !settings.cos_secret_key || !settings.cos_bucket || !settings.cos_region) {
    throw new Error('腾讯云COS配置不完整，请在管理后台完善密钥、桶名称和地域')
  }

  const cos = new COS({
    SecretId: settings.cos_secret_id,
    SecretKey: settings.cos_secret_key,
  })

  const key = `${normalizePrefix(settings.cos_image_prefix)}${filename}`
  const baseUrl = settings.cos_base_url || `https://${settings.cos_bucket}.cos.${settings.cos_region}.myqcloud.com`

  return new Promise((resolve, reject) => {
    cos.putObject(
      {
        Bucket: settings.cos_bucket,
        Region: settings.cos_region,
        Key: key,
        Body: buffer,
        ContentType: guessContentType(filename),
      },
      (err) => {
        if (err) {
          console.error(`[COS] 上传失败: ${err.message}`)
          reject(err)
        } else {
          const url = `${baseUrl.replace(/\/$/, '')}/${key}`
          console.log(`[COS] 上传成功: ${url}`)
          resolve(url)
        }
      },
    )
  })
}

export async function testCosConnection(input?: Partial<StorageSettings>): Promise<{ message: string; url: string }> {
  const merged: StorageSettings = {
    ...getStorageSettings(),
    ...input,
    storage_provider: input?.storage_provider === 'cos' ? 'cos' : 'local',
  }

  if (!merged.cos_secret_id || !merged.cos_secret_key || !merged.cos_bucket || !merged.cos_region) {
    throw new Error('腾讯云COS配置不完整，请填写 SecretId、SecretKey、Bucket 和地域')
  }

  const cos = new COS({
    SecretId: merged.cos_secret_id,
    SecretKey: merged.cos_secret_key,
  })

  await new Promise<void>((resolve, reject) => {
    cos.headBucket(
      {
        Bucket: merged.cos_bucket,
        Region: merged.cos_region,
      },
      (err) => {
        if (err) {
          reject(err)
          return
        }
        resolve()
      },
    )
  })

  const baseUrl = merged.cos_base_url || `https://${merged.cos_bucket}.cos.${merged.cos_region}.myqcloud.com`
  return {
    message: 'COS 配置测试成功',
    url: `${baseUrl.replace(/\/$/, '')}/${normalizePrefix(merged.cos_image_prefix)}`,
  }
}

export async function uploadImage(buffer: Buffer, filename: string): Promise<string> {
  const settings = getStorageSettings()

  if (settings.storage_provider === 'cos') {
    return uploadToCos(buffer, filename, settings)
  }

  return uploadToLocal(buffer, filename, settings.local_image_prefix)
}

export function generateFilename(taskId: number, index: number, ext = 'png'): string {
  const ts = Date.now()
  return `${taskId}_${ts}_${index}.${ext}`
}

function guessContentType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
  }
  return map[ext || ''] || 'image/png'
}
