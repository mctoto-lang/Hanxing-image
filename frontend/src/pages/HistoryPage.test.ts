import { describe, expect, it } from 'vitest'
import { createAssetImageId } from './HistoryPage'

describe('createAssetImageId', () => {
  it('为相同 URL 的不同历史记录生成不同标识', () => {
    const url = 'https://cdn.example.com/same-image.jpg'

    expect(createAssetImageId('task', 42, 0)).not.toBe(createAssetImageId('workspace', 42))
    expect(createAssetImageId('task', 42, 0)).not.toBe(createAssetImageId('task', 42, 1))
    expect(createAssetImageId('task', 42, 0)).not.toBe(url)
  })
})
