import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Plus, Pencil, Upload, Image, Server, Key, Coins, Activity, Trash2, ArrowUpDown, MoreHorizontal, X } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

interface Model {
  id: number
  name: string
  display_name: string
  api_endpoint: string
  api_key_encrypted: string
  icon_url: string | null
  supported_sizes: { ratios: { ratio: string; width: number; height: number }[] } | null
  cost_per_image: number
  max_concurrent: number
  max_retries: number
  is_active: boolean
  visible_in_generate: boolean
  visible_in_canvas: boolean
  supports_reference_image: boolean
  max_reference_images: number
  reference_image_field: string
}

const DEFAULT_SIZES = JSON.stringify({
  ratios: [
    { ratio: '1:1', width: 1024, height: 1024 },
    { ratio: '3:2', width: 1536, height: 1024 },
    { ratio: '2:3', width: 1024, height: 1536 },
    { ratio: '16:9', width: 2048, height: 1152 },
    { ratio: '9:16', width: 1156, height: 2048 },
  ],
}, null, 2)

const emptyForm = {
  name: '',
  display_name: '',
  api_endpoint: '',
  api_key: '',
  icon_url: '',
  supported_sizes: DEFAULT_SIZES,
  cost_per_image: '1',
  max_concurrent: '5',
  max_retries: '3',
  visible_in_generate: true,
  visible_in_canvas: true,
  supports_reference_image: false,
  max_reference_images: '1',
  reference_image_field: 'image_url',
}

