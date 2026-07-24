import { describe, expect, it } from 'vitest'
import workspacePageSource from './WorkspacePage.tsx?raw'

describe('工作台空状态', () => {
  it('在空状态提示文字后提供模板管理入口', () => {
    const emptyState = workspacePageSource.slice(
      workspacePageSource.indexOf('选择左侧任务，或新建任务开始工作'),
      workspacePageSource.indexOf('</div>', workspacePageSource.indexOf('选择左侧任务，或新建任务开始工作')),
    )

    expect(emptyState).toContain('setShowTemplateManagementDialog(true)')
    expect(emptyState).toContain('模板管理')
  })
})
