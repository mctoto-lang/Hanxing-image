import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseWorkspaceReferenceImages } from '../lib/workspace-reference-images'

describe('工作台参考图片解析', () => {
  it('恢复数据库查询层已经解析的参考图片数组', () => {
    assert.deepEqual(parseWorkspaceReferenceImages([' https://example.com/a.jpg ', 'https://example.com/a.jpg', 'https://example.com/b.jpg']), [
      'https://example.com/a.jpg',
      'https://example.com/b.jpg',
    ])
  })
})
