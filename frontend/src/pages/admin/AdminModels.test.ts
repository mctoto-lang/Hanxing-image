import { describe, expect, it } from 'vitest'

import { API_FORMAT_OPTIONS, getGrsFamilyDescription, normalizeApiFormat } from './AdminModels'

describe('图片模型管理配置', () => {
  it('仅展示 GRS 和即梦接口格式', () => {
    expect(API_FORMAT_OPTIONS.map(option => option.value)).toEqual(['grs', 'jimeng'])
  })

  it('展示 GPT 和 Gemini 两种 GRS 模型族说明', () => {
    expect(getGrsFamilyDescription('gpt')).toContain('像素尺寸')
    expect(getGrsFamilyDescription('gemini')).toContain('宽高比')
  })

  it('旧格式模型在前端统一收敛为 GRS 且不暴露旧分支', () => {
    expect(normalizeApiFormat('openai')).toBe('grs')
    expect(normalizeApiFormat('midjourney')).toBe('grs')
    expect(normalizeApiFormat('jimeng')).toBe('jimeng')
  })
})
