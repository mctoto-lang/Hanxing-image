import { describe, expect, it } from 'vitest'

import { galleryModeSelectPosition, getGalleryModeLabel, getGalleryModeOptions, getGalleryPageItems, referenceImageCountBadgeClassName, shouldShowReferenceFooter } from './WorkspaceImageGalleryDialog'

describe('图片库页码', () => {
  it('在页数较多时保留首尾页、当前页附近页码与省略号', () => {
    expect(getGalleryPageItems({ currentPage: 6, totalPages: 12 })).toEqual([1, 'ellipsis-start', 5, 6, 7, 'ellipsis-end', 12])
  })

  it('在首页附近连续展示起始页码', () => {
    expect(getGalleryPageItems({ currentPage: 2, totalPages: 12 })).toEqual([1, 2, 3, 'ellipsis-end', 12])
  })

  it('在页数较少时展示所有页码', () => {
    expect(getGalleryPageItems({ currentPage: 3, totalPages: 5 })).toEqual([1, 2, 3, 4, 5])
  })
})

describe('图片库用途选项', () => {
  it('将内部用途值显示为中文', () => {
    expect(getGalleryModeLabel('selected')).toBe('图片选择')
    expect(getGalleryModeLabel('reference')).toBe('参考图片')
  })

  it('仅在模型支持参考图时提供参考图片用途', () => {
    expect(getGalleryModeOptions(0)).toEqual([{ value: 'selected', label: '图片选择' }])
    expect(getGalleryModeOptions(3)).toEqual([
      { value: 'selected', label: '图片选择' },
      { value: 'reference', label: '参考图片' },
    ])
  })

  it('在触发按钮正下方展开', () => {
    expect(galleryModeSelectPosition).toEqual({ side: 'bottom', sideOffset: 6, align: 'start', alignItemWithTrigger: false })
  })
})

describe('图片库参考图底栏', () => {
  it('仅在当前模型支持参考图时显示参考图状态与清除操作', () => {
    expect(shouldShowReferenceFooter(0)).toBe(false)
    expect(shouldShowReferenceFooter(1)).toBe(true)
  })

  it('让数量徽标与小尺寸清除按钮等高且使用适中圆角', () => {
    expect(referenceImageCountBadgeClassName).toContain('h-7')
    expect(referenceImageCountBadgeClassName).toContain('rounded-md')
    expect(referenceImageCountBadgeClassName).not.toContain('rounded-full')
  })
})
