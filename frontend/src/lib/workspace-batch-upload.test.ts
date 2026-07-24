import { describe, expect, it } from 'vitest'

import { canShowWorkspaceBatchActions, getInitialGalleryMode } from './workspace-batch-upload'

describe('工作台批量操作状态', () => {
  it('选中卡片包含生成状态时只允许删除', () => {
    expect(canShowWorkspaceBatchActions(true, 3)).toEqual({ showDeleteOnly: true, showActions: false })
  })

  it('选中卡片均空闲时显示批量操作', () => {
    expect(canShowWorkspaceBatchActions(false, 3)).toEqual({ showDeleteOnly: false, showActions: true })
  })
})

describe('图片库初始页面', () => {
  it('参考图入口在模型支持时进入参考图页面', () => {
    expect(getInitialGalleryMode('reference', 2)).toBe('reference')
  })

  it('模型不支持参考图时回退到普通图片页面', () => {
    expect(getInitialGalleryMode('reference', 0)).toBe('selected')
  })
})
