import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { apiFetch } from '@/lib/api'
import { Plus, Pencil, Upload, Image, Server, Key, Coins, Activity, Clock, Trash2, ArrowUpDown, MoreHorizontal, X, Power, PowerOff, ChevronDown } from 'lucide-react'
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
import AdminChatApis from './AdminChatApis'

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
  api_timeout: number
  task_timeout: number
  is_active: boolean
  visible_in_generate: boolean
  visible_in_canvas: boolean
  visible_in_product: boolean
  supports_reference_image: boolean
  max_reference_images: number
  reference_image_field: string
  api_format: 'openai' | 'gemini' | 'midjourney' | 'grs' | 'yunwu_mj' | 'jimeng'
  extra_config: string
}

type ApiFormat = Model['api_format']

interface ModelForm {
  name: string
  display_name: string
  api_endpoint: string
  api_key: string
  icon_url: string
  supported_sizes: string
  cost_per_image: string
  max_concurrent: string
  max_retries: string
  api_timeout: string
  task_timeout: string
  visible_in_generate: boolean
  visible_in_canvas: boolean
  visible_in_product: boolean
  supports_reference_image: boolean
  max_reference_images: string
  reference_image_field: string
  api_format: ApiFormat
  quality: string
  mj_mode: string
  mj_version: string
  reply_type: string
  aspect_ratio: string
  image_size_grs: string
  bot_type: string
  jimeng_resolution: string
  jimeng_n: string
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

const emptyForm: ModelForm = {
  name: '',
  display_name: '',
  api_endpoint: '',
  api_key: '',
  icon_url: '',
  supported_sizes: DEFAULT_SIZES,
  cost_per_image: '1',
  max_concurrent: '5',
  max_retries: '3',
  api_timeout: '120',
  task_timeout: '0',
  visible_in_generate: true,
  visible_in_canvas: true,
  visible_in_product: true,
  supports_reference_image: false,
  max_reference_images: '1',
  reference_image_field: 'image_url',
  api_format: 'openai',
  quality: '',
  mj_mode: 'fast',
  mj_version: '',
  // GRS 格式
  reply_type: 'json',
  aspect_ratio: '',
  image_size_grs: '',
  // 云雾 MJ 格式
  bot_type: 'MID_JOURNEY',
  // Jimeng 格式
  jimeng_resolution: '2k',
  jimeng_n: '1',
}

export default function AdminModels() {
  const [activeView, setActiveView] = useState<'image-models' | 'chat-apis'>('image-models')
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
      const res = await apiFetch('/api/models/all')
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
    const extraConfig = (() => {
      try {
        return JSON.parse(model.extra_config || '{}')
      } catch { return {} }
    })()
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
      api_timeout: String(model.api_timeout ?? 120),
      task_timeout: String(model.task_timeout ?? 0),
      visible_in_generate: model.visible_in_generate !== false,
      visible_in_canvas: model.visible_in_canvas !== false,
      visible_in_product: model.visible_in_product !== false,
      supports_reference_image: !!model.supports_reference_image,
      max_reference_images: String(model.max_reference_images || 1),
      reference_image_field: model.reference_image_field || 'image_url',
      api_format: model.api_format || 'openai',
      quality: extraConfig.quality || '',
      mj_mode: extraConfig.mj_mode || 'fast',
      mj_version: extraConfig.mj_version || '',
      // GRS 格式
      reply_type: extraConfig.reply_type || 'json',
      aspect_ratio: extraConfig.aspect_ratio || '',
      image_size_grs: extraConfig.image_size_grs || '',
      // 云雾 MJ 格式
      bot_type: extraConfig.bot_type || 'MID_JOURNEY',
      // Jimeng 格式
      jimeng_resolution: extraConfig.jimeng_resolution || '2k',
      jimeng_n: String(extraConfig.jimeng_n || 1),
    })
    setDialogOpen(true)
  }

  const handleIconUpload = async () => {
    if (!editingModel || !fileRef.current?.files?.[0]) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('icon', fileRef.current.files[0])
      const res = await apiFetch(`/api/models/${editingModel.id}/icon`, {
        method: 'POST',
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
      const method = editingModel ? 'PUT' : 'POST'
      const url = editingModel
        ? `/api/models/${editingModel.id}`
        : '/api/models'

      // 构建 extra_config
      const extraConfig: Record<string, string | number> = {}
      if (form.api_format === 'openai' && form.quality) {
        extraConfig.quality = form.quality
      }
      if (form.api_format === 'midjourney') {
        if (form.mj_mode) extraConfig.mj_mode = form.mj_mode
        if (form.mj_version) extraConfig.mj_version = form.mj_version
      }
      if (form.api_format === 'grs') {
        if (form.reply_type) extraConfig.reply_type = form.reply_type
        if (form.aspect_ratio) extraConfig.aspect_ratio = form.aspect_ratio
        if (form.image_size_grs) extraConfig.image_size_grs = form.image_size_grs
      }
      if (form.api_format === 'yunwu_mj') {
        if (form.bot_type) extraConfig.bot_type = form.bot_type
        if (form.mj_version) extraConfig.mj_version = form.mj_version
      }
      if (form.api_format === 'jimeng') {
        if (form.jimeng_resolution) extraConfig.jimeng_resolution = form.jimeng_resolution
        if (form.jimeng_n) extraConfig.jimeng_n = parseInt(form.jimeng_n)
      }

      const body: Record<string, unknown> = {
        name: form.name,
        display_name: form.display_name,
        api_endpoint: form.api_endpoint || '',
        icon_url: form.icon_url || null,
        cost_per_image: parseInt(form.cost_per_image),
        max_concurrent: parseInt(form.max_concurrent),
        max_retries: parseInt(form.max_retries) || 3,
        api_timeout: parseInt(form.api_timeout) || 120,
        task_timeout: parseInt(form.task_timeout) || 0,
        visible_in_generate: form.visible_in_generate,
        visible_in_canvas: form.visible_in_canvas,
        visible_in_product: form.visible_in_product,
        supports_reference_image: form.supports_reference_image,
        max_reference_images: parseInt(form.max_reference_images) || 1,
        reference_image_field: form.reference_image_field || 'image_url',
        api_format: form.api_format,
        extra_config: JSON.stringify(extraConfig),
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

      const res = await apiFetch(url, {
        method,
        body,
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
      const res = await apiFetch(`/api/models/${deletingModel.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || '禁用失败')
        return
      }
      toast.success('模型已禁用')
      setDeleteConfirmOpen(false)
      setDeletingModel(null)
      fetchModels()
    } catch {
      toast.error('网络错误，请重试')
    }
  }

  const toggleModelActive = async (model: Model) => {
    try {
      const newActive = !model.is_active
      const res = await apiFetch(`/api/models/${model.id}`, {
        method: 'PUT',
        body: { is_active: newActive },
      })
      if (!res.ok) {
        const data = await res.json()
        toast.error(data.error || '操作失败')
        return
      }
      toast.success(newActive ? '模型已启用' : '模型已禁用')
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
      accessorKey: 'api_format',
      header: '接口格式',
      cell: ({ row }) => {
        const format = row.original.api_format || 'openai'
        const formatLabels: Record<string, string> = {
          openai: 'OpenAI',
          gemini: 'Gemini',
          midjourney: 'Midjourney',
          grs: 'GRS中转站',
          yunwu_mj: '云雾MJ',
          jimeng: '即梦AI',
        }
        const formatColors: Record<string, string> = {
          openai: 'bg-green-50 text-green-600 border-green-200',
          gemini: 'bg-blue-50 text-blue-600 border-blue-200',
          midjourney: 'bg-purple-50 text-purple-600 border-purple-200',
          grs: 'bg-orange-50 text-orange-600 border-orange-200',
          yunwu_mj: 'bg-pink-50 text-pink-600 border-pink-200',
          jimeng: 'bg-cyan-50 text-cyan-600 border-cyan-200',
        }
        return (
          <Badge variant="outline" className={`text-xs ${formatColors[format]}`}>
            {formatLabels[format]}
          </Badge>
        )
      },
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
          {row.original.visible_in_product !== false && (
            <Badge variant="outline" className="text-xs bg-orange-50 text-orange-600 border-orange-200">
              商品主图
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
              <DropdownMenuItem onClick={() => toggleModelActive(model)}>
                {model.is_active ? (
                  <>
                    <PowerOff className="mr-2 h-4 w-4" />
                    禁用模型
                  </>
                ) : (
                  <>
                    <Power className="mr-2 h-4 w-4" />
                    启用模型
                  </>
                )}
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

  const viewLabels = { 'image-models': '图片模型', 'chat-apis': '对话模型' } as const

  const viewSelector = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="gap-1.5">
          {viewLabels[activeView]}
          <ChevronDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuItem onClick={() => setActiveView('image-models')}>
          图片模型
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setActiveView('chat-apis')}>
          对话模型
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">模型 / API 管理</CardTitle>
        </CardHeader>
        <CardContent>
          {activeView === 'image-models' ? (
            <DataTable
              columns={columns}
              data={models}
              searchPlaceholder="搜索模型名称..."
              searchColumn="name"
              pageSize={10}
              toolbar={
                <div className="flex items-center gap-2">
                  {viewSelector}
                  <Button onClick={openCreateDialog}>
                    <Plus className="mr-2 h-4 w-4" />
                    添加模型
                  </Button>
                </div>
              }
            />
          ) : (
            <AdminChatApis prefixToolbar={viewSelector} />
          )}
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

            <div className="flex flex-col gap-2">
              <Label htmlFor="api_format">API 接口格式</Label>
              <select
                id="api_format"
                value={form.api_format}
                onChange={(e) => setForm({ ...form, api_format: e.target.value as 'openai' | 'gemini' | 'midjourney' | 'grs' | 'yunwu_mj' | 'jimeng' })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                <option value="openai">OpenAI GPT Image 格式</option>
                <option value="gemini">Gemini Nano Banana 格式</option>
                <option value="midjourney">Midjourney 格式（标准中转站）</option>
                <option value="grs">GRS 中转站格式</option>
                <option value="yunwu_mj">云雾 Midjourney 格式</option>
                <option value="jimeng">即梦 AI 格式</option>
              </select>
              <p className="text-[11px] text-muted-foreground">
                {form.api_format === 'openai' && '标准 OpenAI 图片生成接口，支持 quality 参数'}
                {form.api_format === 'gemini' && 'Gemini 简化格式，尺寸使用比例（如 16:9）'}
                {form.api_format === 'midjourney' && '标准 MJ 中转站异步接口，支持 --ar --v 参数，需要轮询获取结果'}
                {form.api_format === 'grs' && 'GRS 中转站统一格式（nano-banana / gpt-image-2），支持同步和异步模式'}
                {form.api_format === 'yunwu_mj' && '云雾中转站 Midjourney 接口，支持 botType 切换 MJ/Niji'}
                {form.api_format === 'jimeng' && '即梦 AI 文生图/图生图接口，支持参考图片生成'}
              </p>
            </div>

            {/* OpenAI 特定配置 */}
            {form.api_format === 'openai' && (
              <div className="flex flex-col gap-2">
                <Label htmlFor="quality">图片质量 (quality)</Label>
                <select
                  id="quality"
                  value={form.quality}
                  onChange={(e) => setForm({ ...form, quality: e.target.value })}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="">默认</option>
                  <option value="low">low - 低质量（快速）</option>
                  <option value="medium">medium - 中等质量</option>
                  <option value="high">high - 高质量</option>
                </select>
                <p className="text-[11px] text-muted-foreground">控制生成图片的质量，高质量生成时间更长</p>
              </div>
            )}

            {/* Midjourney 特定配置 */}
            {form.api_format === 'midjourney' && (
              <div className="grid grid-cols-[1fr_1fr] gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="mj_mode">生成模式 (mode)</Label>
                  <select
                    id="mj_mode"
                    value={form.mj_mode}
                    onChange={(e) => setForm({ ...form, mj_mode: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="fast">fast - 快速模式</option>
                    <option value="relax">relax - 放松模式</option>
                    <option value="turbo">turbo - 涡轮模式</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="mj_version">版本 (--v)</Label>
                  <select
                    id="mj_version"
                    value={form.mj_version}
                    onChange={(e) => setForm({ ...form, mj_version: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">默认</option>
                    <option value="5">v5</option>
                    <option value="6">v6</option>
                  </select>
                </div>
                <p className="text-[11px] text-muted-foreground col-span-2">尺寸比例会自动添加到 prompt 中（--ar 参数）</p>
              </div>
            )}

            {/* GRS 中转站特定配置 */}
            {form.api_format === 'grs' && (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-[1fr_1fr] gap-4">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="reply_type">响应模式 (replyType)</Label>
                    <select
                      id="reply_type"
                      value={form.reply_type}
                      onChange={(e) => setForm({ ...form, reply_type: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="json">json - 同步返回</option>
                      <option value="async">async - 异步轮询</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="image_size_grs">分辨率 (imageSize)</Label>
                    <select
                      id="image_size_grs"
                      value={form.image_size_grs}
                      onChange={(e) => setForm({ ...form, image_size_grs: e.target.value })}
                      className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                    >
                      <option value="">默认</option>
                      <option value="1K">1K</option>
                      <option value="2K">2K</option>
                      <option value="4K">4K</option>
                    </select>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="aspect_ratio">宽高比 (aspectRatio)</Label>
                  <Input
                    id="aspect_ratio"
                    placeholder="如 1:1 或 1024x1024，留空则自动转换"
                    value={form.aspect_ratio}
                    onChange={(e) => setForm({ ...form, aspect_ratio: e.target.value })}
                  />
                  <p className="text-[11px] text-muted-foreground">nano-banana 使用比例格式（如 1:1），gpt-image-2 使用像素格式（如 1024x1024）。留空则根据用户选择的尺寸自动转换</p>
                </div>
              </div>
            )}

            {/* 云雾 MJ 特定配置 */}
            {form.api_format === 'yunwu_mj' && (
              <div className="grid grid-cols-[1fr_1fr] gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="bot_type">Bot 类型 (botType)</Label>
                  <select
                    id="bot_type"
                    value={form.bot_type}
                    onChange={(e) => setForm({ ...form, bot_type: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="MID_JOURNEY">MID_JOURNEY - Midjourney</option>
                    <option value="NIJI_JOURNEY">NIJI_JOURNEY - Niji Journey</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="mj_version_yunwu">版本 (--v)</Label>
                  <select
                    id="mj_version_yunwu"
                    value={form.mj_version}
                    onChange={(e) => setForm({ ...form, mj_version: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">默认</option>
                    <option value="5">v5</option>
                    <option value="6">v6</option>
                    <option value="6.1">v6.1</option>
                  </select>
                </div>
                <p className="text-[11px] text-muted-foreground col-span-2">尺寸比例会自动添加到 prompt 中（--ar 参数），云雾MJ不支持mode参数</p>
              </div>
            )}

            {/* Jimeng 即梦 AI 特定配置 */}
            {form.api_format === 'jimeng' && (
              <div className="grid grid-cols-[1fr_1fr] gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="jimeng_resolution">分辨率 (resolution)</Label>
                  <select
                    id="jimeng_resolution"
                    value={form.jimeng_resolution}
                    onChange={(e) => setForm({ ...form, jimeng_resolution: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="1k">1k</option>
                    <option value="2k">2k</option>
                    <option value="4k">4k</option>
                  </select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="jimeng_n">单次生成数量 (n)</Label>
                  <select
                    id="jimeng_n"
                    value={form.jimeng_n}
                    onChange={(e) => setForm({ ...form, jimeng_n: e.target.value })}
                    className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="1">1 张</option>
                    <option value="2">2 张</option>
                    <option value="3">3 张</option>
                    <option value="4">4 张</option>
                  </select>
                </div>
                <p className="text-[11px] text-muted-foreground col-span-2">支持尺寸使用配置的比例参数，图片数量通过 n 参数一次生成多张</p>
              </div>
            )}

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
              <div className="flex flex-col gap-2">
                <Label htmlFor="api_timeout" className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  单次请求超时(秒)
                </Label>
                <Input
                  id="api_timeout"
                  type="number"
                  min="10"
                  max="600"
                  value={form.api_timeout}
                  onChange={(e) => setForm({ ...form, api_timeout: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">单次API请求的最大等待时间，超时则判定为失败。默认120秒</p>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="task_timeout" className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  任务总超时(秒)
                </Label>
                <Input
                  id="task_timeout"
                  type="number"
                  min="0"
                  max="3600"
                  value={form.task_timeout}
                  onChange={(e) => setForm({ ...form, task_timeout: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground">任务总等待时间（含所有重试），0表示不限制。适用于Midjourney等长时间任务</p>
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
                <label className="flex items-center gap-2 cursor-pointer">
                  <Checkbox
                    checked={form.visible_in_product}
                    onCheckedChange={(checked) => setForm({ ...form, visible_in_product: !!checked })}
                  />
                  <span className="text-sm">商品主图可见</span>
                </label>
              </div>
              <p className="text-[11px] text-muted-foreground">设置模型在不同页面的可见性，未勾选的页面将无法选择该模型</p>
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
              确定要删除模型「{deletingModel?.display_name || deletingModel?.name}」吗？删除后模型将被禁用，可通过启用功能恢复。
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
