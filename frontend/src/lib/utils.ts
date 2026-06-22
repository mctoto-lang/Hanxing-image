import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface ThumbnailOptions {
  width?: number
  height?: number
}

/**
 * 将图片 src 转换为可显示的 URL。
 * 对于 COS 图片（http/https），通过 imageMogr2 参数获取缩略图。
 * 对于本地图片（/uploads/），通过后端 /api/image/thumb 接口获取缩略图。
 */
export function toImageSrc(src: string, options?: ThumbnailOptions): string {
  if (src.startsWith('data:')) return src
  if (src.startsWith('http://') || src.startsWith('https://')) {
    if (options && (options.width || options.height)) {
      const sep = src.includes('?') ? '&' : '?'
      const params: string[] = ['imageMogr2/thumbnail']
      if (options.width && options.height) {
        params.push(`${options.width}x${options.height}`)
      } else if (options.width) {
        params.push(`${options.width}x`)
      } else {
        params.push(`x${options.height}`)
      }
      params.push('quality/85')
      return `${src}${sep}${params.join('/')}`
    }
    return src
  }
  if (src.startsWith('/')) {
    if (options && (options.width || options.height) && src.startsWith('/uploads/')) {
      const params = new URLSearchParams({ url: src })
      if (options.width) params.set('w', String(options.width))
      if (options.height) params.set('h', String(options.height))
      return `/api/image/thumb?${params.toString()}`
    }
    return src
  }
  return `data:image/png;base64,${src}`
}
