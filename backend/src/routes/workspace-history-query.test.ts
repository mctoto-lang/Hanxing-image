import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { workspaceImageHistoryQuery } from './workspace-history-query'

describe('工作台图片资产查询', () => {
  it('只查询生成图片，并兼容历史生成记录的空来源', () => {
    assert.match(workspaceImageHistoryQuery, /COALESCE\(ci\.source, 'generated'\) = 'generated'/)
  })

  it('返回图片详情所需的模型和生成时间', () => {
    assert.match(workspaceImageHistoryQuery, /LEFT JOIN generation_tasks gt ON ci\.generation_task_id = gt\.id/)
    assert.match(workspaceImageHistoryQuery, /LEFT JOIN models m ON gt\.model_id = m\.id/)
    assert.match(workspaceImageHistoryQuery, /gt\.started_at/)
    assert.match(workspaceImageHistoryQuery, /gt\.completed_at/)
    assert.match(workspaceImageHistoryQuery, /COALESCE\([\s\S]*api_config_name[\s\S]*m\.display_name[\s\S]*\) as model_name/)
  })
})
