import { useState, useEffect, useCallback, useMemo } from 'react'
import { apiFetch } from '@/lib/api'
import { Plus, Pencil, Coins, Activity, ArrowUp, ArrowUpDown, Eye, ShieldCheck, Shield, MoreHorizontal } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

interface Group {
  id: number
  name: string
  description: string | null
  max_credits: number
  daily_credits: number
  initial_creative_credits: number
  initial_project_credits: number
  max_concurrent: number
  priority: number
  allowed_models: string[]
  managed_models: string[]
  allowed_pages: string[]
}

interface Model {
  id: number
  name: string
  display_name: string
}

const emptyForm = {
  name: '',
  description: 'user',
  initial_creative_credits: '100',
  initial_project_credits: '100',
  max_concurrent: '2',
  priority: '0',
  allowed_models: [] as string[],
  allowed_pages: [] as string[],
}

const PAGE_OPTIONS = [
  { key: 'generate', label: '自由创作' },
  { key: 'canvas', label: '项目创作' },
  { key: 'history', label: '资产管理' },
  { key: 'workspace', label: '批量生图' },
  { key: 'product', label: '商品主图' },
]

const columnLabels = {
  name: '名称',
  description: '权限设置',
  initial_creative_credits: '初始创作积分',
  initial_project_credits: '初始项目积分',
  max_concurrent: '最大并发',
  priority: '优先级',
  allowed_pages: '可查看页面',
  actions: '操作',
}

