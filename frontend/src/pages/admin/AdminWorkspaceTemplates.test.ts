import { describe, expect, it } from 'vitest'

import { createAdminTemplatePayload } from './AdminWorkspaceTemplates'

describe('管理员模板字段', () => {
  it('保存归属、可见性和状态字段', () => {
    expect(createAdminTemplatePayload({
      name: '模板', type: 'deepen', content: '{{prompt}}', chat_api_id: '2', fission_count: '',
      owner_id: '9', visibility: 'private', status: 'archived',
    })).toMatchObject({ owner_id: 9, visibility: 'private', status: 'archived' })
  })
})
