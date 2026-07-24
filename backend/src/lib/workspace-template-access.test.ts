import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import BetterSqlite3 from 'better-sqlite3'

import {
  canExecuteWorkspaceTemplate,
  canManageWorkspaceTemplate,
  canViewWorkspaceTemplate,
  migrateWorkspaceTemplateAccess,
  validateWorkspaceTemplateInput,
} from './workspace-template-access'

const privateActive = { owner_id: 7, visibility: 'private', status: 'active' }

describe('工作台模板迁移', () => {
  it('为旧模板补齐所有者、可见性和状态字段并保留旧模板可执行性', () => {
    const database = new BetterSqlite3(':memory:')
    database.exec('CREATE TABLE prompt_templates (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')
    database.exec("INSERT INTO prompt_templates (name) VALUES ('旧模板')")

    migrateWorkspaceTemplateAccess(database)

    const columns = database.prepare('PRAGMA table_info(prompt_templates)').all() as Array<{ name: string }>
    const template = database.prepare('SELECT * FROM prompt_templates').get() as Record<string, unknown>
    assert.deepEqual(columns.slice(-3).map(column => column.name), ['owner_id', 'visibility', 'status'])
    assert.equal(template.owner_id, null)
    assert.equal(template.visibility, 'public')
    assert.equal(template.status, 'active')
  })

  it('可重复运行迁移', () => {
    const database = new BetterSqlite3(':memory:')
    database.exec('CREATE TABLE prompt_templates (id INTEGER PRIMARY KEY)')
    migrateWorkspaceTemplateAccess(database)
    assert.doesNotThrow(() => migrateWorkspaceTemplateAccess(database))
  })
})

describe('工作台模板权限', () => {
  it('普通用户只能查看公开模板和自己的模板', () => {
    assert.equal(canViewWorkspaceTemplate(privateActive, 7, false), true)
    assert.equal(canViewWorkspaceTemplate(privateActive, 8, false), false)
    assert.equal(canViewWorkspaceTemplate({ ...privateActive, visibility: 'public' }, 8, false), true)
  })

  it('普通用户只能管理自己的模板，管理员可以管理所有模板', () => {
    assert.equal(canManageWorkspaceTemplate(privateActive, 7, false), true)
    assert.equal(canManageWorkspaceTemplate(privateActive, 8, false), false)
    assert.equal(canManageWorkspaceTemplate(privateActive, 8, true), true)
  })

  it('执行入口拒绝归档模板和其他用户的私有模板', () => {
    assert.equal(canExecuteWorkspaceTemplate(privateActive, 7, false), true)
    assert.equal(canExecuteWorkspaceTemplate(privateActive, 8, false), false)
    assert.equal(canExecuteWorkspaceTemplate({ ...privateActive, status: 'archived' }, 7, false), false)
    assert.equal(canExecuteWorkspaceTemplate({ ...privateActive, status: 'archived' }, 8, true), false)
  })

  it('迁移后的系统模板对普通用户可执行', () => {
    assert.equal(canExecuteWorkspaceTemplate({ owner_id: null, visibility: 'public', status: 'active' }, 8, false), true)
  })
})

describe('工作台模板输入', () => {
  it('标准化合法创建参数', () => {
    assert.deepEqual(validateWorkspaceTemplateInput({
      type: 'fission',
      name: ' 模板 ',
      content: ' 内容 ',
      chat_api_id: 3,
      fission_count: 6,
      visibility: 'public',
    }, true), {
      type: 'fission',
      name: '模板',
      content: '内容',
      chat_api_id: 3,
      fission_count: 6,
      visibility: 'public',
    })
  })

  it('拒绝非法可见性、状态和模板类型', () => {
    assert.throws(() => validateWorkspaceTemplateInput({ type: 'bad', name: 'a', content: 'b', chat_api_id: 1 }, true), /模板类型/)
    assert.throws(() => validateWorkspaceTemplateInput({ visibility: 'all' }, false), /可见性/)
    assert.throws(() => validateWorkspaceTemplateInput({ status: 'deleted' }, false), /状态/)
  })
})