export default function AdminGroups() {
  const [groups, setGroups] = useState<Group[]>([])
  const [models, setModels] = useState<Model[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<Group | null>(null)
  const [form, setForm] = useState(emptyForm)

  const fetchGroups = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/groups')
      const data = await res.json()
      setGroups(data.groups || [])
    } catch {}
  }, [])

  const fetchModels = useCallback(async () => {
    try {
      const res = await apiFetch('/api/models/all')
      const data = await res.json()
      setModels(data.models || [])
    } catch {}
  }, [])

  useEffect(() => {
    fetchGroups()
    fetchModels()
  }, [fetchGroups, fetchModels])

  const openCreateDialog = () => {
    setEditingGroup(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEditDialog = (group: Group) => {
    setEditingGroup(group)
    setForm({
      name: group.name,
      description: group.description || 'user',
      initial_creative_credits: String(group.initial_creative_credits || 0),
      initial_project_credits: String(group.initial_project_credits || 0),
      max_concurrent: String(group.max_concurrent),
      priority: String(group.priority),
      allowed_models: group.allowed_models || [],
      allowed_pages: group.allowed_pages || [],
    })
    setDialogOpen(true)
  }

  const toggleModel = (modelId: number) => {
    const modelIdStr = String(modelId)
    setForm((prev) => {
      const current = prev.allowed_models
      return {
        ...prev,
        allowed_models: current.includes(modelIdStr)
          ? current.filter((m) => m !== modelIdStr)
          : [...current, modelIdStr],
      }
    })
  }

  const togglePage = (pageKey: string) => {
    setForm((prev) => {
      const current = prev.allowed_pages
      return {
        ...prev,
        allowed_pages: current.includes(pageKey)
          ? current.filter((page) => page !== pageKey)
          : [...current, pageKey],
      }
    })
  }

  const handleSave = async () => {
    try {
      const method = editingGroup ? 'PUT' : 'POST'
      const url = editingGroup
        ? `/api/admin/groups/${editingGroup.id}`
        : '/api/admin/groups'

      const res = await apiFetch(url, {
        method,
        body: {
          name: form.name,
          description: form.description,
          max_credits: parseInt(form.initial_creative_credits),
          daily_credits: 0,
          initial_creative_credits: parseInt(form.initial_creative_credits),
          initial_project_credits: parseInt(form.initial_project_credits),
          max_concurrent: parseInt(form.max_concurrent),
          priority: parseInt(form.priority),
          allowed_models: form.allowed_models,
          allowed_pages: form.allowed_pages,
        },
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || '保存失败')
        return
      }
      setDialogOpen(false)
      setEditingGroup(null)
      setForm(emptyForm)
      fetchGroups()
    } catch {
      toast.error('网络错误，请重试')
    }
  }

  const columns: ColumnDef<Group, unknown>[] = useMemo(() => [
    {
      accessorKey: 'name',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          名称
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
    },
    {
      accessorKey: 'description',
      header: '权限设置',
      cell: ({ row }) => (
        <Badge
          variant={row.original.description === 'admin' ? 'secondary' : 'outline'}
          className={
            row.original.description === 'admin'
              ? 'bg-amber-100 text-amber-800 hover:bg-amber-100'
              : ''
          }
        >
          {row.original.description === 'admin' ? '管理员' : '普通用户'}
        </Badge>
      ),
    },
    {
      accessorKey: 'initial_creative_credits',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          <Coins className="mr-1 h-3 w-3 text-blue-500" />
          初始创作积分
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="flex items-center gap-1">
          <Coins className="h-3 w-3 text-blue-500" />
          {row.original.initial_creative_credits || 0}
        </span>
      ),
    },
    {
      accessorKey: 'initial_project_credits',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          <Coins className="mr-1 h-3 w-3 text-green-500" />
          初始项目积分
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="flex items-center gap-1">
          <Coins className="h-3 w-3 text-green-500" />
          {row.original.initial_project_credits || 0}
        </span>
      ),
    },
    {
      accessorKey: 'max_concurrent',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          最大并发
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    {
      accessorKey: 'priority',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          优先级
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <Badge variant={row.original.priority > 0 ? 'secondary' : 'outline'}>
          {row.original.priority}
        </Badge>
      ),
    },
    {
      accessorKey: 'allowed_pages',
      header: '可查看页面',
      cell: ({ row }) => {
        const allowedPages = row.original.allowed_pages || []
        const visiblePages = allowedPages.length > 0
          ? PAGE_OPTIONS.filter(page => allowedPages.includes(page.key))
          : PAGE_OPTIONS
        return (
          <div className="flex max-w-[260px] flex-wrap gap-1">
            {visiblePages.map(page => (
              <Badge key={page.key} variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
                {page.label}
              </Badge>
            ))}
          </div>
        )
      },
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => {
        const group = row.original
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
              <DropdownMenuItem onClick={() => openEditDialog(group)}>
                <Pencil className="mr-2 h-4 w-4" />
                编辑权限组
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [])

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">权限组管理</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={groups}
            searchPlaceholder="搜索权限组名称..."
            searchColumn="name"
            columnLabels={columnLabels}
            pageSize={10}
            toolbar={
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                创建权限组
              </Button>
            }
          />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingGroup ? '编辑权限组' : '创建权限组'}
            </DialogTitle>
            <DialogDescription>
              {editingGroup ? '修改权限组的配置信息' : '填写信息以创建新的权限组'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-5 max-h-[65vh] overflow-y-auto px-1">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name">名称</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label className="flex items-center gap-1.5">
                  <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                  权限设置
                </Label>
                <Select
                  value={form.description}
                  onValueChange={(value) => setForm({ ...form, description: value || 'user' })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck className="h-3.5 w-3.5 text-amber-600" />
                        管理员
                      </span>
                    </SelectItem>
                    <SelectItem value="user">
                      <span className="flex items-center gap-1.5">
                        <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                        普通用户
                      </span>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">管理员可查看管理按钮，普通用户不可</p>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="initial_creative_credits" className="flex items-center gap-1.5">
                  <Coins className="h-3.5 w-3.5 text-blue-500" />
                  初始创作积分
                </Label>
                <Input
                  id="initial_creative_credits"
                  type="number"
                  min="0"
                  value={form.initial_creative_credits}
                  onChange={(e) => setForm({ ...form, initial_creative_credits: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">新用户创建时获得的创作积分</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="initial_project_credits" className="flex items-center gap-1.5">
                  <Coins className="h-3.5 w-3.5 text-green-500" />
                  初始项目积分
                </Label>
                <Input
                  id="initial_project_credits"
                  type="number"
                  min="0"
                  value={form.initial_project_credits}
                  onChange={(e) => setForm({ ...form, initial_project_credits: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">新用户创建时获得的项目积分</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="max_concurrent" className="flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  最大并发
                </Label>
                <Input
                  id="max_concurrent"
                  type="number"
                  min="1"
                  value={form.max_concurrent}
                  onChange={(e) => setForm({ ...form, max_concurrent: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="priority" className="flex items-center gap-1.5">
                <ArrowUp className="h-3.5 w-3.5 text-muted-foreground" />
                优先级
              </Label>
              <Input
                id="priority"
                type="number"
                value={form.priority}
                onChange={(e) => setForm({ ...form, priority: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">数值越高，队列中越优先处理。0 为默认优先级</p>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                可查看页面
              </Label>
              <div className="flex gap-2 flex-wrap">
                {PAGE_OPTIONS.map((page) => {
                  const isSelected = form.allowed_pages.includes(page.key)
                  return (
                    <Button
                      key={page.key}
                      variant="outline"
                      size="xs"
                      onClick={() => togglePage(page.key)}
                      className={`rounded-lg ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {page.label}
                    </Button>
                  )
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">该组用户可以查看的页面，不选则允许所有</p>
            </div>

            <div className="flex flex-col gap-2">
              <Label className="flex items-center gap-1.5">
                <Eye className="h-3.5 w-3.5 text-muted-foreground" />
                可使用模型
              </Label>
              <div className="flex gap-2 flex-wrap">
                {models.map((model) => {
                  const isSelected = form.allowed_models.includes(String(model.id))
                  return (
                    <Button
                      key={model.id}
                      variant="outline"
                      size="xs"
                      onClick={() => toggleModel(model.id)}
                      className={`rounded-lg ${
                        isSelected
                          ? 'border-primary bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {model.display_name || model.name}
                    </Button>
                  )
                })}
                {models.length === 0 && <span className="text-xs text-muted-foreground">请先添加模型</span>}
              </div>
              <p className="text-[11px] text-muted-foreground">该组用户可以使用的生图模型，不选则允许所有</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>
              {editingGroup ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
