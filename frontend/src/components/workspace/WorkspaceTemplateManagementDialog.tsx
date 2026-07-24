import { useCallback, useEffect, useState } from 'react'
import { ArrowUpDown, ChevronDown, MoreHorizontal, Pencil, Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { DataTable, type ColumnDef } from '@/components/ui/data-table'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import Spinner from '@/components/Spinner'
import type { Template } from '@/pages/WorkspacePage'

export const workspaceTemplateTypes = [
  { type: 'fission', label: '提示词裂变模板' },
  { type: 'deepen', label: '提示词细化模板' },
  { type: 'regenerate', label: '提示词重新生成模板' },
  { type: 'extract', label: '提取提示词模板' },
  { type: 'translate', label: '提示词翻译模板' },
] as const

type TemplateType = typeof workspaceTemplateTypes[number]['type']
type FormState = { name: string; type: TemplateType; content: string; chat_api_id: string; fission_count: string; visibility: 'private' | 'public' }
type ChatApi = { id: number; name: string }

const emptyForm: FormState = { name: '', type: 'fission', content: '', chat_api_id: '', fission_count: '', visibility: 'private' }

const columnLabels = {
  name: '模板名称',
  api_name: '关联对话模型',
  fission_count: '裂变数量',
  content: '模板内容',
  visibility: '可见性',
  created_at: '创建时间',
  actions: '操作',
}

export function filterWorkspaceTemplates(templates: Template[], type: TemplateType) {
  return templates.filter(template => template.type === type)
}

export function createWorkspaceTemplatePayload(form: FormState) {
  return {
    name: form.name.trim(),
    type: form.type,
    content: form.content.trim(),
    chat_api_id: Number(form.chat_api_id),
    fission_count: form.fission_count ? Number(form.fission_count) : null,
    visibility: form.visibility,
  }
}

export default function WorkspaceTemplateManagementDialog({ open, onClose, onChanged }: { open: boolean; onClose: () => void; onChanged: () => void }) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [chatApis, setChatApis] = useState<ChatApi[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<Template | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [activeType, setActiveType] = useState<TemplateType>('fission')
  const [pageIndex, setPageIndex] = useState(0)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch(`/api/workspace/templates?type=${activeType}`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '获取模板失败')
      setTemplates(filterWorkspaceTemplates(data.templates || [], activeType))
    } catch {
      toast.error('获取模板失败')
    } finally {
      setLoading(false)
    }
  }, [activeType])

  useEffect(() => {
    if (!open) return
    refresh()
    apiFetch('/api/workspace/chat-apis').then(response => response.json()).then(data => setChatApis(data.apis || [])).catch(() => setChatApis([]))
  }, [open, refresh])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...emptyForm, type: activeType })
    setShowForm(true)
  }

  const openEdit = (template: Template) => {
    setEditing(template)
    setForm({ name: template.name, type: template.type, content: template.content, chat_api_id: String(template.chat_api_id), fission_count: template.fission_count ? String(template.fission_count) : '', visibility: template.visibility || 'private' })
    setShowForm(true)
  }

  const save = async () => {
    const body = createWorkspaceTemplatePayload(form)
    if (!body.name || !body.content || !body.chat_api_id) return toast.error('名称、内容和关联 API 不能为空')
    setSaving(true)
    try {
      const response = await apiFetch(editing ? `/api/workspace/templates/${editing.id}` : '/api/workspace/templates', { method: editing ? 'PATCH' : 'POST', body })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '保存失败')
      toast.success(editing ? '模板已更新' : '模板已创建')
      setShowForm(false)
      await refresh()
      onChanged()
    } catch (error) {
      toast.error((error as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const archive = async (template: Template) => {
    if (!confirm(`确认归档“${template.name}”？`)) return
    const response = await apiFetch(`/api/workspace/templates/${template.id}`, { method: 'DELETE' })
    const data = await response.json()
    if (!response.ok) return toast.error(data.error || '归档失败')
    toast.success('模板已归档')
    await refresh()
    onChanged()
  }

  const handleTypeChange = (type: TemplateType) => {
    setPageIndex(0)
    setActiveType(type)
  }

  const typeLabel = workspaceTemplateTypes.find(item => item.type === activeType)?.label || '模板类型'

  const columns: ColumnDef<Template, unknown>[] = [
    {
      accessorKey: 'name',
      header: ({ column }) => <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>模板名称<ArrowUpDown /></Button>,
      cell: ({ row }) => <span className="text-sm font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'api_name',
      header: '关联对话模型',
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{row.original.api_name || '未关联'}</span>,
    },
    {
      accessorKey: 'fission_count',
      header: '裂变数量',
      cell: ({ row }) => row.original.fission_count ? <Badge variant="secondary">{row.original.fission_count} 条</Badge> : <span className="text-sm text-muted-foreground">-</span>,
    },
    {
      accessorKey: 'content',
      header: '模板内容',
      cell: ({ row }) => <span className="block max-w-[320px] truncate rounded bg-muted/50 px-2 py-1 font-mono text-xs text-muted-foreground">{row.original.content}</span>,
    },
    {
      accessorKey: 'visibility',
      header: '可见性',
      cell: ({ row }) => <Badge variant="outline">{row.original.visibility === 'public' ? '公开' : '仅自己'}</Badge>,
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>创建时间<ArrowUpDown /></Button>,
      cell: ({ row }) => <span className="text-sm text-muted-foreground">{new Date(row.original.created_at).toLocaleDateString('zh-CN')}</span>,
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm"><span className="sr-only">打开菜单</span><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>操作</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => openEdit(row.original)}><Pencil />编辑模板</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => archive(row.original)}><Trash2 />归档模板</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ]

  return (
    <>
      <Dialog open={open} onOpenChange={value => !value && onClose()}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-6xl">
          <DialogHeader><DialogTitle>模板管理</DialogTitle></DialogHeader>
          {loading ? <div className="flex justify-center py-12"><Spinner /></div> : (
            <DataTable
              key={activeType}
              columns={columns}
              data={templates}
              searchPlaceholder="搜索模板名称..."
              searchColumn="name"
              columnLabels={columnLabels}
              pageSize={10}
              pageIndex={pageIndex}
              onPageChange={setPageIndex}
              showColumnToggle={false}
              toolbar={<div className="flex items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="outline">{typeLabel}<ChevronDown /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end">{workspaceTemplateTypes.map(item => <DropdownMenuItem key={item.type} onClick={() => handleTypeChange(item.type)}>{item.label}</DropdownMenuItem>)}</DropdownMenuContent>
                </DropdownMenu>
                <Button onClick={openCreate}><Plus />新建模板</Button>
              </div>}
            />
          )}
          <DialogFooter><Button variant="outline" onClick={onClose}>关闭</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? '编辑模板' : '新建模板'}</DialogTitle></DialogHeader>
          <div className="flex flex-col gap-3 py-1">
            <div className="flex flex-col gap-1"><Label>模板名称</Label><Input value={form.name} onChange={event => setForm(current => ({ ...current, name: event.target.value }))} /></div>
            {!editing && <div className="flex flex-col gap-1"><Label>模板类型</Label><Select value={form.type} onValueChange={value => value && setForm(current => ({ ...current, type: value as TemplateType }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{workspaceTemplateTypes.map(item => <SelectItem key={item.type} value={item.type}>{item.label}</SelectItem>)}</SelectContent></Select></div>}
            <div className="flex flex-col gap-1"><Label>关联对话 API</Label><Select value={form.chat_api_id} onValueChange={value => value && setForm(current => ({ ...current, chat_api_id: value }))}><SelectTrigger><SelectValue placeholder="选择对话 API" /></SelectTrigger><SelectContent>{chatApis.map(api => <SelectItem key={api.id} value={String(api.id)}>{api.name}</SelectItem>)}</SelectContent></Select></div>
            <div className="flex flex-col gap-1"><Label>可见性</Label><Select value={form.visibility} onValueChange={value => value && setForm(current => ({ ...current, visibility: value as 'private' | 'public' }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="private">仅自己</SelectItem><SelectItem value="public">所有用户</SelectItem></SelectContent></Select></div>
            {form.type === 'fission' && <div className="flex flex-col gap-1"><Label>裂变数量</Label><Input type="number" value={form.fission_count} onChange={event => setForm(current => ({ ...current, fission_count: event.target.value }))} /></div>}
            <div className="flex flex-col gap-1"><Label>模板内容</Label><Textarea rows={8} className="font-mono text-xs" value={form.content} onChange={event => setForm(current => ({ ...current, content: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>取消</Button><Button onClick={save} disabled={saving}>{saving ? <><Spinner />保存中</> : '保存模板'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
