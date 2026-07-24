import { describe, expect, it } from 'vitest'

import { getGenerationConfigGroups } from './WorkspaceGenerationConfigDialog'

describe('生成配置', () => {
  it('将提示词模板与图片参数分组展示', () => {
    expect(getGenerationConfigGroups().map(group => ({ title: group.title, fields: group.fields }))).toEqual([
      { title: '提示词配置', fields: ['fission', 'deepen', 'regenerate', 'extract', 'translate'] },
      { title: '图片配置', fields: ['model', 'size'] },
    ])
  })
})
