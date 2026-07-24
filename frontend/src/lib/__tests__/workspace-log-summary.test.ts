import { describe, expect, it } from 'vitest'
import { summarizeImageResponseBody } from '@/lib/workspace-log-summary'

describe('summarizeImageResponseBody', () => {
  it('从绘图响应体返回图片数量摘要，不含 URL', () => {
    const body = JSON.stringify({ imageCount: 3, imageUrls: ['https://cdn.example.com/a.png', 'https://cdn.example.com/b.png', 'https://cdn.example.com/c.png'] })
    const result = summarizeImageResponseBody(body)
    expect(result).toBe('生成 3 张图片')
    expect(result).not.toContain('https://')
  })

  it('单张图片时摘要正确', () => {
    const body = JSON.stringify({ imageCount: 1, imageUrls: ['https://cdn.example.com/a.png'] })
    expect(summarizeImageResponseBody(body)).toBe('生成 1 张图片')
  })

  it('非绘图响应体（对话内容）原样返回', () => {
    const body = '文案已生成：标题"春日限定"，正文…'
    expect(summarizeImageResponseBody(body)).toBe(body)
  })

  it('空字符串返回 null', () => {
    expect(summarizeImageResponseBody('')).toBeNull()
    expect(summarizeImageResponseBody(null)).toBeNull()
  })

  it('imageCount 为 0 时返回摘要而不含 URL', () => {
    const body = JSON.stringify({ imageCount: 0, imageUrls: [] })
    expect(summarizeImageResponseBody(body)).toBe('生成 0 张图片')
  })
})