export default function AdminModels() {
  const [models, setModels] = useState<Model[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingModel, setEditingModel] = useState<Model | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false)
  const [deletingModel, setDeletingModel] = useState<Model | null>(null)

  const fetchModels = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/models/all', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setModels(data.models || [])
    } catch {}
  }, [])

  useEffect(() => {
    fetchModels()
  }, [fetchModels])

  const openCreateDialog = () => {
    setEditingModel(null)
    setForm(emptyForm)
    setDialogOpen(true)
  }

  const openEditDialog = (model: Model) => {
    setEditingModel(model)
    setForm({
      name: model.name,
      display_name: model.display_name,
      api_endpoint: model.api_endpoint || '',
      api_key: '',
      icon_url: model.icon_url || '',
      supported_sizes: model.supported_sizes ? JSON.stringify(model.supported_sizes, null, 2) : '',
      cost_per_image: String(model.cost_per_image),
      max_concurrent: String(model.max_concurrent),
      max_retries: String(model.max_retries ?? 3),
      visible_in_generate: model.visible_in_generate !== false,
      visible_in_canvas: model.visible_in_canvas !== false,
      supports_reference_image: !!model.supports_reference_image,
      max_reference_images: String(model.max_reference_images || 1),
      reference_image_field: model.reference_image_field || 'image_url',
    })
    setDialogOpen(true)
  }

  const handleIconUpload = async () => {
    if (!editingModel || !fileRef.current?.files?.[0]) return
    setUploading(true)
    try {
      const token = localStorage.getItem('token')
      const formData = new FormData()
      formData.append('icon', fileRef.current.files[0])
      const res = await fetch(`/api/models/${editingModel.id}/icon`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      })
      const data = await res.json()
      if (res.ok) {
        setForm({ ...form, icon_url: data.icon_url })
        fetchModels()
      } else {
        toast.error(data.error || '图标上传失败')
      }
    } catch {
      toast.error('图标上传失败，请重试')
    } finally { setUploading(false) }
  }

  const handleSave = async () => {
    try {
      const token = localStorage.getItem('token')
      const method = editingModel ? 'PUT' : 'POST'
      const url = editingModel
        ? `/api/models/${editingModel.id}`
        : '/api/models'

      const body: Record<string, unknown> = {
        name: form.name,
        display_name: form.display_name,
        api_endpoint: form.api_endpoint || '',
        icon_url: form.icon_url || null,
        cost_per_image: parseInt(form.cost_per_image),
        max_concurrent: parseInt(form.max_concurrent),
        max_retries: parseInt(form.max_retries) || 3,
        visible_in_generate: form.visible_in_generate,
        visible_in_canvas: form.visible_in_canvas,
        supports_reference_image: form.supports_reference_image,
        max_reference_images: parseInt(form.max_reference_images) || 1,
        reference_image_field: form.reference_image_field || 'image_url',
      }

      if (form.supported_sizes) {
        try { body.supported_sizes = JSON.parse(form.supported_sizes) } catch {}
      } else {
        body.supported_sizes = null
      }

      if (form.api_key) {
        body.api_key = form.api_key
      }

      if (editingModel) {
        body.is_active = editingModel.is_active
      }

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      })
      const rawText = await res.text()

      if (!res.ok) {
        let data: { error?: string } = {}
        try {
          data = rawText ? JSON.parse(rawText) : {}
        } catch {
          data = { error: rawText || '保存失败' }
        }
        toast.error(data.error || '保存失败')
        return
      }

      setDialogOpen(false)
      setEditingModel(null)
      setForm(emptyForm)
      fetchModels()
    } catch {
      toast.error('网络错误，请重试')
    }
  }

  const openDeleteConfirm = (model: Model) => {
    setDeletingModel(model)
    setDeleteConfirmOpen(true)
  }

  const handleDelete = async () => {
    if (!deletingModel) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/models/${deletingModel.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || '删除失败')
        return
      }
      setDeleteConfirmOpen(false)
      setDeletingModel(null)
      fetchModels()
    } catch {
      toast.error('网络错误，请重试')
    }
  }

  const columns: ColumnDef<Model, unknown>[] = useMemo(() => [
    {
      accessorKey: 'icon_url',
      header: '图标',
      cell: ({ row }) => (
        row.original.icon_url ? (
          <img src={row.original.icon_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
        ) : (
          <div className="h-8 w-8 rounded-lg bg-muted flex items-center justify-center">
            <Image className="h-4 w-4 text-muted-foreground" />
          </div>
        )
      ),
    },
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
      cell: ({ row }) => <span className="font-mono text-sm">{row.original.name}</span>,
    },
    {
      accessorKey: 'display_name',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          显示名
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    {
      accessorKey: 'api_endpoint',
      header: 'API 地址',
      cell: ({ row }) => (
        <span className="max-w-[200px] truncate text-xs text-muted-foreground block">
          {row.original.api_endpoint || '未配置'}
        </span>
      ),
    },
    {
      accessorKey: 'cost_per_image',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          <Coins className="mr-1 h-3 w-3" />
          积分/张
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
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
      accessorKey: 'is_active',
      header: '状态',
      cell: ({ row }) => (
        <Badge variant={row.original.is_active ? 'default' : 'destructive'}>
          {row.original.is_active ? '启用' : '禁用'}
        </Badge>
      ),
    },
    {
      id: 'visibility',
      header: '可见性',
      cell: ({ row }) => (
        <div className="flex gap-1">
          {row.original.visible_in_generate !== false && (
            <Badge variant="outline" className="text-xs bg-blue-50 text-blue-600 border-blue-200">
              自由创作
            </Badge>
          )}
          {row.original.visible_in_canvas !== false && (
            <Badge variant="outline" className="text-xs bg-green-50 text-green-600 border-green-200">
              项目创作
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => {
        const model = row.original
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
              <DropdownMenuItem onClick={() => openEditDialog(model)}>
                <Pencil className="mr-2 h-4 w-4" />
                编辑模型
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => openDeleteConfirm(model)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                删除模型
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
          <CardTitle className="text-2xl font-bold">模型 / API 管理</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={models}
            searchPlaceholder="搜索模型名称..."
            searchColumn="name"
            pageSize={10}
            toolbar={
              <Button onClick={openCreateDialog}>
                <Plus className="mr-2 h-4 w-4" />
                添加模型
              </Button>
            }
          />
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingModel ? '编辑模型' : '添加模型'}
            </DialogTitle>
            <DialogDescription>
              {editingModel ? '修改模型的配置信息' : '填写信息以添加新的 AI 模型'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4 max-h-[65vh] overflow-y-auto px-1">
            <div className="grid grid-cols-[1fr_1fr] gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="name" className="flex items-center gap-1.5">
                  <Server className="h-3.5 w-3.5 text-muted-foreground" />
                  模型标识
                </Label>
                <Input
                  id="name"
                  placeholder="如 gpt-image-1"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">相同标识可创建多个不同接口的模型，但同一标识+接口不能重复</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="display_name">显示名称</Label>
                <Input
                  id="display_name"
                  placeholder="如 GPT Image 1"
                  value={form.display_name}
                  onChange={(e) => setForm({ ...form, display_name: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="api_endpoint" className="flex items-center gap-1.5">
                <Server className="h-3.5 w-3.5 text-muted-foreground" />
                API 地址
              </Label>
              <Input
                id="api_endpoint"
                placeholder="https://api.openai.com/v1/images/generations"
                value={form.api_endpoint}
                onChange={(e) => setForm({ ...form, api_endpoint: e.target.value })}
              />
              <p className="text-[11px] text-muted-foreground">完整接口地址，含路径。如只填基础地址会自动补全 /v1/images/generations</p>
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="api_key" className="flex items-center gap-1.5">
                <Key className="h-3.5 w-3.5 text-muted-foreground" />
                API Key
              </Label>
              <Input
                id="api_key"
                type="password"
                placeholder={editingModel ? '留空则不修改' : '输入 API 密钥'}
                value={form.api_key}
                onChange={(e) => setForm({ ...form, api_key: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-[1fr_1fr_1fr] gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="cost_per_image" className="flex items-center gap-1.5">
                  <Coins className="h-3.5 w-3.5 text-muted-foreground" />
                  积分/张
                </Label>
                <Input
                  id="cost_per_image"
                  type="number"
                  min="0"
                  value={form.cost_per_image}
                  onChange={(e) => setForm({ ...form, cost_per_image: e.target.value })}
                />
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
              <div className="flex flex-col gap-2">
                <Label htmlFor="max_retries" className="flex items-center gap-1.5">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  最大重试次数
                </Label>
                <Input
                  id="max_retries"
                  type="number"
                  min="0"
                  max="10"
                  value={form.max_retries}
                  onChange={(e) => setForm({ ...form, max_retries: e.target.value })}
                />
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <Label>页面可见性</Label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={form.visible_in_generate}
                    onCheckedChange={(checked) => setForm({ ...form, visible_in_generate: !!checked })}
                  />
                  <span className="text-sm">自由创作可见</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={form.visible_in_canvas}
                    onCheckedChange={(checked) => setForm({ ...form, visible_in_canvas: !!checked })}
                  />
                  <span className="text-sm">项目创作可见</span>
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground">设置模型在自由创作和项目创作页面的可见性，未勾选的页面将无法选择该模型</p>
            </div>

            <div className="flex flex-col gap-3">
              <Label>参考图片</Label>
              <label className="flex items-center gap-2 cursor-pointer">
                <Checkbox
                  checked={form.supports_reference_image}
                  onCheckedChange={(checked) => setForm({ ...form, supports_reference_image: !!checked })}
                />
                <span className="text-sm">支持参考图片</span>
              </label>
              {form.supports_reference_image && (
                <div className="grid grid-cols-[1fr_1fr] gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="max_reference_images" className="text-xs">最大参考图数量</Label>
                    <Input
                      id="max_reference_images"
                      type="number"
                      min="1"
                      max="10"
                      value={form.max_reference_images}
                      onChange={(e) => setForm({ ...form, max_reference_images: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="reference_image_field" className="text-xs">API 字段名</Label>
                    <Input
                      id="reference_image_field"
                      placeholder="image_url"
                      value={form.reference_image_field}
                      onChange={(e) => setForm({ ...form, reference_image_field: e.target.value })}
                    />
                  </div>
                </div>
              )}
              <p className="text-[11px] text-muted-foreground">开启后用户可上传参考图，参考图URL会以配置的字段名发送给API接口</p>
            </div>

            {editingModel && (
              <div className="flex flex-col gap-2">
                <Label>模型图标</Label>
                <div className="flex items-center gap-3">
                  {form.icon_url ? (
                    <img src={form.icon_url} alt="" className="h-10 w-10 rounded-xl object-cover border" />
                  ) : (
                    <div className="h-10 w-10 rounded-xl bg-muted flex items-center justify-center border">
                      <Image className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      ref={fileRef}
                      type="file"
                      accept=".png,.jpg,.jpeg,.svg,.webp"
                      className="text-xs"
                    />
                    <Button variant="outline" size="sm" onClick={handleIconUpload} disabled={uploading}>
                      <Upload className="mr-1 h-3.5 w-3.5" />
                      {uploading ? '上传中' : '上传'}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-2">
              <Label>支持尺寸</Label>
              {(() => {
                let sizes: { ratio: string; width: number; height: number }[] = []
                try {
                  const parsed = form.supported_sizes ? JSON.parse(form.supported_sizes) : null
                  sizes = Array.isArray(parsed?.ratios) ? parsed.ratios : []
                } catch {}
                return (
                  <div className="flex flex-col gap-2">
                    {sizes.map((s, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          placeholder="比例"
                          value={s.ratio}
                          onChange={(e) => {
                            const next = [...sizes]
                            next[idx] = { ...next[idx], ratio: e.target.value }
                            setForm({ ...form, supported_sizes: JSON.stringify({ ratios: next }, null, 2) })
                          }}
                          className="w-20 h-8 text-xs"
                        />
                        <span className="text-xs text-muted-foreground">W</span>
                        <Input
                          type="number"
                          placeholder="宽"
                          value={s.width}
                          onChange={(e) => {
                            const next = [...sizes]
                            next[idx] = { ...next[idx], width: parseInt(e.target.value) || 0 }
                            setForm({ ...form, supported_sizes: JSON.stringify({ ratios: next }, null, 2) })
                          }}
                          className="w-24 h-8 text-xs"
                        />
                        <span className="text-xs text-muted-foreground">H</span>
                        <Input
                          type="number"
                          placeholder="高"
                          value={s.height}
                          onChange={(e) => {
                            const next = [...sizes]
                            next[idx] = { ...next[idx], height: parseInt(e.target.value) || 0 }
                            setForm({ ...form, supported_sizes: JSON.stringify({ ratios: next }, null, 2) })
                          }}
                          className="w-24 h-8 text-xs"
                        />
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          onClick={() => {
                            const next = sizes.filter((_, i) => i !== idx)
                            setForm({ ...form, supported_sizes: next.length > 0 ? JSON.stringify({ ratios: next }, null, 2) : '' })
                          }}
                          className="shrink-0 hover:bg-destructive/10 hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const next = [...sizes, { ratio: '', width: 1024, height: 1024 }]
                        setForm({ ...form, supported_sizes: JSON.stringify({ ratios: next }, null, 2) })
                      }}
                      className="w-fit"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      添加尺寸
                    </Button>
                  </div>
                )
              })()}
              <p className="text-[11px] text-muted-foreground">留空则使用默认尺寸（1:1、3:2、2:3、16:9、9:16）</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleSave}>
              {editingModel ? '保存' : '添加'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除模型「{deletingModel?.display_name || deletingModel?.name}」吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmOpen(false)}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
