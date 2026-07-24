import { describe, expect, it } from 'vitest'
import { getPreviewMetadata } from './ImagePreviewOverlay'

describe('getPreviewMetadata', () => {
  it('为用户上传图片提供固定的详情展示信息', () => {
    expect(getPreviewMetadata({ source: 'uploaded' })).toEqual({
      model_name: '用户上传图片',
      prompt: '用户自上传图片',
      duration_label: '0s',
    })
  })

  it('不覆盖生成图片的原始详情信息', () => {
    expect(getPreviewMetadata({ source: 'generated', model_name: '模型 A', generation_prompt: '生成提示词' })).toEqual({
      model_name: '模型 A',
      prompt: '生成提示词',
      duration_label: undefined,
    })
  })
})
