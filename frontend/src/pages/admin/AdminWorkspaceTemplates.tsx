import { useState, useEffect, useMemo, useCallback } from 'react'
import { Plus, Pencil, Trash2, ChevronDown, MoreHorizontal, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DataTable, type ColumnDef } from '@/components/ui/data-table'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import Spinner from '@/components/Spinner'

interface Template {
  id: number
  type: string
  name: string
  content: string
  chat_api_id: number
  api_name: string | null
  fission_count: number | null
  created_at: string
}

interface ChatApi { id: number; name: string }

const TYPES = [
  { key: 'fission', label: '提示词裂变模板' },
  { key: 'deepen', label: '提示词细化模板' },
  { key: 'regenerate', label: '提示词重新生成模板' },
  { key: 'extract', label: '提取提示词模板' },
  { key: 'translate', label: '提示词翻译模板' },
] as const

type TemplateType = typeof TYPES[number]['key']

const emptyForm = { name: '', type: 'fission', content: '', chat_api_id: '', fission_count: '' }

const columnLabels = {
  name: '模板名称',
  api_name: '关联对话模型',
  fission_count: '裂变数量',
  content: '模板内容',
  created_at: '创建时间',
  actions: '操作',
}

export default function AdminWorkspaceTemplates() {
  const [activeType, setActiveType] = useState<TemplateType>('fission')
  const [templates, setTemplates] = useState<Template[]>([])
  const [chatApis, setChatApis] = useState<ChatApi[]>([])
  const [loading, setLoading] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [editTarget, setEditTarget] = useState<Template | null>(null)
  const [form, setForm] = useState({ ...emptyForm, type: 'fission' })
  const [saving, setSaving] = useState(false)
  const [templatePageIndex, setTemplatePageIndex] = useState(0)

  const fetchChatApis = useCallback(async () => {
    try {
      const data = await apiFetch('/api/admin/workspace/chat-apis').then(r => r.json())
      setChatApis(data.apis || [])
    } catch {}
  }, [])

  const fetchTemplates = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/admin/workspace/templates?type=${activeType}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '获取模板失败')
      const nextTemplates = data.templates || []
      setTemplates(nextTemplates)
      return nextTemplates as Template[]
    } catch (error) { toast.error((error as Error).message || '获取模板失败') } finally { setLoading(false) }
  }, [activeType])

  useEffect(() => { fetchChatApis() }, [fetchChatApis])
  useEffect(() => { fetchTemplates() }, [fetchTemplates])

  const openCreate = () => {
    setEditTarget(null)
    setForm({ ...emptyForm, type: activeType })
    setShowDialog(true)
  }

  const openEdit = (t: Template) => {
    setEditTarget(t)
    setForm({ name: t.name, type: t.type, content: t.content, chat_api_id: String(t.chat_api_id || ''), fission_count: t.fission_count ? String(t.fission_count) : '' })
    setShowDialog(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.content || !form.chat_api_id) { toast.error('名称、内容、关联API不能为空'); return }
    setSaving(true)
    try {
      const url = editTarget ? `/api/admin/workspace/templates/${editTarget.id}` : '/api/admin/workspace/templates'
      const method = editTarget ? 'PATCH' : 'POST'
      const body = {
        name: form.name, type: form.type, content: form.content,
        chat_api_id: parseInt(form.chat_api_id),
        fission_count: form.fission_count ? parseInt(form.fission_count) : null,
      }
      const res = await apiFetch(url, { method, body })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '保存失败')
      toast.success(editTarget ? '已更新' : '已创建')
      setShowDialog(false)
      fetchTemplates()
    } catch (err) { toast.error((err as Error).message) } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确认删除此模板？')) return
    try {
      const res = await apiFetch(`/api/admin/workspace/templates/${id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '删除失败')
      toast.success('已删除')
      const nextTemplates = await fetchTemplates()
      if (nextTemplates) {
        setTemplatePageIndex(current => Math.min(current, Math.max(Math.ceil(nextTemplates.length / 10) - 1, 0)))
      }
    } catch (error) { toast.error((error as Error).message || '删除失败') }
  }

  const handleTypeChange = (type: TemplateType) => {
    setTemplatePageIndex(0)
    setActiveType(type)
  }

  const typeLabels = useMemo(
    () => Object.fromEntries(TYPES.map(t => [t.key, t.label])) as Record<TemplateType, string>,
    [],
  )

  const columns: ColumnDef<Template, unknown>[] = useMemo(() => [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          模板名称
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <span className="font-medium text-sm">{row.original.name}</span>,
    },
    {
      accessorKey: 'api_name',
      header: '关联对话模型',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.api_name || '未关联'}</span>,
    },
    {
      accessorKey: 'fission_count',
      header: '裂变数量',
      cell: ({ row }) => row.original.fission_count ? (
        <Badge variant="secondary" className="text-[10px]">{row.original.fission_count} 条</Badge>
      ) : <span className="text-sm text-muted-foreground">-</span>,
    },
    {
      accessorKey: 'content',
      header: '模板内容',
      cell: ({ row }) => (
        <span className="block max-w-[420px] truncate rounded bg-muted/50 px-2 py-1 font-mono text-xs text-muted-foreground">
          {row.original.content}
        </span>
      ),
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          创建时间
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{new Date(row.original.created_at).toLocaleDateString('zh-CN')}</span>,
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => {
        const template = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">打开菜单</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>操作</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => openEdit(template)}>
                <Pencil className="mr-2 h-4 w-4" />
                编辑模板
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => handleDelete(template.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除模板
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [])

  const typeSelector = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-1.5">
          {typeLabels[activeType]}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {TYPES.map(t => (
          <DropdownMenuItem key={t.key} onClick={() => handleTypeChange(t.key)}>
            {t.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">提示词模板管理</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12"><Spinner /></div>
          ) : (
          <DataTable
              key={activeType}
              columns={columns}
              data={templates}
              searchPlaceholder="搜索模板名称..."
              searchColumn="name"
              columnLabels={columnLabels}
              pageSize={10}
              pageIndex={templatePageIndex}
              onPageChange={setTemplatePageIndex}
              toolbar={
                <div className="flex items-center gap-2">
                  {typeSelector}
                  <Button onClick={openCreate}>
                    <Plus className="mr-2 h-4 w-4" />
                    新建模板
                  </Button>
                </div>
              }
            />
          )}
        </CardContent>
      </Card>

      <Dialog open={showDialog} onOpenChange={v => !v && setShowDialog(false)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editTarget ? '编辑模板' : '新建模板'}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <Label>模板名称</Label>
              <Input placeholder="如：通用裂变 10条" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            {!editTarget && (
              <div className="space-y-1">
                <Label>模板类型</Label>
                <Select value={form.type} onValueChange={v => v && setForm(p => ({ ...p, type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map(t => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1">
              <Label>关联对话模型</Label>
              {chatApis.length === 0 ? (
                <p className="text-sm text-muted-foreground">暂无可用对话API，请先创建</p>
              ) : (
                <Select value={form.chat_api_id} onValueChange={v => v && setForm(p => ({ ...p, chat_api_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="选择对话模型" /></SelectTrigger>
                  <SelectContent>
                    {chatApis.map(a => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
            </div>
            {(form.type === 'fission' || (editTarget?.type === 'fission')) && (
              <div className="space-y-1">
                <Label>裂变数量</Label>
                <Input type="number" placeholder="如：10" value={form.fission_count} onChange={e => setForm(p => ({ ...p, fission_count: e.target.value }))} />
              </div>
            )}
            <div className="space-y-1">
              <Label>
                模板内容
                <span className="text-muted-foreground text-xs ml-2">支持占位符: {'{{prompt}}'} {form.type === 'fission' ? '{{count}}' : ''}</span>
              </Label>
              <Textarea
                placeholder={form.type === 'translate'
                  ? `请将以下中文图片提示词翻译为适合图片生成的英文提示词。仅输出英文提示词，不要解释、标题或 Markdown：\n\n{{prompt}}`
                  : form.type === 'extract'
                  ? `请从以下长文本中提取画面描述，并以编号列表形式输出：\n\n{{prompt}}\n\n输出格式：\n1. 第一条画面描述\n2. 第二条画面描述`
                  : `请基于以下主题，生成 {{count}} 条图片生成提示词：\n\n主题：{{prompt}}\n\n请以编号列表形式输出...`}
                value={form.content}
                onChange={e => setForm(p => ({ ...p, content: e.target.value }))}
                rows={8}
                className="font-mono text-xs"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? <><Spinner />保存中</> : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
