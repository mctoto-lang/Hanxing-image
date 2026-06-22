import { useState, useEffect, useCallback, useMemo } from 'react'
import type { ReactNode } from 'react'
import { apiFetch } from '@/lib/api'
import { Plus, Pencil, Trash2, Eye, EyeOff, ArrowUpDown, MoreHorizontal, MessageSquare, Activity, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DataTable, type ColumnDef } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import Spinner from '@/components/Spinner'

interface ChatApi {
  id: number
  name: string
  endpoint: string
  model: string
  format_type: string
  status: string
  max_concurrent: number
  max_retries: number
  api_timeout: number
  created_at: string
}

const emptyForm = {
  name: '',
  endpoint: '',
  model: '',
  api_key: '',
  format_type: 'openai',
  status: 'active',
  max_concurrent: '5',
  max_retries: '3',
  api_timeout: '120',
}

export default function AdminChatApis({ prefixToolbar }: { prefixToolbar?: ReactNode }) {
  const [apis, setApis] = useState<ChatApi[]>([])
  const [loading, setLoading] = useState(false)
  const [showDialog, setShowDialog] = useState(false)
  const [editTarget, setEditTarget] = useState<ChatApi | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [showKey, setShowKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingApi, setDeletingApi] = useState<ChatApi | null>(null)

  const fetchApis = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/admin/workspace/chat-apis')
      const data = await res.json()
      setApis(data.apis || [])
    } catch { toast.error('获取对话API失败') } finally { setLoading(false) }
  }, [])

  useEffect(() => { fetchApis() }, [fetchApis])

  const openCreate = () => { setEditTarget(null); setForm(emptyForm); setShowKey(false); setShowDialog(true) }
  const openEdit = (api: ChatApi) => {
    setEditTarget(api)
    setForm({
      name: api.name,
      endpoint: api.endpoint,
      model: api.model,
      api_key: '',
      format_type: api.format_type,
      status: api.status,
      max_concurrent: String(api.max_concurrent ?? 5),
      max_retries: String(api.max_retries ?? 3),
      api_timeout: String(api.api_timeout ?? 120),
    })
    setShowKey(false)
    setShowDialog(true)
  }

  const handleSave = async () => {
    if (!form.name || !form.endpoint || !form.model) { toast.error('名称、接口地址、模型标识不能为空'); return }
    if (!editTarget && !form.api_key) { toast.error('API Key 不能为空'); return }
    setSaving(true)
    try {
      const url = editTarget ? `/api/admin/workspace/chat-apis/${editTarget.id}` : '/api/admin/workspace/chat-apis'
      const method = editTarget ? 'PATCH' : 'POST'
      const body = editTarget
        ? {
            name: form.name,
            endpoint: form.endpoint,
            model: form.model,
            format_type: form.format_type,
            status: form.status,
            max_concurrent: parseInt(form.max_concurrent),
            max_retries: parseInt(form.max_retries),
            api_timeout: parseInt(form.api_timeout),
            ...(form.api_key && { api_key: form.api_key })
          }
        : {
            ...form,
            max_concurrent: parseInt(form.max_concurrent),
            max_retries: parseInt(form.max_retries),
            api_timeout: parseInt(form.api_timeout),
          }
      const res = await apiFetch(url, { method, body })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '保存失败')
      toast.success(editTarget ? '已更新' : '已创建')
      setShowDialog(false)
      fetchApis()
    } catch (err) { toast.error((err as Error).message) } finally { setSaving(false) }
  }

  const openDeleteConfirm = (api: ChatApi) => {
    setDeletingApi(api)
    setDeleteConfirmOpen(true)
  }

  const handleDelete = async () => {
    if (!deletingApi) return
    try {
      const res = await apiFetch(`/api/admin/workspace/chat-apis/${deletingApi.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || '删除失败')
        return
      }
      toast.success('已删除')
      setDeleteConfirmOpen(false)
      setDeletingApi(null)
      fetchApis()
    } catch { toast.error('删除失败') }
  }

  const toggleStatus = async (api: ChatApi) => {
    const newStatus = api.status === 'active' ? 'inactive' : 'active'
    try {
      const res = await apiFetch(`/api/admin/workspace/chat-apis/${api.id}`, {
        method: 'PATCH',
        body: { status: newStatus },
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || '操作失败')
        return
      }
      toast.success(newStatus === 'active' ? '已启用' : '已禁用')
      fetchApis()
    } catch { toast.error('操作失败') }
  }

  const columns: ColumnDef<ChatApi, unknown>[] = useMemo(() => [
    {
      id: 'icon',
      header: '图标',
      cell: () => (
        <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
          <MessageSquare className="h-4 w-4 text-muted-foreground" />
        </div>
      ),
    },
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          名称
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <span className="font-medium text-sm">{row.original.name}</span>,
    },
    {
      accessorKey: 'endpoint',
      header: 'API 地址',
      cell: ({ row }) => (
        <span className="max-w-[200px] truncate text-xs text-muted-foreground block">
          {row.original.endpoint}
        </span>
      ),
    },
    {
      accessorKey: 'model',
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          模型标识
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.model}</span>,
    },
    {
      accessorKey: 'max_concurrent',
      header: '最大并发',
      cell: ({ row }) => <span className="text-sm">{row.original.max_concurrent ?? 5}</span>,
    },
    {
      accessorKey: 'max_retries',
      header: '重试次数',
      cell: ({ row }) => <span className="text-sm">{row.original.max_retries ?? 3}</span>,
    },
    {
      accessorKey: 'api_timeout',
      header: '超时(秒)',
      cell: ({ row }) => <span className="text-sm">{row.original.api_timeout ?? 120}</span>,
    },
    {
      accessorKey: 'format_type',
      header: '接口格式',
      cell: ({ row }) => (
        <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
          {row.original.format_type}
        </Badge>
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => (
        <Badge variant={row.original.status === 'active' ? 'default' : 'destructive'}>
          {row.original.status === 'active' ? '启用' : '禁用'}
        </Badge>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => {
        const api = row.original
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
              <DropdownMenuItem onClick={() => openEdit(api)}>
                <Pencil className="mr-2 h-4 w-4" />
                编辑
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => toggleStatus(api)}>
                {api.status === 'active' ? '禁用' : '启用'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => openDeleteConfirm(api)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [])

  return (
    <div className="flex flex-col gap-6">
      {loading ? (
        <div className="flex items-center justify-center py-12"><Spinner /></div>
      ) : (
        <DataTable
          columns={columns}
          data={apis}
          searchPlaceholder="搜索对话模型名称..."
          searchColumn="name"
          pageSize={10}
          toolbar={
            <div className="flex items-center gap-2">
              {prefixToolbar}
              <Button onClick={openCreate}>
                <Plus className="mr-2 h-4 w-4" />
                新建
              </Button>
            </div>
          }
        />
      )}

      <Dialog open={showDialog} onOpenChange={v => { if (!v) setShowDialog(false) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? '编辑对话API' : '新建对话API'}</DialogTitle>
            <DialogDescription>
              {editTarget ? '修改对话模型的配置信息' : '填写信息以添加新的对话模型接口'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {[{ label: '名称', key: 'name', placeholder: '如：GPT-4o 生产环境' },
              { label: '接口地址', key: 'endpoint', placeholder: 'https://api.openai.com/v1' },
              { label: '模型标识', key: 'model', placeholder: 'gpt-4o' }].map(({ label, key, placeholder }) => (
              <div key={key} className="space-y-1">
                <Label>{label}</Label>
                <Input placeholder={placeholder} value={(form as Record<string, string>)[key]} onChange={e => setForm(p => ({ ...p, [key]: e.target.value }))} />
              </div>
            ))}
            <div className="space-y-1">
              <Label>API Key {editTarget && <span className="text-muted-foreground text-xs">（留空保持不变）</span>}</Label>
              <div className="relative">
                <Input
                  type={showKey ? 'text' : 'password'}
                  placeholder={editTarget ? '不修改请留空' : '输入 API Key'}
                  value={form.api_key}
                  onChange={e => setForm(p => ({ ...p, api_key: e.target.value }))}
                  className="pr-10"
                />
                <button type="button" onClick={() => setShowKey(!showKey)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Activity className="h-3 w-3 text-muted-foreground" />
                  最大并发
                </Label>
                <Input
                  type="number"
                  min="1"
                  max="50"
                  value={form.max_concurrent}
                  onChange={e => setForm(p => ({ ...p, max_concurrent: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Activity className="h-3 w-3 text-muted-foreground" />
                  重试次数
                </Label>
                <Input
                  type="number"
                  min="0"
                  max="10"
                  value={form.max_retries}
                  onChange={e => setForm(p => ({ ...p, max_retries: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label className="flex items-center gap-1.5 text-xs">
                  <Clock className="h-3 w-3 text-muted-foreground" />
                  超时(秒)
                </Label>
                <Input
                  type="number"
                  min="10"
                  max="600"
                  value={form.api_timeout}
                  onChange={e => setForm(p => ({ ...p, api_timeout: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>状态</Label>
              <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v ?? p.status }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">启用</SelectItem>
                  <SelectItem value="inactive">禁用</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)} disabled={saving}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? <><Spinner />保存中</> : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除对话模型「{deletingApi?.name}」吗？此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
