import type BetterSqlite3 from 'better-sqlite3'

import { query } from '../db/index.js'

export const WORKSPACE_TEMPLATE_TYPES = ['fission', 'deepen', 'regenerate', 'extract', 'translate'] as const
export const WORKSPACE_TEMPLATE_VISIBILITIES = ['private', 'public'] as const
export const WORKSPACE_TEMPLATE_STATUSES = ['active', 'archived'] as const

type WorkspaceTemplateAccess = {
  owner_id: number | null
  visibility: string
  status: string
}

export function migrateWorkspaceTemplateAccess(database: BetterSqlite3.Database) {
  const columns = database.prepare('PRAGMA table_info(prompt_templates)').all() as Array<{ name: string }>
  const names = new Set(columns.map(column => column.name))
  if (!names.has('owner_id')) database.exec('ALTER TABLE prompt_templates ADD COLUMN owner_id INTEGER REFERENCES users(id)')
  if (!names.has('visibility')) database.exec("ALTER TABLE prompt_templates ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public'")
  if (!names.has('status')) database.exec("ALTER TABLE prompt_templates ADD COLUMN status TEXT NOT NULL DEFAULT 'active'")
  database.exec('CREATE INDEX IF NOT EXISTS idx_prompt_templates_owner_id ON prompt_templates(owner_id)')
  database.exec('CREATE INDEX IF NOT EXISTS idx_prompt_templates_visibility_status ON prompt_templates(visibility, status)')
}

export function canViewWorkspaceTemplate(template: WorkspaceTemplateAccess, userId: number, isAdmin: boolean) {
  return isAdmin || template.owner_id === userId || template.visibility === 'public'
}

export function canManageWorkspaceTemplate(template: WorkspaceTemplateAccess, userId: number, isAdmin: boolean) {
  return isAdmin || template.owner_id === userId
}

export function canExecuteWorkspaceTemplate(template: WorkspaceTemplateAccess, userId: number, isAdmin: boolean) {
  return template.status === 'active' && canViewWorkspaceTemplate(template, userId, isAdmin)
}

export function isWorkspaceAdmin(userId: number) {
  return query('SELECT role FROM users WHERE id = ?', [userId]).rows[0]?.role === 'admin'
}

export function getExecutableWorkspaceTemplate(templateId: number, type: string | undefined, userId: number) {
  const params: unknown[] = [templateId]
  let typeFilter = ''
  if (type) {
    typeFilter = ' AND pt.type = ?'
    params.push(type)
  }
  const template = query(
    `SELECT pt.*, c.name as api_name, c.endpoint, c.model, c.api_key, c.format_type, c.status as api_status, c.max_concurrent, c.max_retries, c.api_timeout
     FROM prompt_templates pt LEFT JOIN chat_api_configs c ON pt.chat_api_id = c.id
     WHERE pt.id = ?${typeFilter}`,
    params
  ).rows[0]
  if (!template || !canExecuteWorkspaceTemplate(template, userId, isWorkspaceAdmin(userId))) return null
  return template
}

export function validateWorkspaceTemplateInput(value: Record<string, unknown>, requireAll: boolean) {
  const output: Record<string, unknown> = {}
  const type = typeof value.type === 'string' ? value.type : undefined
  const name = typeof value.name === 'string' ? value.name.trim() : undefined
  const content = typeof value.content === 'string' ? value.content.trim() : undefined
  const chatApiId = Number(value.chat_api_id)

  if ((requireAll || value.type !== undefined) && !WORKSPACE_TEMPLATE_TYPES.includes(type as typeof WORKSPACE_TEMPLATE_TYPES[number])) throw new Error('无效的模板类型')
  if ((requireAll || value.name !== undefined) && !name) throw new Error('模板名称不能为空')
  if ((requireAll || value.content !== undefined) && !content) throw new Error('模板内容不能为空')
  if ((requireAll || value.chat_api_id !== undefined) && (!Number.isInteger(chatApiId) || chatApiId <= 0)) throw new Error('关联API无效')
  if (value.visibility !== undefined && !WORKSPACE_TEMPLATE_VISIBILITIES.includes(value.visibility as typeof WORKSPACE_TEMPLATE_VISIBILITIES[number])) throw new Error('无效的模板可见性')
  if (value.status !== undefined && !WORKSPACE_TEMPLATE_STATUSES.includes(value.status as typeof WORKSPACE_TEMPLATE_STATUSES[number])) throw new Error('无效的模板状态')

  if (type !== undefined) output.type = type
  if (name !== undefined) output.name = name
  if (content !== undefined) output.content = content
  if (value.chat_api_id !== undefined) output.chat_api_id = chatApiId
  if (value.fission_count !== undefined) output.fission_count = value.fission_count === null ? null : Number(value.fission_count)
  if (value.visibility !== undefined) output.visibility = value.visibility
  if (value.status !== undefined) output.status = value.status
  return output
}
