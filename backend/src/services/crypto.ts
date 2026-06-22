import crypto from 'crypto';

/**
 * AES-256-GCM 加密工具
 * 用于加密存储 API Key、COS SecretKey 等敏感凭证
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

function getKey(): Buffer {
  const encryptionKey = process.env.ENCRYPTION_KEY;
  if (!encryptionKey) {
    throw new Error('ENCRYPTION_KEY 环境变量未配置，无法加密敏感数据');
  }
  // 使用 SHA-256 派生固定 32 字节密钥
  return crypto.createHash('sha256').update(encryptionKey).digest();
}

/**
 * 加密明文字符串
 * 返回格式: base64(iv):base64(authTag):base64(ciphertext)
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) return '';
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/**
 * 解密已加密的字符串
 */
export function decrypt(ciphertext: string): string {
  if (!ciphertext) return '';
  // 兼容未加密的旧数据（明文直接返回）
  if (!ciphertext.includes(':')) return ciphertext;
  const parts = ciphertext.split(':');
  if (parts.length !== 3) return ciphertext;
  try {
    const iv = Buffer.from(parts[0], 'base64');
    const authTag = Buffer.from(parts[1], 'base64');
    const encrypted = Buffer.from(parts[2], 'base64');
    const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    // 解密失败可能是旧明文数据，直接返回
    return ciphertext;
  }
}

/**
 * 掩码显示（仅保留前4后4字符）
 */
export function maskApiKey(key: string): string {
  if (!key || key.length <= 8) return '****';
  return `${key.slice(0, 4)}****${key.slice(-4)}`;
}
