import { describe, expect, it } from 'vitest'
import { createAssetImageId, mapWorkspaceImagePreview } from './HistoryPage'

describe('createAssetImageId', () => {
  it('为相同 URL 的不同历史记录生成不同标识', () => {
    const url = 'https://cdn.example.com/same-image.jpg'

    expect(createAssetImageId('task', 42, 0)).not.toBe(createAssetImageId('workspace', 42))
    expect(createAssetImageId('task', 42, 0)).not.toBe(createAssetImageId('task', 42, 1))
    expect(createAssetImageId('task', 42, 0)).not.toBe(url)
  })
})

describe('mapWorkspaceImagePreview', () => {
  it('保留批量生图图片详情字段', () => {
    expect(mapWorkspaceImagePreview({
      prompt: '星空下的山峰',
      size: '1024x1024',
      model_name: '测试模型',
      started_at: '2026-07-24T10:00:00.000Z',
      completed_at: '2026-07-24T10:00:02.500Z',
      created_at: '2026-07-24T10:00:00.000Z',
    })).toEqual({
      prompt: '星空下的山峰',
      image_size: '1024x1024',
      model_name: '测试模型',
      started_at: '2026-07-24T10:00:00.000Z',
      completed_at: '2026-07-24T10:00:02.500Z',
      created_at: '2026-07-24T10:00:00.000Z',
    })
  })
})
