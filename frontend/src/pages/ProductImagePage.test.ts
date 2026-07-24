import { describe, expect, it } from 'vitest'
import { getRecordDetailLines } from './ProductImagePage'

describe('getRecordDetailLines', () => {
  it('为已生成记录提供状态、模型、尺寸和提示词详情', () => {
    expect(getRecordDetailLines({
      type: 'completed',
      data: {
        url: 'https://cdn.example.com/image.png',
        taskId: 1,
        timestamp: 0,
        modelName: '模型 A',
        imageSize: '1024x1024',
        prompt: '白色运动鞋',
      },
      timestamp: 0,
    })).toEqual(['已生成', '模型：模型 A', '尺寸：1024x1024', '提示词：白色运动鞋'])
  })

  it('为失败记录优先显示失败原因', () => {
    expect(getRecordDetailLines({
      type: 'failed',
      data: {
        id: 2,
        status: 'failed',
        error_message: '内容审核未通过',
      },
      timestamp: 0,
    })).toEqual(['生成失败', '失败原因：内容审核未通过'])
  })
})
