import { describe, expect, it } from 'vitest'

import { createWorkspaceTemplatePayload, filterWorkspaceTemplates, workspaceTemplateTypes } from './WorkspaceTemplateManagementDialog'
import type { Template } from '@/pages/WorkspacePage'

describe('工作台模板管理', () => {
  it('模板类型名称与管理后台保持一致', () => {
    expect(workspaceTemplateTypes.map(item => item.label)).toEqual([
      '提示词裂变模板',
      '提示词细化模板',
      '提示词重新生成模板',
      '提取提示词模板',
      '提示词翻译模板',
    ])
  })

  it('仅显示当前选择类型的模板', () => {
    const templates: Template[] = [
      { id: 2, type: 'translate', name: '翻译', content: 'b', chat_api_id: 1, api_name: 'API', fission_count: null, created_at: '' },
      { id: 1, type: 'fission', name: '裂变', content: 'a', chat_api_id: 1, api_name: 'API', fission_count: 8, created_at: '' },
    ]

    expect(filterWorkspaceTemplates(templates, 'translate').map(template => template.id)).toEqual([2])
  })

  it('创建模板时规范化表单字段并默认设为私有', () => {
    expect(createWorkspaceTemplatePayload({
      name: '  我的模板  ',
      type: 'fission',
      content: '  {{prompt}}  ',
      chat_api_id: '3',
      fission_count: '12',
      visibility: 'private',
    })).toEqual({
      name: '我的模板',
      type: 'fission',
      content: '{{prompt}}',
      chat_api_id: 3,
      fission_count: 12,
      visibility: 'private',
    })
  })
})
