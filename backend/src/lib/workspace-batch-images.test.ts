import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { normalizeBatchImageRequest, validateCustomTaskRequest } from './workspace-batch-images'

describe('工作台自定义任务参数', () => {
  it('接受有效的自定义任务并标准化内容', () => {
    assert.deepEqual(validateCustomTaskRequest({
      title: ' 新任务 ',
      theme_prompt: ' 长提示词 ',
      card_count: 3,
      reference_image_urls: [' /uploads/a.jpg ', '/uploads/a.jpg', '/uploads/b.jpg'],
    }), {
      title: '新任务',
      prompt: '长提示词',
      cardCount: 3,
      imageUrls: ['/uploads/a.jpg', '/uploads/b.jpg'],
    })
  })

  it('拒绝超出范围的卡片数量', () => {
    assert.throws(() => validateCustomTaskRequest({ title: '任务', theme_prompt: '提示词', card_count: 101 }), /1 到 100/)
  })
})

describe('工作台批量图片绑定参数', () => {
  it('去重卡片和图片地址', () => {
    assert.deepEqual(normalizeBatchImageRequest([3, 3, 2], [' /uploads/a.jpg ', '/uploads/a.jpg']), {
      cardIds: [3, 2],
      imageUrls: ['/uploads/a.jpg'],
    })
  })

  it('拒绝空选择', () => {
    assert.throws(() => normalizeBatchImageRequest([], ['/uploads/a.jpg']), /至少选择一张卡片/)
  })
})
