import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { workspaceImageHistoryQuery } from './workspace-history-query'

describe('工作台图片资产查询', () => {
  it('只查询生成图片，并兼容历史生成记录的空来源', () => {
    assert.match(workspaceImageHistoryQuery, /COALESCE\(ci\.source, 'generated'\) = 'generated'/)
  })
})
