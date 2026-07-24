import { describe, expect, it } from 'vitest'

import { getReferenceImageLimit, normalizeReferenceImages } from '@/lib/workspace-reference-images'

describe('工作台参考图规则', () => {
  it('去除空白和重复地址，并保留输入顺序', () => {
    expect(normalizeReferenceImages([' https://example.com/a.png ', '', 'https://example.com/a.png', 'https://example.com/b.png'])).toEqual([
      'https://example.com/a.png',
      'https://example.com/b.png',
    ])
  })

  it('仅在模型支持参考图时返回合法数量上限', () => {
    expect(getReferenceImageLimit({ supports_reference_image: 1, max_reference_images: 3 })).toBe(3)
    expect(getReferenceImageLimit({ supports_reference_image: 0, max_reference_images: 3 })).toBe(0)
    expect(getReferenceImageLimit({ supports_reference_image: 1, max_reference_images: 0 })).toBe(1)
  })
})
