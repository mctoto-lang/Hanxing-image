import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Loader2, Eye, ImagePlus, X, Plus, Tags, FilePlus2, Pencil, Trash2, Check, ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react'
import { HugeiconsIcon, Upload04Icon, Layers01Icon, File02Icon, Settings02Icon, Cancel01Icon, AlertCircleIcon, Image02Icon, CubeIcon, FolderKanbanIcon, StarsIcon, Loading03Icon, ArrowRight01Icon, ArrowUpDownIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import { Combobox } from '@/components/ui/combobox'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
} from '@/components/ui/attachment'
import { Skeleton } from '@/components/ui/skeleton'
import { apiFetch, safeResponseJson } from '@/lib/api'
import { uploadReferenceImages } from '@/lib/product-reference-upload'
import { cn, toImageSrc } from '@/lib/utils'
import { toast } from 'sonner'
import ImagePreviewOverlay from '@/components/ImagePreviewOverlay'

interface ModelSizeRatio {
  ratio: string
  width: number
  height: number
}

interface Model {
  id: number
  name: string
  display_name: string
  cost_per_image: number
  supports_reference_image: boolean
  max_reference_images: number
  icon_url: string | null
  supported_sizes: { ratios: ModelSizeRatio[] } | null
}

interface GenerationTask {
  id: number
  status: 'pending' | 'processing' | 'queued' | 'completed' | 'failed'
  result_images?: string[]
  error_message?: string
  template_info?: {
    mode: 'single' | 'template'
    sub_template_name?: string
  }
  completedAt?: number
  prompt?: string
  model_name?: string
  image_size?: string
  started_at?: string | null
  completed_at?: string | null
  created_at?: string
}

interface HistoryImage {
  url: string
  taskId: number
  subTemplateName?: string
  timestamp: number
  prompt?: string
  modelName?: string
  imageSize?: string
  startedAt?: string | null
  completedAt?: string | null
  createdAt?: string
}

interface HistoryTaskResponse {
  id: number
  status: 'pending' | 'processing' | 'queued' | 'completed' | 'failed'
  result_images?: string[] | string | null
  error_message?: string
  prompt?: string | null
  model_name?: string | null
  image_size?: string | null
  started_at?: string | null
  template_info?: {
    mode?: 'single' | 'template'
    sub_template_name?: string
  } | string | null
  completed_at?: string | null
  created_at?: string | null
}

type RecordFilter = 'all' | 'completed' | 'failed'

type RecordEntry = {
  type: 'completed' | 'pending' | 'failed'
  data: HistoryImage | GenerationTask
  timestamp: number
}

type RecordSlot =
  | { type: 'record'; record: RecordEntry; index: number }
  | { type: 'empty'; key: string }

const isRunningTaskStatus = (status: GenerationTask['status']) => status === 'pending' || status === 'processing' || status === 'queued'

interface CanvasImage {
  id: string
  url: string
  x: number
  y: number
  scale: number
  naturalWidth: number
  naturalHeight: number
}

type CanvasMode = 'single' | 'multi'

interface ReferenceImageItem {
  id: string
  url: string | null
  name: string
  typeLabel: string
  sizeLabel: string
  status: 'uploading' | 'done'
  progress: number
}

interface ProductMainTemplate {
  id: number
  group_id?: number | null
  group_name?: string | null
  group_badge_color?: TemplateGroupColor | null
  name: string
  description?: string | null
  visibility?: 'private' | 'public'
  username?: string | null
  sub_template_count?: number
  sub_templates?: ProductSubTemplate[]
}

type TemplateGroupColor = 'slate' | 'red' | 'orange' | 'amber' | 'yellow' | 'lime' | 'green' | 'emerald' | 'teal' | 'cyan' | 'sky' | 'blue' | 'indigo' | 'violet' | 'purple' | 'fuchsia' | 'pink' | 'rose'

interface ProductTemplateGroup {
  id: number
  user_id?: number
  name: string
  badge_color: TemplateGroupColor
}

type NewTemplateGroupMode = 'existing' | 'new'

interface ProductSubTemplate {
  id: number
  main_template_id: number
  main_template_name?: string
  name: string
  fixed_prompt: string
  fixed_reference_images?: string[] | string | null
  preview_image_url?: string | null
  sort_order?: number
}

type LoadedTemplateMap = Record<number, ProductMainTemplate>

function isJsonResponse(res: Response) {
  return (res.headers.get('content-type') || '').includes('application/json')
}

function getArrayData<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data
  if (data && typeof data === 'object' && Array.isArray((data as { data?: unknown[] }).data)) {
    return (data as { data: T[] }).data
  }
  if (data && typeof data === 'object' && Array.isArray((data as { models?: unknown[] }).models)) {
    return (data as { models: T[] }).models
  }
  if (data && typeof data === 'object' && Array.isArray((data as { templates?: unknown[] }).templates)) {
    return (data as { templates: T[] }).templates
  }
  return []
}



function parseJsonArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : []
    } catch {
      return []
    }
  }
  return []
}

function parseTemplateInfo(value: HistoryTaskResponse['template_info']): GenerationTask['template_info'] {
  if (!value) return undefined
  const normalize = (input: { mode?: 'single' | 'template'; sub_template_name?: string }) => {
    if (!input.mode) return undefined
    return {
      mode: input.mode,
      sub_template_name: input.sub_template_name,
    }
  }
  if (typeof value === 'string') {
    try {
      return normalize(JSON.parse(value))
    } catch {
      return undefined
    }
  }
  return normalize(value)
}

function toTimestamp(value?: string | null) {
  if (!value) return Date.now()
  const parsed = new Date(value).getTime()
  return Number.isFinite(parsed) ? parsed : Date.now()
}

const templateGroupColorOptions: { value: TemplateGroupColor; label: string; className: string; dotClassName: string }[] = [
  { value: 'slate', label: '岩灰', className: 'border-slate-200 bg-slate-50 text-slate-700', dotClassName: 'bg-slate-500' },
  { value: 'red', label: '玫红', className: 'border-red-200 bg-red-50 text-red-700', dotClassName: 'bg-red-500' },
  { value: 'orange', label: '橙色', className: 'border-orange-200 bg-orange-50 text-orange-700', dotClassName: 'bg-orange-500' },
  { value: 'amber', label: '琥珀', className: 'border-amber-200 bg-amber-50 text-amber-700', dotClassName: 'bg-amber-500' },
  { value: 'green', label: '绿色', className: 'border-green-200 bg-green-50 text-green-700', dotClassName: 'bg-green-500' },
  { value: 'teal', label: '青绿', className: 'border-teal-200 bg-teal-50 text-teal-700', dotClassName: 'bg-teal-500' },
  { value: 'blue', label: '蓝色', className: 'border-blue-200 bg-blue-50 text-blue-700', dotClassName: 'bg-blue-500' },
  { value: 'violet', label: '紫色', className: 'border-violet-200 bg-violet-50 text-violet-700', dotClassName: 'bg-violet-500' },
  { value: 'pink', label: '粉色', className: 'border-pink-200 bg-pink-50 text-pink-700', dotClassName: 'bg-pink-500' },
]

const templateGroupColorClassMap = templateGroupColorOptions.reduce<Record<string, string>>((acc, item) => {
  acc[item.value] = item.className
  return acc
}, {})

function getTemplateGroupBadgeClass(color?: string | null) {
  return templateGroupColorClassMap[color || ''] || templateGroupColorClassMap.slate
}

function formatFileSize(size: number) {
  if (!Number.isFinite(size) || size <= 0) return '0 B'
  if (size < 1024) return `${size} B`
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(size >= 100 * 1024 ? 0 : 1)} KB`
  return `${(size / (1024 * 1024)).toFixed(size >= 10 * 1024 * 1024 ? 0 : 1)} MB`
}

function getFileTypeLabel(name: string, file?: File) {
  const fromType = file?.type?.split('/').pop()?.toUpperCase()
  if (fromType) return fromType
  const ext = name.split('.').pop()?.toUpperCase()
  return ext || 'IMG'
}

function buildUploadingReferenceItem(file: File, index: number): ReferenceImageItem {
  return {
    id: `uploading-${file.name}-${file.lastModified}-${index}`,
    url: null,
    name: file.name,
    typeLabel: getFileTypeLabel(file.name, file),
    sizeLabel: formatFileSize(file.size),
    status: 'uploading',
    progress: 0,
  }
}

export default function ProductImagePage() {
  const [models, setModels] = useState<Model[]>([])
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [userCredits, setUserCredits] = useState(0)

  const [referenceImages, setReferenceImages] = useState<ReferenceImageItem[]>([])
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState('1024x1024')
  const [count, setCount] = useState(1)

  // 模板相关
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)
  const [templates, setTemplates] = useState<ProductMainTemplate[]>([])
  const [templateGroups, setTemplateGroups] = useState<ProductTemplateGroup[]>([])
  const [loadingTemplates, setLoadingTemplates] = useState(false)
  const [templateSearch, setTemplateSearch] = useState('')
  const [templateGroupFilter, setTemplateGroupFilter] = useState('all')
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [loadedTemplateDetails, setLoadedTemplateDetails] = useState<LoadedTemplateMap>({})
  const [templateSelectedSubTemplateIds, setTemplateSelectedSubTemplateIds] = useState<Set<number>>(new Set())
  const [appliedTemplateSubTemplates, setAppliedTemplateSubTemplates] = useState<ProductSubTemplate[]>([])
  const [appliedTemplatePrompts, setAppliedTemplatePrompts] = useState<Record<number, string>>({})
  const [activeAppliedTemplateIndex, setActiveAppliedTemplateIndex] = useState(0)
  const [showCreateTemplateDialog, setShowCreateTemplateDialog] = useState(false)
  const [showCreateSubTemplateDialog, setShowCreateSubTemplateDialog] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateDescription, setNewTemplateDescription] = useState('')
  const [newTemplateVisibility, setNewTemplateVisibility] = useState<'private' | 'public'>('private')
  const [newTemplateGroupMode, setNewTemplateGroupMode] = useState<NewTemplateGroupMode>('existing')
  const [newTemplateGroupId, setNewTemplateGroupId] = useState('')
  const [newTemplateGroupName, setNewTemplateGroupName] = useState('')
  const [newTemplateGroupColor, setNewTemplateGroupColor] = useState<TemplateGroupColor>('slate')
  const [editingTemplate, setEditingTemplate] = useState<ProductMainTemplate | null>(null)
  const [deletingTemplate, setDeletingTemplate] = useState<ProductMainTemplate | null>(null)
  const [creatingTemplate, setCreatingTemplate] = useState(false)
  const [newSubTemplateName, setNewSubTemplateName] = useState('')
  const [newSubTemplatePrompt, setNewSubTemplatePrompt] = useState('')
  const [newSubTemplatePreviewImageUrl, setNewSubTemplatePreviewImageUrl] = useState<string | null>(null)
  const [newSubTemplateSortOrder, setNewSubTemplateSortOrder] = useState('0')
  const [editingSubTemplate, setEditingSubTemplate] = useState<ProductSubTemplate | null>(null)
  const [deletingSubTemplate, setDeletingSubTemplate] = useState<ProductSubTemplate | null>(null)
  const [uploadingSubTemplatePreview, setUploadingSubTemplatePreview] = useState(false)
  const [subTemplatePreviewUploadProgress, setSubTemplatePreviewUploadProgress] = useState(0)
  const [creatingSubTemplate, setCreatingSubTemplate] = useState(false)

  const [tasks, setTasks] = useState<GenerationTask[]>([])
  const [generating, setGenerating] = useState(false)
  const [uploadingReference, setUploadingReference] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(true)

  const [selectedHistoryImages, setSelectedHistoryImages] = useState<Set<string>>(new Set())
  const [historyImages, setHistoryImages] = useState<HistoryImage[]>([])
  const prevImageCount = useRef(0)
  const historyInitializedRef = useRef(false)
  const autoCanvasTaskIdsRef = useRef<Set<number>>(new Set())
  const pollCleanupFns = useRef<Set<() => void>>(new Set())
  const uploadInputRef = useRef<HTMLInputElement>(null)

  // 自由画布
  const [canvasImages, setCanvasImages] = useState<CanvasImage[]>([])
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('single')
  const [canvasZoom, setCanvasZoom] = useState(100)
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 })
  const canvasIdCounter = useRef(0)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [previewImageData, setPreviewImageData] = useState<{
    prompt?: string
    model_name?: string
    image_size?: string
    started_at?: string | null
    completed_at?: string | null
    created_at?: string
  } | null>(null)
  const dragStateRef = useRef<{
    type: 'drag' | null
    id: string | null
    startClientX: number
    startClientY: number
    startImgX: number
    startImgY: number
  }>({ type: null, id: null, startClientX: 0, startClientY: 0, startImgX: 0, startImgY: 0 })
  const panStateRef = useRef<{
    isPanning: boolean
    startX: number
    startY: number
    startPanX: number
    startPanY: number
  }>({ isPanning: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 })
  const scaleStateRef = useRef<{
    isScaling: boolean
    imageId: string | null
    startClientX: number
    startClientY: number
    startScale: number
    centerX: number
    centerY: number
  }>({ isScaling: false, imageId: null, startClientX: 0, startClientY: 0, startScale: 1, centerX: 0, centerY: 0 })

  const selectedModel = models.find(m => m.id === selectedModelId)
  const hasAppliedTemplates = appliedTemplateSubTemplates.length > 0
  const activeAppliedTemplate = hasAppliedTemplates ? appliedTemplateSubTemplates[Math.min(activeAppliedTemplateIndex, appliedTemplateSubTemplates.length - 1)] : null
  const activeAppliedTemplatePrompt = activeAppliedTemplate ? appliedTemplatePrompts[activeAppliedTemplate.id] ?? activeAppliedTemplate.fixed_prompt ?? '' : prompt
  const effectiveCount = hasAppliedTemplates ? appliedTemplateSubTemplates.length : count
  const singleCost = (selectedModel?.cost_per_image || 0) * effectiveCount
  const cost = singleCost
  const modelOptions = useMemo(() => models.map(model => ({
    value: String(model.id),
    label: model.display_name || model.name,
    description: model.name,
    icon: model.icon_url ? toImageSrc(model.icon_url) : undefined,
  })), [models])

  // 模型可用尺寸列表
  const availableSizes = useMemo(() => {
    const ratios = selectedModel?.supported_sizes?.ratios
    if (ratios && ratios.length > 0) return ratios
    return [
      { ratio: '1:1', width: 1024, height: 1024 },
      { ratio: '3:2', width: 1536, height: 1024 },
      { ratio: '2:3', width: 1024, height: 1536 },
    ]
  }, [selectedModel])
  const sizeOptions = useMemo(() => availableSizes.map((item) => ({
    value: `${item.width}x${item.height}`,
    label: `${item.ratio} (${item.width}×${item.height})`,
    description: `${item.width}x${item.height}`,
  })), [availableSizes])

  // 当前选择的尺寸是否仍在可用列表里；不在则用第一个
  useEffect(() => {
    if (availableSizes.length === 0) return
    const matched = availableSizes.find(s => `${s.width}x${s.height}` === size)
    if (!matched) setSize(`${availableSizes[0].width}x${availableSizes[0].height}`)
  }, [availableSizes, size])
  const uploadedReferenceImages = useMemo(
    () => referenceImages.filter((item) => item.status === 'done' && item.url),
    [referenceImages]
  )
  const canUploadMore = referenceImages.length < (selectedModel?.max_reference_images || 5)
  const activeCount = tasks.filter(t => isRunningTaskStatus(t.status)).length
  const pendingTasks = tasks.filter(t => isRunningTaskStatus(t.status))
  const failedTasks = tasks.filter(t => t.status === 'failed')

  // 生成记录：合并所有类型的记录（已完成、进行中、失败）
  const allRecords = useMemo(() => {
    const records: RecordEntry[] = []
    
    // 已完成的图片
    historyImages.forEach(img => {
      records.push({ type: 'completed', data: img, timestamp: img.timestamp })
    })
    
    // 进行中的任务
        pendingTasks.forEach(task => {
          records.push({ type: 'pending', data: task, timestamp: task.completedAt || Date.now() })
        })
        
        // 失败的任务
        failedTasks.forEach(task => {
          records.push({ type: 'failed', data: task, timestamp: task.completedAt || Date.now() })
        })
    
    // 排序：进行中优先，然后按时间倒序（最新的在前）
    return records.sort((a, b) => {
      // 进行中的任务永远在最前面
      if (a.type === 'pending' && b.type !== 'pending') return -1
      if (a.type !== 'pending' && b.type === 'pending') return 1
      // 其他任务按时间倒序
      return b.timestamp - a.timestamp
    })
  }, [historyImages, pendingTasks, failedTasks])

  // 记录分页
  const [recordFilter, setRecordFilter] = useState<RecordFilter>('all')
  const [recordPage, setRecordPage] = useState(0)
  const filteredRecords = useMemo(() => {
    if (recordFilter === 'completed') return allRecords.filter(record => record.type === 'completed')
    if (recordFilter === 'failed') return allRecords.filter(record => record.type === 'failed')
    return allRecords
  }, [allRecords, recordFilter])
  const recordsPerPage = 8
  const totalRecordPages = Math.ceil(filteredRecords.length / recordsPerPage)
  const currentPageRecords = filteredRecords.slice(recordPage * recordsPerPage, (recordPage + 1) * recordsPerPage)
  const nextPageRecords = filteredRecords.slice((recordPage + 1) * recordsPerPage, (recordPage + 2) * recordsPerPage)
  const recordThumbnailUrls = useMemo(
    () => currentPageRecords
      .filter((record): record is RecordEntry & { type: 'completed'; data: HistoryImage } => record.type === 'completed')
      .map(record => toImageSrc(record.data.url, { width: 176, height: 176 })),
    [currentPageRecords]
  )
  const nextPageThumbnailUrls = useMemo(
    () => nextPageRecords
      .filter((record): record is RecordEntry & { type: 'completed'; data: HistoryImage } => record.type === 'completed')
      .map(record => toImageSrc(record.data.url, { width: 176, height: 176 })),
    [nextPageRecords]
  )
  const recordSlots = useMemo<RecordSlot[]>(() => {
    const slots: RecordSlot[] = []

    currentPageRecords.forEach((record, index) => {
      slots.push({ type: 'record', record, index })
    })

    while (slots.length < recordsPerPage) {
      slots.push({ type: 'empty', key: `empty-${slots.length}` })
    }

    return slots
  }, [currentPageRecords, recordsPerPage])

  useEffect(() => {
    setRecordPage(0)
  }, [recordFilter])

  useEffect(() => {
    if (totalRecordPages === 0) {
      if (recordPage !== 0) setRecordPage(0)
      return
    }
    if (recordPage > totalRecordPages - 1) {
      setRecordPage(totalRecordPages - 1)
    }
  }, [recordPage, totalRecordPages])

  useEffect(() => {
    const urls = [...recordThumbnailUrls, ...nextPageThumbnailUrls]
    if (urls.length === 0) return

    const images = urls.map((url) => {
      const image = new Image()
      image.decoding = 'async'
      image.src = url
      return image
    })

    return () => {
      images.forEach((image) => {
        image.onload = null
        image.onerror = null
      })
    }
  }, [nextPageThumbnailUrls, recordThumbnailUrls])

  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await apiFetch('/api/models?page=product')
        if (!res.ok) throw new Error(`加载模型失败 (${res.status})`)
        if (!isJsonResponse(res)) throw new Error('模型接口返回的不是 JSON 数据')
        const data = await res.json()
        const modelList = getArrayData<Model>(data)
        setModels(modelList)
        if (modelList.length > 0) setSelectedModelId(modelList[0].id)
        setLoading(false)
      } catch (error) {
        console.error('加载模型失败:', error)
        toast.error('加载模型失败')
        setLoading(false)
      }
    }
    fetchModels()
  }, [])

  useEffect(() => {
    const credits = localStorage.getItem('userCreativeCredits')
    if (credits) setUserCredits(parseInt(credits))

  }, [])

  useEffect(() => {
    const fetchProductHistory = async () => {
      setHistoryLoading(true)
      try {
        const res = await apiFetch('/api/tasks/history?limit=20&source=product')
        if (!res.ok) {
          setTasks([])
          return
        }
        const data = await safeResponseJson(res)
        const taskList = Array.isArray(data.tasks) ? data.tasks as HistoryTaskResponse[] : []
        const normalizedTasks: GenerationTask[] = taskList.map((task) => ({
          id: task.id,
          status: task.status,
          result_images: parseJsonArray(task.result_images),
          error_message: task.error_message,
          prompt: task.prompt || undefined,
          model_name: task.model_name || undefined,
          image_size: task.image_size || undefined,
          started_at: task.started_at || null,
          completed_at: task.completed_at || null,
          created_at: task.created_at || undefined,
          template_info: parseTemplateInfo(task.template_info),
          completedAt: toTimestamp(task.completed_at || task.created_at),
        }))

        const pendingTaskIds = normalizedTasks
          .filter(task => isRunningTaskStatus(task.status))
          .map(task => task.id)

        if (pendingTaskIds.length === 0) {
          setTasks(normalizedTasks)
          return
        }

        const latestStatusRes = await apiFetch(`/api/tasks?ids=${pendingTaskIds.join(',')}`)
        const latestStatusData = await safeResponseJson(latestStatusRes)
        const latestTasks = Array.isArray(latestStatusData.tasks) ? latestStatusData.tasks as GenerationTask[] : []
        const latestTaskMap = new Map(latestTasks.map(task => [task.id, task]))

        const mergedTasks = normalizedTasks.map(task => {
          const latestTask = latestTaskMap.get(task.id)
          if (!latestTask) return task
          return {
            ...task,
            ...latestTask,
            completedAt: latestTask.status === 'completed'
              ? (task.completedAt || Date.now())
              : task.completedAt,
          }
        })

        setTasks(mergedTasks)

        const stillPendingTaskIds = mergedTasks
          .filter(task => isRunningTaskStatus(task.status))
          .map(task => task.id)

        if (stillPendingTaskIds.length > 0) {
          pollTasks(stillPendingTaskIds, { appendInitialTasks: false })
        }
      } catch {
        setTasks([])
      } finally {
        setHistoryLoading(false)
      }
    }

    fetchProductHistory()

    return () => {}
  }, [])

  // 组件卸载时清理所有轮询
  useEffect(() => {
    return () => {
      pollCleanupFns.current.forEach(cleanup => cleanup())
      pollCleanupFns.current.clear()
    }
  }, [])

  // 把图片加入画布（single 模式替换，multi 模式追加并轻微错位）
  const addImageToCanvas = useCallback((url: string, modeOverride?: CanvasMode) => {
    const effectiveMode = modeOverride || canvasMode
    const container = canvasContainerRef.current
    const cw = container?.clientWidth || 600
    const ch = container?.clientHeight || 400

    const img = new Image()
    img.onload = () => {
      const nw = img.naturalWidth || 1024
      const nh = img.naturalHeight || 1024
      // 初始缩放：让图片在画布中占据合理尺寸（最大边占画布对应边的 60%）
      const fitScale = Math.min(cw / nw, ch / nh) * 0.6
      const scale = Math.max(0.1, fitScale)
      const displayW = nw * scale
      const displayH = nh * scale

      setCanvasImages(prev => {
        const baseX = (cw - displayW) / 2
        const baseY = (ch - displayH) / 2
        if (effectiveMode === 'single') {
          return [{
            id: `cv-${++canvasIdCounter.current}`,
            url,
            x: baseX,
            y: baseY,
            scale,
            naturalWidth: nw,
            naturalHeight: nh,
          }]
        }
        // multi 模式：检查是否已存在相同 URL 的图片
        if (prev.some(img => img.url === url)) {
          return prev  // 已存在，不重复添加
        }
        // 不存在，追加新图片（轻微错位叠放）
        const offset = prev.length * 24
        return [...prev, {
          id: `cv-${++canvasIdCounter.current}`,
          url,
          x: baseX + offset,
          y: baseY + offset,
          scale,
          naturalWidth: nw,
          naturalHeight: nh,
        }]
      })
    }
    img.onerror = () => {
      toast.error('图片加载失败')
    }
    img.src = url
  }, [canvasMode])

  // 点击历史记录图片：切换选中状态，同步到画布
  const handleHistoryClick = useCallback((url: string) => {
    const shouldSelect = !selectedHistoryImages.has(url)
    setSelectedHistoryImages(prev => {
      const newSet = new Set(prev)
      if (newSet.has(url)) {
        newSet.delete(url)
      } else {
        if (canvasMode === 'single') {
          newSet.clear()
          newSet.add(url)
        } else {
          newSet.add(url)
        }
      }
      return newSet
    })
    if (shouldSelect) {
      addImageToCanvas(url, canvasMode === 'single' ? 'single' : 'multi')
    } else {
      setCanvasImages(prev => prev.filter(img => img.url !== url))
    }
  }, [canvasMode, addImageToCanvas, selectedHistoryImages])

  // 重置画布视图：清空画布、清空选中、重置缩放
  const handleResetCanvas = useCallback(() => {
    // 清空画布中的所有图片
    setCanvasImages([])
    // 清空选中状态
    setSelectedHistoryImages(new Set())
    // 重置视图比例为 100%
    setCanvasZoom(100)
  }, [])

  // 从画布删除图片
  const handleCanvasDelete = useCallback((id: string) => {
    setCanvasImages(prev => {
      const img = prev.find(i => i.id === id)
      if (img) {
        // 同时从选中状态中移除
        setSelectedHistoryImages(prevSet => {
          const newSet = new Set(prevSet)
          newSet.delete(img.url)
          return newSet
        })
      }
      return prev.filter(i => i.id !== id)
    })
  }, [])

  // 切换画布模式
  const handleCanvasModeToggle = useCallback(() => {
    setCanvasMode(prev => {
      const newMode = prev === 'single' ? 'multi' : 'single'
      // 切换到单图模式时，清空画布和选中状态
      if (newMode === 'single') {
        setCanvasImages([])
        setSelectedHistoryImages(new Set())
      }
      return newMode
    })
  }, [])

  // 画布图片拖动
  const handleImagePointerDown = useCallback((e: React.PointerEvent, img: CanvasImage) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    if (target.closest('[data-canvas-action]')) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragStateRef.current = {
      type: 'drag',
      id: img.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startImgX: img.x,
      startImgY: img.y,
    }
  }, [])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    const ds = dragStateRef.current
    if (!ds.type || !ds.id) return
    if (ds.type === 'drag') {
      const dx = e.clientX - ds.startClientX
      const dy = e.clientY - ds.startClientY
      setCanvasImages(prev => prev.map(im =>
        im.id === ds.id ? { ...im, x: ds.startImgX + dx, y: ds.startImgY + dy } : im
      ))
    }
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const ds = dragStateRef.current
    if (ds.id) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
    }
    dragStateRef.current = { ...ds, type: null, id: null }
  }, [])

  // 画布滚轮缩放
  const handleCanvasWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const delta = -e.deltaY
    const zoomStep = delta > 0 ? 10 : -10
    setCanvasZoom(prev => {
      const newZoom = Math.max(10, Math.min(500, prev + zoomStep))
      const zoomRatio = newZoom / prev
      
      // 调整所有图片的缩放
      setCanvasImages(prevImages => prevImages.map(img => {
        const newScale = img.scale * zoomRatio
        // 以画布中心为缩放中心
        const container = canvasContainerRef.current
        const cw = container?.clientWidth || 600
        const ch = container?.clientHeight || 400
        const centerX = cw / 2
        const centerY = ch / 2
        const imgCenterX = img.x + (img.naturalWidth * img.scale) / 2
        const imgCenterY = img.y + (img.naturalHeight * img.scale) / 2
        const offsetX = imgCenterX - centerX
        const offsetY = imgCenterY - centerY
        const newX = centerX + offsetX * zoomRatio - (img.naturalWidth * newScale) / 2
        const newY = centerY + offsetY * zoomRatio - (img.naturalHeight * newScale) / 2
        
        return { ...img, scale: newScale, x: newX, y: newY }
      }))
      
      return newZoom
    })
  }, [])

  // 画布区域拖动
  const handleCanvasPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    // 只有点击画布本身（不是图片）才能拖动画布
    if (target.closest('[data-canvas-image]')) return
    
    e.preventDefault()
    panStateRef.current = {
      isPanning: true,
      startX: e.clientX,
      startY: e.clientY,
      startPanX: panOffset.x,
      startPanY: panOffset.y,
    }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }, [panOffset])

  const handleCanvasPointerMove = useCallback((e: React.PointerEvent) => {
    if (panStateRef.current.isPanning) {
      const dx = e.clientX - panStateRef.current.startX
      const dy = e.clientY - panStateRef.current.startY
      setPanOffset({
        x: panStateRef.current.startPanX + dx,
        y: panStateRef.current.startPanY + dy,
      })
    }
  }, [])

  const handleCanvasPointerUp = useCallback((e: React.PointerEvent) => {
    if (panStateRef.current.isPanning) {
      panStateRef.current.isPanning = false
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
    }
  }, [])

  // 图片缩放拖动开始
  const handleScalePointerDown = useCallback((e: React.PointerEvent, img: CanvasImage) => {
    e.stopPropagation()
    e.preventDefault()
    
    scaleStateRef.current = {
      isScaling: true,
      imageId: img.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startScale: img.scale,
      centerX: 0, // 不再需要
      centerY: 0, // 不再需要
    }
    
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    } catch {}
  }, [])

  // 图片缩放拖动中（垂直拖动）
  const handleScalePointerMove = useCallback((e: React.PointerEvent) => {
    if (!scaleStateRef.current.isScaling || !scaleStateRef.current.imageId) return
    
    const { startClientY, startScale, imageId } = scaleStateRef.current
    
    // 计算垂直方向的移动距离（向上为负，向下为正）
    const deltaY = e.clientY - startClientY
    
    // 向上拖动（deltaY < 0）放大，向下拖动（deltaY > 0）缩小
    // 每移动 80px 改变 1 倍缩放
    const scaleDelta = -deltaY / 80
    const newScale = Math.max(0.1, Math.min(5, startScale + scaleDelta))
    
    setCanvasImages(prev => prev.map(img => 
      img.id === imageId ? { ...img, scale: newScale } : img
    ))
  }, [])

  // 图片缩放拖动结束
  const handleScalePointerUp = useCallback((e: React.PointerEvent) => {
    if (scaleStateRef.current.isScaling) {
      scaleStateRef.current = {
        isScaling: false,
        imageId: null,
        startClientX: 0,
        startClientY: 0,
        startScale: 1,
        centerX: 0,
        centerY: 0,
      }
      try {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
      } catch {}
    }
  }, [])

  useEffect(() => {
    const now = Date.now()
    const completed = tasks.filter(t => t.status === 'completed' && t.result_images && t.result_images.length > 0)
    const images: HistoryImage[] = completed.flatMap(t =>
      (t.result_images || []).map(url => ({
        url,
        taskId: t.id,
        subTemplateName: t.template_info?.sub_template_name,
        timestamp: t.completedAt || now,
        prompt: t.prompt,
        modelName: t.model_name,
        imageSize: t.image_size,
        startedAt: t.started_at,
        completedAt: t.completed_at,
        createdAt: t.created_at,
      }))
    )
    setHistoryImages(images)
    if (!historyInitializedRef.current) {
      historyInitializedRef.current = true
      prevImageCount.current = images.length
      return
    }
    const autoCanvasTaskIds = autoCanvasTaskIdsRef.current
    const newAutoImages = images
      .filter(img => autoCanvasTaskIds.has(img.taskId))
      .sort((a, b) => b.timestamp - a.timestamp)
    if (newAutoImages.length > 0) {
      const newImg = newAutoImages[0]
      setSelectedHistoryImages(prev => {
        const newSet = new Set(prev)
        if (canvasMode === 'single') {
          newSet.clear()
        }
        newSet.add(newImg.url)
        return newSet
      })
      addImageToCanvas(newImg.url)
      autoCanvasTaskIds.delete(newImg.taskId)
      setRecordPage(0)
    }
    prevImageCount.current = images.length

  }, [tasks, addImageToCanvas, canvasMode])

  // 画布为空时自动重置视图比例为 100%
  useEffect(() => {
    if (canvasImages.length === 0) {
      setCanvasZoom(100)
    }
  }, [canvasImages])

  const normalizeSubTemplate = (item: ProductSubTemplate, template: ProductMainTemplate): ProductSubTemplate => ({
    ...item,
    main_template_id: item.main_template_id || template.id,
    main_template_name: item.main_template_name || template.name,
    fixed_reference_images: parseJsonArray(item.fixed_reference_images),
  })

  const loadTemplateGroups = async () => {
    const res = await apiFetch('/api/product/template-groups')
    const data = await safeResponseJson(res)
    if (!res.ok) throw new Error((data.error as string) || '加载模板分组失败')
    const groups = getArrayData<ProductTemplateGroup>(data)
    setTemplateGroups(groups)
    if (!newTemplateGroupId && groups.length > 0) setNewTemplateGroupId(String(groups[0].id))
    return groups
  }

  const loadTemplates = async () => {
    if (templates.length > 0 || loadingTemplates) return
    setLoadingTemplates(true)
    try {
      const [groupResult, templateResult] = await Promise.all([
        apiFetch('/api/product/template-groups'),
        apiFetch('/api/product/templates'),
      ])
      const groupData = await safeResponseJson(groupResult)
      if (!groupResult.ok) throw new Error((groupData.error as string) || '加载模板分组失败')
      const groups = getArrayData<ProductTemplateGroup>(groupData)
      setTemplateGroups(groups)
      if (!newTemplateGroupId && groups.length > 0) setNewTemplateGroupId(String(groups[0].id))
      const res = templateResult
      const data = await safeResponseJson(res)
      if (!res.ok) throw new Error((data.error as string) || '加载模板失败')
      const templateList = getArrayData<ProductMainTemplate>(data)
      setTemplates(templateList)
      if (!selectedTemplateId && templateList.length > 0) {
        await selectTemplate(templateList[0].id, templateList)
      }
    } catch (error: any) {
      toast.error(error.message || '加载模板失败')
    } finally {
      setLoadingTemplates(false)
    }
  }

  const reloadTemplates = async () => {
    setLoadingTemplates(true)
    try {
      const [groups, res] = await Promise.all([
        loadTemplateGroups(),
        apiFetch('/api/product/templates'),
      ])
      const data = await safeResponseJson(res)
      if (!res.ok) throw new Error((data.error as string) || '加载模板失败')
      const templateList = getArrayData<ProductMainTemplate>(data)
      if (!newTemplateGroupId && groups.length > 0) setNewTemplateGroupId(String(groups[0].id))
      setTemplates(templateList)
      return templateList
    } finally {
      setLoadingTemplates(false)
    }
  }

  const fetchTemplateDetail = async (templateId: number, templateList = templates) => {
    const cached = loadedTemplateDetails[templateId]
    if (cached) return cached
    const res = await apiFetch(`/api/product/templates/${templateId}`)
    const data = await safeResponseJson(res)
    if (!res.ok) throw new Error((data.error as string) || '加载模板详情失败')
    const detail = data as unknown as ProductMainTemplate
    const baseTemplate = templateList.find(item => item.id === templateId) || detail
    const normalized: ProductMainTemplate = {
      ...baseTemplate,
      ...detail,
      sub_templates: Array.isArray(detail.sub_templates)
        ? detail.sub_templates.map(item => normalizeSubTemplate(item, { ...baseTemplate, ...detail }))
        : [],
    }
    setLoadedTemplateDetails(prev => ({ ...prev, [templateId]: normalized }))
    return normalized
  }

  const selectTemplate = async (templateId: number, templateList = templates) => {
    setSelectedTemplateId(templateId)
    try {
      await fetchTemplateDetail(templateId, templateList)
    } catch (error: any) {
      toast.error(error.message || '加载模板详情失败')
    }
  }

  const handleCreateSubTemplateClick = () => {
    if (!selectedTemplateId) { toast.error('请先选择一个主模板'); return }
    setEditingSubTemplate(null)
    setNewSubTemplateName('')
    setNewSubTemplatePrompt('')
    setNewSubTemplatePreviewImageUrl(null)
    setNewSubTemplateSortOrder(String(currentSubTemplates.length))
    setShowCreateSubTemplateDialog(true)
  }

  const handleEditSubTemplateClick = (subTemplate: ProductSubTemplate) => {
    setEditingSubTemplate(subTemplate)
    setNewSubTemplateName(subTemplate.name)
    setNewSubTemplatePrompt(subTemplate.fixed_prompt)
    setNewSubTemplatePreviewImageUrl(subTemplate.preview_image_url || getSubTemplatePreviewImage(subTemplate))
    setNewSubTemplateSortOrder(String(subTemplate.sort_order ?? 0))
    setShowCreateSubTemplateDialog(true)
  }

  const handleCancelCreateSubTemplate = () => {
    setNewSubTemplateName('')
    setNewSubTemplatePrompt('')
    setNewSubTemplatePreviewImageUrl(null)
    setNewSubTemplateSortOrder('0')
    setEditingSubTemplate(null)
    setUploadingSubTemplatePreview(false)
    setSubTemplatePreviewUploadProgress(0)
    setShowCreateSubTemplateDialog(false)
  }

  const updateSubTemplateInState = (subTemplate: ProductSubTemplate) => {
    setLoadedTemplateDetails(prev => {
      const template = prev[subTemplate.main_template_id]
      if (!template) return prev
      return {
        ...prev,
        [subTemplate.main_template_id]: {
          ...template,
          sub_templates: (template.sub_templates || []).map(item => item.id === subTemplate.id ? subTemplate : item),
        },
      }
    })
    setAppliedTemplateSubTemplates(prev => prev.map(item => item.id === subTemplate.id ? subTemplate : item))
    setAppliedTemplatePrompts(prev => prev[subTemplate.id] === undefined ? prev : { ...prev, [subTemplate.id]: prev[subTemplate.id] })
  }

  const removeSubTemplateFromState = (subTemplate: ProductSubTemplate) => {
    setLoadedTemplateDetails(prev => {
      const template = prev[subTemplate.main_template_id]
      if (!template) return prev
      const nextSubTemplates = (template.sub_templates || []).filter(item => item.id !== subTemplate.id)
      return {
        ...prev,
        [subTemplate.main_template_id]: {
          ...template,
          sub_template_count: Math.max((template.sub_template_count || template.sub_templates?.length || 1) - 1, 0),
          sub_templates: nextSubTemplates,
        },
      }
    })
    setTemplates(prev => prev.map(item => item.id === subTemplate.main_template_id ? { ...item, sub_template_count: Math.max((item.sub_template_count || 1) - 1, 0) } : item))
    setTemplateSelectedSubTemplateIds(prev => {
      const next = new Set(prev)
      next.delete(subTemplate.id)
      return next
    })
    setAppliedTemplateSubTemplates(prev => prev.filter(item => item.id !== subTemplate.id))
    setAppliedTemplatePrompts(prev => {
      const next = { ...prev }
      delete next[subTemplate.id]
      return next
    })
    setActiveAppliedTemplateIndex(prev => Math.max(prev - 1, 0))
  }

  const handleTemplateDialogOpenChange = (open: boolean) => {
    setShowTemplateDialog(open)
    if (open) void loadTemplates()
  }

  const selectedSubTemplates = useMemo(() => {
    const selectedIds = templateSelectedSubTemplateIds
    return Object.values(loadedTemplateDetails)
      .flatMap(template => template.sub_templates || [])
      .filter(item => selectedIds.has(item.id))
      .sort((a, b) => a.id - b.id)
  }, [loadedTemplateDetails, templateSelectedSubTemplateIds])

  const getAllSelectedTemplateSubTemplates = () => {
    return selectedSubTemplates
  }

  useEffect(() => {
    if (!showTemplateDialog || templates.length === 0 || templateSelectedSubTemplateIds.size === 0) return
    if (selectedSubTemplates.length === templateSelectedSubTemplateIds.size) return
    const missingTemplateIds = templates
      .filter(template => !loadedTemplateDetails[template.id])
      .map(template => template.id)

    if (missingTemplateIds.length === 0) return

    void Promise.allSettled(missingTemplateIds.map(templateId => fetchTemplateDetail(templateId, templates)))
  }, [loadedTemplateDetails, selectedSubTemplates, showTemplateDialog, templateSelectedSubTemplateIds, templates])

  const handleToggleSubTemplate = (subTemplate: ProductSubTemplate, checked: boolean) => {
    setTemplateSelectedSubTemplateIds(prev => {
      const next = new Set(prev)
      if (checked) next.add(subTemplate.id)
      else next.delete(subTemplate.id)
      return next
    })
  }

  const applySubTemplates = (selected: ProductSubTemplate[], successMessage: string) => {
    if (selected.length === 0) { toast.error('请至少选择一个小模板'); return }
    setAppliedTemplateSubTemplates(selected)
    setAppliedTemplatePrompts(Object.fromEntries(selected.map(item => [item.id, item.fixed_prompt || ''])))
    setActiveAppliedTemplateIndex(0)
    setCount(selected.length)
    setShowTemplateDialog(false)
    toast.success(successMessage)
  }

  const handleApplyTemplateSelection = () => {
    applySubTemplates(getAllSelectedTemplateSubTemplates(), `已应用 ${templateSelectedSubTemplateIds.size} 个小模板`)
  }

  const handleApplyCurrentTemplate = () => {
    if (!currentTemplate) { toast.error('请先选择一个主模板'); return }
    if (currentSubTemplates.length === 0) { toast.error('当前大模板暂无小模板'); return }
    setTemplateSelectedSubTemplateIds(new Set(currentSubTemplates.map(item => item.id)))
    applySubTemplates(currentSubTemplates, `已应用大模板“${currentTemplate.name}”下的 ${currentSubTemplates.length} 个小模板`)
  }

  const resetTemplateForm = () => {
    setNewTemplateName('')
    setNewTemplateDescription('')
    setNewTemplateVisibility('private')
    setNewTemplateGroupMode('existing')
    setNewTemplateGroupName('')
    setNewTemplateGroupColor('slate')
    setEditingTemplate(null)
  }

  const handleCreateTemplateClick = () => {
    resetTemplateForm()
    setShowCreateTemplateDialog(true)
  }

  const handleEditTemplateClick = () => {
    if (!currentTemplate) { toast.error('请先选择一个主模板'); return }
    setEditingTemplate(currentTemplate)
    setNewTemplateName(currentTemplate.name)
    setNewTemplateDescription(currentTemplate.description || '')
    setNewTemplateVisibility(currentTemplate.visibility || 'private')
    setNewTemplateGroupMode('existing')
    setNewTemplateGroupId(currentTemplate.group_id ? String(currentTemplate.group_id) : newTemplateGroupId)
    setNewTemplateGroupName('')
    setNewTemplateGroupColor('slate')
    setShowCreateTemplateDialog(true)
  }

  const handleSaveTemplate = async () => {
    const name = newTemplateName.trim()
    if (!name) { toast.error('请输入模板名称'); return }
    let groupId = newTemplateGroupMode === 'existing' ? Number(newTemplateGroupId) : 0
    const groupName = newTemplateGroupName.trim()
    if (newTemplateGroupMode === 'existing' && (!Number.isInteger(groupId) || groupId <= 0)) { toast.error('请选择模板分组'); return }
    if (newTemplateGroupMode === 'new' && !groupName) { toast.error('请输入分组名称'); return }
    setCreatingTemplate(true)
    try {
      if (newTemplateGroupMode === 'new') {
        const groupRes = await apiFetch('/api/product/template-groups', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: groupName, badge_color: newTemplateGroupColor }),
        })
        const groupData = await safeResponseJson(groupRes)
        if (!groupRes.ok) throw new Error((groupData.error as string) || '创建分组失败')
        const group = groupData as unknown as ProductTemplateGroup
        setTemplateGroups(prev => [...prev, group])
        setNewTemplateGroupId(String(group.id))
        groupId = group.id
      }
      const res = await apiFetch(editingTemplate ? `/api/product/templates/${editingTemplate.id}` : '/api/product/templates', {
        method: editingTemplate ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          description: newTemplateDescription.trim(),
          visibility: newTemplateVisibility,
          group_id: groupId,
        }),
      })
      const data = await safeResponseJson(res)
      if (!res.ok) throw new Error((data.error as string) || (editingTemplate ? '修改模板失败' : '创建模板失败'))
      const savedRaw = data as unknown as ProductMainTemplate
      const wasEditing = Boolean(editingTemplate)
      const previousDetail = editingTemplate ? loadedTemplateDetails[editingTemplate.id] : undefined
      const saved: ProductMainTemplate = {
        ...savedRaw,
        sub_templates: previousDetail?.sub_templates || [],
      }
      resetTemplateForm()
      const templateList = await reloadTemplates()
      setLoadedTemplateDetails(prev => ({ ...prev, [saved.id]: saved }))
      await selectTemplate(saved.id, templateList)
      setShowCreateTemplateDialog(false)
      toast.success(wasEditing ? '模板修改成功' : '模板创建成功')
    } catch (error: any) {
      toast.error(error.message || (editingTemplate ? '修改模板失败' : '创建模板失败'))
    } finally {
      setCreatingTemplate(false)
    }
  }

  const handleDeleteTemplate = async () => {
    if (!deletingTemplate) return
    try {
      const res = await apiFetch(`/api/product/templates/${deletingTemplate.id}`, { method: 'DELETE' })
      const data = await safeResponseJson(res)
      if (!res.ok) throw new Error((data.error as string) || '删除模板失败')
      setTemplates(prev => prev.filter(item => item.id !== deletingTemplate.id))
      setLoadedTemplateDetails(prev => {
        const next = { ...prev }
        delete next[deletingTemplate.id]
        return next
      })
      const deletedSubTemplates = loadedTemplateDetails[deletingTemplate.id]?.sub_templates || deletingTemplate.sub_templates || []
      setTemplateSelectedSubTemplateIds(prev => {
        const deletedIds = new Set(deletedSubTemplates.map(item => item.id))
        const next = new Set(prev)
        deletedIds.forEach(id => next.delete(id))
        return next
      })
      setAppliedTemplateSubTemplates(prev => prev.filter(item => item.main_template_id !== deletingTemplate.id))
      setAppliedTemplatePrompts(prev => {
        const next = { ...prev }
        deletedSubTemplates.forEach(item => delete next[item.id])
        return next
      })
      setActiveAppliedTemplateIndex(0)
      setSelectedTemplateId(prev => prev === deletingTemplate.id ? null : prev)
      setDeletingTemplate(null)
      toast.success('模板已删除')
    } catch (error: any) {
      toast.error(error.message || '删除模板失败')
    }
  }

  const handleSaveSubTemplate = async () => {
    if (!selectedTemplateId || !currentTemplate) { toast.error('请先选择一个主模板'); return }
    const name = newSubTemplateName.trim()
    const fixedPrompt = newSubTemplatePrompt.trim()
    const sortOrder = Number(newSubTemplateSortOrder)
    if (!name) { toast.error('请输入小模板名称'); return }
    if (!fixedPrompt) { toast.error('请输入固定提示词'); return }
    if (!Number.isFinite(sortOrder)) { toast.error('请输入有效排序'); return }
    setCreatingSubTemplate(true)
    try {
      const body = {
        name,
        fixed_prompt: fixedPrompt,
        fixed_reference_images: [],
        preview_image_url: newSubTemplatePreviewImageUrl,
        sort_order: sortOrder,
      }
      const res = await apiFetch(editingSubTemplate ? `/api/product/sub-templates/${editingSubTemplate.id}` : `/api/product/templates/${selectedTemplateId}/sub`, {
        method: editingSubTemplate ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await safeResponseJson(res)
      if (!res.ok) throw new Error((data.error as string) || (editingSubTemplate ? '修改小模板失败' : '创建小模板失败'))
      const saved = normalizeSubTemplate(data as unknown as ProductSubTemplate, currentTemplate)
      if (editingSubTemplate) {
        updateSubTemplateInState(saved)
        handleCancelCreateSubTemplate()
        toast.success('小模板修改成功')
        return
      }
      const nextTemplate: ProductMainTemplate = {
        ...currentTemplate,
        sub_template_count: (currentTemplate.sub_template_count || currentSubTemplates.length) + 1,
        sub_templates: [...currentSubTemplates, saved],
      }
      setLoadedTemplateDetails(prev => ({ ...prev, [selectedTemplateId]: nextTemplate }))
      setTemplates(prev => prev.map(item => item.id === selectedTemplateId ? { ...item, sub_template_count: nextTemplate.sub_template_count } : item))
      handleCancelCreateSubTemplate()
      toast.success('小模板创建成功')
    } catch (error: any) {
      toast.error(error.message || (editingSubTemplate ? '修改小模板失败' : '创建小模板失败'))
    } finally {
      setCreatingSubTemplate(false)
    }
  }

  const handleSubTemplatePreviewUpload = async (files: FileList) => {
    const file = files.item(0)
    if (!file) return
    setUploadingSubTemplatePreview(true)
    setSubTemplatePreviewUploadProgress(0)
    try {
      const [url] = await uploadReferenceImages([file], {
        onProgress: (progress) => setSubTemplatePreviewUploadProgress(progress.percent),
      })
      setNewSubTemplatePreviewImageUrl(url)
      toast.success('预览图上传成功')
    } catch (error: any) {
      toast.error(error.message || '预览图上传失败')
    } finally {
      setUploadingSubTemplatePreview(false)
    }
  }

  const handleDeleteSubTemplate = async () => {
    if (!deletingSubTemplate) return
    try {
      const res = await apiFetch(`/api/product/sub-templates/${deletingSubTemplate.id}`, { method: 'DELETE' })
      const data = await safeResponseJson(res)
      if (!res.ok) throw new Error((data.error as string) || '删除小模板失败')
      removeSubTemplateFromState(deletingSubTemplate)
      setDeletingSubTemplate(null)
      toast.success('小模板已删除')
    } catch (error: any) {
      toast.error(error.message || '删除小模板失败')
    }
  }

  const handleImageUpload = async (files: FileList) => {
    if (!selectedModel) return
    const maxImages = selectedModel.max_reference_images - referenceImages.length
    if (files.length > maxImages) {
      toast.error(`最多只能上传 ${selectedModel.max_reference_images} 张参考图`)
      return
    }
    const fileList = Array.from(files).slice(0, maxImages)
    const uploadingItems = fileList.map((file, index) => buildUploadingReferenceItem(file, index))
    setUploadingReference(true)
    setReferenceImages(prev => [...prev, ...uploadingItems])
    try {
      const uploadedUrls = await uploadReferenceImages(fileList, {
        onProgress: (progress) => {
          setReferenceImages(prev => prev.map((item) => {
            if (item.status !== 'uploading') return item
            if (item.name !== progress.currentFileName) return item
            return { ...item, progress: progress.percent }
          }))
        },
      })
      setReferenceImages(prev => {
        const next = [...prev]
        uploadedUrls.forEach((url, index) => {
          const uploadItem = uploadingItems[index]
          const itemIndex = next.findIndex(item => item.id === uploadItem.id)
          if (itemIndex !== -1) {
            next[itemIndex] = {
              ...next[itemIndex],
              url,
              status: 'done',
              progress: 100,
            }
          }
        })
        return next
      })
      toast.success(`已上传 ${uploadedUrls.length} 张参考图`)
    } catch (error: any) {
      setReferenceImages(prev => prev.filter(item => !uploadingItems.some(uploadingItem => uploadingItem.id === item.id)))
      toast.error(error.message || '参考图上传失败')
    } finally {
      setUploadingReference(false)
    }
  }

  const handleRemoveImage = (index: number) => {
    setReferenceImages(referenceImages.filter((_, i) => i !== index))
  }

  const handleGenerate = async () => {
    if (!selectedModelId) { toast.error('请选择模型'); return }
    if (uploadedReferenceImages.length === 0) { toast.error('请至少上传一张参考图'); return }

    const runGenerate = async (genMode: 'single' | 'template', body: Record<string, unknown>, genCost: number) => {
      if (userCredits < genCost) { toast.error('创作积分不足'); return }
      setGenerating(true)
      try {
        const res = await apiFetch('/api/product/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: genMode, model_id: selectedModelId, ...body })
        })
        const data = await safeResponseJson(res)
        if (!res.ok) throw new Error((data.error as string) || '生成失败')
        const taskIds: number[] = Array.isArray(data.task_ids) ? data.task_ids as number[] : []
        if (taskIds.length === 0) throw new Error('未创建生成任务')
        taskIds.forEach(id => autoCanvasTaskIdsRef.current.add(id))
        toast.success(`已创建 ${taskIds.length} 个生成任务`)
        setUserCredits(userCredits - genCost)
        localStorage.setItem('userCreativeCredits', String(userCredits - genCost))
        pollTasks(taskIds)
      } catch (error: any) {
        toast.error(error.message || '生成失败')
      } finally {
        setGenerating(false)
      }
    }

    const referenceUrls = uploadedReferenceImages.map(item => item.url).filter((url): url is string => Boolean(url))
    if (hasAppliedTemplates) {
      const emptyIndex = appliedTemplateSubTemplates.findIndex(item => !(appliedTemplatePrompts[item.id] ?? item.fixed_prompt ?? '').trim())
      if (emptyIndex !== -1) {
        setActiveAppliedTemplateIndex(emptyIndex)
        toast.error('请补全当前小模板提示词')
        return
      }
      await runGenerate('template', {
        reference_images: referenceUrls,
        template_sub_templates: appliedTemplateSubTemplates.map(item => ({
          main_template_id: item.main_template_id,
          sub_template_id: item.id,
        })),
        template_prompt_overrides: appliedTemplateSubTemplates.map(item => ({
          main_template_id: item.main_template_id,
          sub_template_id: item.id,
          prompt: appliedTemplatePrompts[item.id] ?? item.fixed_prompt ?? '',
        })),
        size,
        count: appliedTemplateSubTemplates.length
      }, (selectedModel?.cost_per_image || 0) * appliedTemplateSubTemplates.length)
      return
    }
    if (!prompt.trim()) { toast.error('请输入文案'); return }
    await runGenerate('single', {
      reference_images: referenceUrls,
      prompt,
      size,
      count
    }, singleCost)
  }

  const pollTasks = async (taskIds: number[], options?: { appendInitialTasks?: boolean }) => {
    if (options?.appendInitialTasks !== false) {
      const initialTasks: GenerationTask[] = taskIds.map(id => ({ id, status: 'pending' }))
      setTasks(prev => [...prev, ...initialTasks])
    }

    const interval = setInterval(async () => {
      try {
        const res = await apiFetch(`/api/tasks?ids=${taskIds.join(',')}`)
        const data = await safeResponseJson(res)
        const tasksList: GenerationTask[] = Array.isArray(data.tasks) ? data.tasks as GenerationTask[] : []
        if (tasksList.length === 0) return

        setTasks(prev => {
          const updated = [...prev]
          tasksList.forEach((t: GenerationTask) => {
            const idx = updated.findIndex(u => u.id === t.id)
            if (idx !== -1) {
              const wasPending = isRunningTaskStatus(updated[idx].status)
              const isNowDone = t.status === 'completed' || t.status === 'failed'
              updated[idx] = {
                ...t,
                completedAt: wasPending && isNowDone && t.status === 'completed' ? Date.now() : updated[idx].completedAt
              }
            }
          })
          return updated
        })
        const allDone = tasksList.every((t: GenerationTask) =>
          t.status === 'completed' || t.status === 'failed'
        )
        if (allDone) {
          clearInterval(interval)
          clearTimeout(timeout)
          pollCleanupFns.current.delete(cleanup)
        }
      } catch (error) {
        console.error('轮询任务状态失败:', error)
      }
    }, 2000)
    const timeout = setTimeout(() => {
      clearInterval(interval)
      pollCleanupFns.current.delete(cleanup)
    }, 300000)

    // 返回清理函数
    const cleanup = () => {
      clearInterval(interval)
      clearTimeout(timeout)
    }

    pollCleanupFns.current.add(cleanup)
    return cleanup
  }

  const canGenerate = uploadedReferenceImages.length > 0 && (hasAppliedTemplates ? appliedTemplateSubTemplates.every(item => (appliedTemplatePrompts[item.id] ?? item.fixed_prompt ?? '').trim().length > 0) : prompt.trim().length > 0)
  const filteredTemplates = templates.filter(item => {
    const keyword = templateSearch.trim().toLowerCase()
    const matchesKeyword = !keyword || item.name.toLowerCase().includes(keyword) || (item.description || '').toLowerCase().includes(keyword)
    const matchesGroup = templateGroupFilter === 'all' || String(item.group_id || '') === templateGroupFilter
    return matchesKeyword && matchesGroup
  })
  const displayTemplates = filteredTemplates.map(item => loadedTemplateDetails[item.id] ? { ...item, ...loadedTemplateDetails[item.id] } : item)
  const canCreateTemplate = newTemplateName.trim().length > 0 && (newTemplateGroupMode === 'new' ? newTemplateGroupName.trim().length > 0 : newTemplateGroupId.length > 0)
  const currentTemplate = selectedTemplateId ? loadedTemplateDetails[selectedTemplateId] || templates.find(item => item.id === selectedTemplateId) : null
  const currentSubTemplates = currentTemplate?.sub_templates || []
  const selectedTemplateCount = Array.from(new Set(selectedSubTemplates.map(item => item.main_template_id))).length

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (models.length === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background">
        <HugeiconsIcon icon={CubeIcon} size={40} strokeWidth={1.5} className="text-muted-foreground/50" />
        <p className="text-sm text-muted-foreground">暂无可用的商品主图生成模型</p>
        <p className="text-xs text-muted-foreground/70">请联系管理员配置模型</p>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col bg-background overflow-y-auto">
      {/* 顶部栏 */}
      <header className="border-b border-border bg-background px-4 py-2.5">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-sm font-semibold tracking-tight text-foreground">商品主图</h1>

          <div className="flex items-center gap-3">
            <Dialog open={showTemplateDialog} onOpenChange={handleTemplateDialogOpenChange}>
              <DialogTrigger
                render={
                  <Button variant="outline" size="sm">
                    <HugeiconsIcon icon={FolderKanbanIcon} size={14} strokeWidth={1.7} className="mr-1.5" />
                    模板
                  </Button>
                }
              />
              <DialogContent className="flex h-[min(86vh,820px)] !w-[min(96vw,1280px)] !max-w-none flex-col gap-0 overflow-hidden border border-border p-0 shadow-xl sm:!max-w-[min(96vw,1280px)]">
                <DialogHeader className="border-b border-border px-5 py-4 pr-12">
                  <DialogTitle className="text-lg">模板管理</DialogTitle>
                </DialogHeader>
                <TemplateManagementContent
                  templates={displayTemplates}
                  templateGroups={templateGroups}
                  currentTemplate={currentTemplate}
                  currentSubTemplates={currentSubTemplates}
                  selectedSubTemplates={selectedSubTemplates}
                  loading={loadingTemplates}
                  search={templateSearch}
                  groupFilter={templateGroupFilter}
                  selectedTemplateId={selectedTemplateId}
                  templateSelectedSubTemplateIds={templateSelectedSubTemplateIds}
                  selectedSubTemplateCount={templateSelectedSubTemplateIds.size}
                  selectedTemplateCount={selectedTemplateCount}
                  onSearchChange={setTemplateSearch}
                  onGroupFilterChange={setTemplateGroupFilter}
                  onSelectTemplate={(id) => void selectTemplate(id)}
                  onCreateTemplateClick={handleCreateTemplateClick}
                  onCreateSubTemplateClick={handleCreateSubTemplateClick}
                  onApplyCurrentTemplate={handleApplyCurrentTemplate}
                  onEditTemplate={handleEditTemplateClick}
                  onDeleteTemplate={setDeletingTemplate}
                  onEditSubTemplate={handleEditSubTemplateClick}
                  onDeleteSubTemplate={setDeletingSubTemplate}
                  onToggleSubTemplate={handleToggleSubTemplate}
                  onApply={handleApplyTemplateSelection}
                />
              </DialogContent>
            </Dialog>

            <Dialog open={showCreateTemplateDialog} onOpenChange={(open) => open ? setShowCreateTemplateDialog(true) : (setShowCreateTemplateDialog(false), resetTemplateForm())}>
              <DialogContent className="!w-[min(92vw,520px)] !max-w-none overflow-hidden p-0 sm:!max-w-[min(92vw,520px)]">
                <DialogHeader className="border-b border-border px-5 py-4 pr-12">
                  <DialogTitle>{editingTemplate ? '编辑模板' : '添加模板'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 p-5">
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">模板名称</Label>
                    <Input value={newTemplateName} onChange={(event) => setNewTemplateName(event.target.value)} placeholder="输入模板名称" />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">模板描述</Label>
                    <Textarea value={newTemplateDescription} onChange={(event) => setNewTemplateDescription(event.target.value)} placeholder="输入模板描述，可选" rows={4} className="resize-none" />
                  </div>
                  <div className="space-y-3 rounded-lg border border-border bg-muted/20 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <Label className="text-xs text-muted-foreground">模板分组</Label>
                      <div className="flex rounded-md border border-border bg-background p-0.5">
                        <button type="button" onClick={() => setNewTemplateGroupMode('existing')} className={cn('rounded px-2 py-1 text-xs transition', newTemplateGroupMode === 'existing' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>选择</button>
                        <button type="button" onClick={() => setNewTemplateGroupMode('new')} className={cn('rounded px-2 py-1 text-xs transition', newTemplateGroupMode === 'new' ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground')}>新建</button>
                      </div>
                    </div>
                    {newTemplateGroupMode === 'existing' ? (
                      <Select value={newTemplateGroupId} onValueChange={(value) => value && setNewTemplateGroupId(value)} items={Object.fromEntries(templateGroups.map(group => [String(group.id), group.name]))}>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="选择模板分组" />
                        </SelectTrigger>
                        <SelectContent align="start">
                          {templateGroups.map(group => (
                            <SelectItem key={group.id} value={String(group.id)}>
                              <span className={cn('inline-flex h-5 items-center rounded-md border px-2 text-[10px]', getTemplateGroupBadgeClass(group.badge_color))}>{group.name}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-[1fr_150px]">
                        <Input value={newTemplateGroupName} onChange={(event) => setNewTemplateGroupName(event.target.value)} placeholder="输入新分组名称" />
                        <Select value={newTemplateGroupColor} onValueChange={(value) => setNewTemplateGroupColor(value as TemplateGroupColor)} items={Object.fromEntries(templateGroupColorOptions.map(item => [item.value, item.label]))}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent align="start">
                            {templateGroupColorOptions.map(item => (
                              <SelectItem key={item.value} value={item.value}>
                                <span className="inline-flex items-center gap-2"><span className={cn('h-2.5 w-2.5 rounded-full', item.dotClassName)} />{item.label}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-muted-foreground">可见性</Label>
                    <Select value={newTemplateVisibility} onValueChange={(value) => setNewTemplateVisibility(value as 'private' | 'public')} items={{ private: '私有', public: '公开' }}>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="private">私有</SelectItem>
                        <SelectItem value="public">公开</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-end gap-2 border-t border-border pt-4">
                    <Button variant="outline" onClick={() => { setShowCreateTemplateDialog(false); resetTemplateForm() }} disabled={creatingTemplate}>取消</Button>
                    <Button onClick={() => void handleSaveTemplate()} disabled={creatingTemplate || !canCreateTemplate}>
                      {creatingTemplate && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingTemplate ? '保存修改' : '创建模板'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={showCreateSubTemplateDialog} onOpenChange={(open) => open ? setShowCreateSubTemplateDialog(true) : handleCancelCreateSubTemplate()}>
              <DialogContent className="!w-[min(92vw,640px)] !max-w-none overflow-hidden p-0 sm:!max-w-[min(92vw,640px)]">
                <DialogHeader className="border-b border-border px-5 py-4 pr-12">
                  <DialogTitle>{editingSubTemplate ? '修改小模板' : '添加小模板'}</DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4 p-5">
                  <div className="rounded-lg border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
                    当前主模板：{currentTemplate?.name || '未选择'}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
                    <div className="flex flex-col gap-2">
                      <Label className="text-xs text-muted-foreground">小模板名称</Label>
                      <Input value={newSubTemplateName} onChange={(event) => setNewSubTemplateName(event.target.value)} placeholder="例如：白底产品特写" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <Label className="text-xs text-muted-foreground">排序</Label>
                      <Input type="number" value={newSubTemplateSortOrder} onChange={(event) => setNewSubTemplateSortOrder(event.target.value)} placeholder="0" />
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs text-muted-foreground">效果预览图</Label>
                    <div className="grid gap-3 sm:grid-cols-[140px_1fr]">
                      <div className="aspect-square overflow-hidden rounded-lg border border-dashed border-border bg-muted/30">
                        {newSubTemplatePreviewImageUrl ? (
                          <img src={toImageSrc(newSubTemplatePreviewImageUrl, { width: 320, height: 320 })} alt="小模板效果预览" className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                            <ImagePlus className="h-5 w-5" />
                            暂无预览图
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col justify-center gap-2">
                        <p className="text-xs text-muted-foreground">仅用于小模板卡片效果展示，不参与生成参考图。</p>
                        {uploadingSubTemplatePreview && <p className="text-xs text-muted-foreground">上传中 {subTemplatePreviewUploadProgress}%</p>}
                        <div className="flex flex-wrap gap-2">
                          <Button size="sm" variant="outline" type="button" disabled={uploadingSubTemplatePreview} onClick={() => document.getElementById('sub-template-preview-upload')?.click()}>
                            {uploadingSubTemplatePreview && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            {newSubTemplatePreviewImageUrl ? '更换图片' : '上传图片'}
                          </Button>
                          {newSubTemplatePreviewImageUrl && (
                            <Button size="sm" variant="ghost" type="button" disabled={uploadingSubTemplatePreview} onClick={() => setNewSubTemplatePreviewImageUrl(null)}>移除图片</Button>
                          )}
                        </div>
                        <input id="sub-template-preview-upload" type="file" accept="image/*" className="hidden" disabled={uploadingSubTemplatePreview} onChange={(event) => {
                          if (event.target.files) void handleSubTemplatePreviewUpload(event.target.files)
                          event.target.value = ''
                        }} />
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <Label className="text-xs text-muted-foreground">固定提示词</Label>
                    <Textarea value={newSubTemplatePrompt} onChange={(event) => setNewSubTemplatePrompt(event.target.value)} placeholder="输入这个小模板固定使用的提示词" rows={6} className="resize-none" />
                  </div>
                  <div className="flex justify-end gap-2 border-t border-border pt-4">
                    <Button variant="outline" onClick={handleCancelCreateSubTemplate} disabled={creatingSubTemplate}>取消</Button>
                    <Button onClick={() => void handleSaveSubTemplate()} disabled={creatingSubTemplate || uploadingSubTemplatePreview || !newSubTemplateName.trim() || !newSubTemplatePrompt.trim()}>
                      {creatingSubTemplate && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {editingSubTemplate ? '保存修改' : '创建小模板'}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>

            <AlertDialog open={Boolean(deletingSubTemplate)} onOpenChange={(open) => !open && setDeletingSubTemplate(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>删除小模板</AlertDialogTitle>
                  <AlertDialogDescription>确定删除“{deletingSubTemplate?.name}”吗？删除后无法恢复。</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => void handleDeleteSubTemplate()}>确认删除</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            <AlertDialog open={Boolean(deletingTemplate)} onOpenChange={(open) => !open && setDeletingTemplate(null)}>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>删除大模板</AlertDialogTitle>
                  <AlertDialogDescription>确定删除“{deletingTemplate?.name}”吗？删除后该大模板下的所有小模板也会被删除，且无法恢复。</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction variant="destructive" onClick={() => void handleDeleteTemplate()}>确认删除</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </header>

      {/* 主体：左列固定窄宽 + 右列弹性，左列自然高，右列伸展匹配，整页右侧滚动 */}
      <main className="flex min-h-0 flex-1 flex-col">
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-4 p-4 lg:grid-cols-[340px_1fr] lg:items-stretch">
          {/* 左列 */}
          <div className="flex h-full min-h-0 flex-col gap-3">
            <Card size="sm" className="shrink-0">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <HugeiconsIcon icon={Upload04Icon} size={16} strokeWidth={1.7} className="text-muted-foreground" />
                  上传参考图
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <input
                  ref={uploadInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  disabled={uploadingReference || !canUploadMore}
                  onChange={(e) => e.target.files && handleImageUpload(e.target.files)}
                />

                <div className="overflow-hidden">
                  <div className="flex h-full gap-3 overflow-x-auto overflow-y-hidden pb-1 pr-1">
                  {canUploadMore && (
                    <Attachment
                      orientation="vertical"
                      size="sm"
                      className="relative flex h-[146px] w-24 shrink-0 items-center justify-center border-dashed bg-muted/20 p-2 hover:border-foreground/30 hover:bg-muted/40"
                    >
                      <ImagePlus className="h-5 w-5 text-muted-foreground" />
                      <AttachmentTrigger
                        type="button"
                        aria-label={referenceImages.length > 0 ? '继续上传参考图' : '上传参考图'}
                        disabled={uploadingReference}
                        onClick={() => uploadInputRef.current?.click()}
                      />
                    </Attachment>
                  )}
                  {referenceImages.map((img, index) => (
                    <Attachment
                      key={img.id}
                      orientation="vertical"
                      size="sm"
                      state={img.status === 'uploading' ? 'uploading' : 'done'}
                      className="group relative h-fit w-24 shrink-0 gap-2 p-2"
                    >
                      <AttachmentMedia variant="image" orientation="vertical" size="sm" className="aspect-square h-auto w-full rounded-lg bg-muted">
                        {img.status === 'uploading' || !img.url ? (
                          <Skeleton className="h-full w-full rounded-lg" />
                        ) : (
                          <img
                            src={toImageSrc(img.url, { width: 320, height: 320 })}
                            alt={img.name}
                            className="h-full w-full object-cover"
                          />
                        )}
                      </AttachmentMedia>
                      <AttachmentContent className="space-y-0.5">
                        <AttachmentTitle
                          className={cn(
                            'text-[11px]',
                            img.status === 'uploading' && 'text-foreground/80 animate-pulse'
                          )}
                          title={img.name}
                        >
                          {img.name}
                        </AttachmentTitle>
                        <AttachmentDescription className="text-[10px]">{img.status === 'uploading' ? `上传中 ${img.progress}%` : `${img.typeLabel} · ${img.sizeLabel}`}</AttachmentDescription>
                      </AttachmentContent>
                      {img.status === 'done' && (
                        <AttachmentActions className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100">
                          <AttachmentAction
                            type="button"
                            aria-label={`删除 ${img.name}`}
                            onClick={() => handleRemoveImage(index)}
                            className="bg-background/80 text-muted-foreground shadow-sm backdrop-blur hover:bg-background hover:text-foreground"
                          >
                            <X className="h-3.5 w-3.5" />
                          </AttachmentAction>
                        </AttachmentActions>
                      )}
                    </Attachment>
                  ))}
                  </div>
                </div>
                {selectedModel && (
                  <div className="flex justify-end gap-2">
                    <Badge variant="outline" className="h-5 shrink-0 border-purple-200 bg-purple-50 px-1.5 text-[10px] text-purple-700">
                      已上传 {uploadedReferenceImages.length} 张参考图
                    </Badge>
                    <Badge variant="outline" className="h-5 shrink-0 border-blue-200 bg-blue-50 px-1.5 text-[10px] text-blue-700">
                      最多 {selectedModel.max_reference_images} 张
                    </Badge>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* 输入提示词 */}
            <Card size="sm" className="flex min-h-0 flex-1 flex-col overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <HugeiconsIcon icon={File02Icon} size={16} strokeWidth={1.7} className="text-muted-foreground" />
                  输入提示词
                </CardTitle>
                {activeAppliedTemplate && (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="outline" className="h-7 max-w-32 truncate border-yellow-200 bg-yellow-50 px-2 text-[10px] text-yellow-800" title={activeAppliedTemplate.name}>
                      {activeAppliedTemplate.name}
                    </Badge>
                    <Button type="button" size="sm" variant="outline" className="h-7 w-7 rounded-md p-0" onClick={() => setActiveAppliedTemplateIndex(prev => (prev - 1 + appliedTemplateSubTemplates.length) % appliedTemplateSubTemplates.length)}>
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 w-7 rounded-md p-0" onClick={() => setActiveAppliedTemplateIndex(prev => (prev + 1) % appliedTemplateSubTemplates.length)}>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                )}
              </CardHeader>
              <CardContent className="flex min-h-0 flex-1 flex-col overflow-hidden">
                <div className="relative flex min-h-0 flex-1 flex-col">
                  <Textarea
                    value={activeAppliedTemplatePrompt}
                    onChange={(e) => {
                      const value = e.target.value.slice(0, 5000)
                      if (activeAppliedTemplate) {
                        setAppliedTemplatePrompts(prev => ({ ...prev, [activeAppliedTemplate.id]: value }))
                        return
                      }
                      setPrompt(value)
                    }}
                    placeholder={hasAppliedTemplates ? '编辑当前小模板提示词...' : '描述商品卖点、场景、光线、构图等...'}
                    rows={4}
                    className="h-full min-h-0 flex-1 resize-none overflow-y-auto text-sm"
                  />
                  <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">{hasAppliedTemplates ? `${activeAppliedTemplateIndex + 1}/${appliedTemplateSubTemplates.length} · ${activeAppliedTemplatePrompt.length}/5000` : `${prompt.length}/5000`}</span>
                </div>
                {activeAppliedTemplate && (
                  <p className="mt-2 text-[11px] text-muted-foreground">当前小模板：{activeAppliedTemplate.main_template_name ? `${activeAppliedTemplate.main_template_name} / ` : ''}{activeAppliedTemplate.name}，修改仅用于本次生成</p>
                )}
              </CardContent>
            </Card>

            {/* 生成设置 */}
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <HugeiconsIcon icon={Settings02Icon} size={16} strokeWidth={1.7} className="text-muted-foreground" />
                  生成设置
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <Label className="w-16 shrink-0 text-xs text-muted-foreground">生图模型</Label>
                    <Combobox
                      value={selectedModelId ? String(selectedModelId) : ''}
                      onValueChange={(value) => setSelectedModelId(Number(value))}
                      options={modelOptions}
                      placeholder="选择图片模型"
                      searchPlaceholder="搜索图片模型..."
                      emptyText="暂无图片模型"
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-16 shrink-0 text-xs text-muted-foreground">生图尺寸</Label>
                    <Combobox
                      value={size}
                      onValueChange={setSize}
                      options={sizeOptions}
                      placeholder={selectedModel ? '选择尺寸' : '请先选择图片模型'}
                      searchPlaceholder="搜索尺寸..."
                      emptyText="暂无尺寸"
                      disabled={!selectedModel}
                      className="flex-1"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-16 shrink-0 text-xs text-muted-foreground">生图数量</Label>
                    <Input
                      type="number"
                      min={1}
                      value={effectiveCount}
                      onChange={(e) => {
                        const value = Math.max(1, parseInt(e.target.value) || 1)
                        setCount(value)
                      }}
                      disabled={hasAppliedTemplates}
                      className="flex-1 text-sm"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleGenerate}
                  disabled={generating || uploadingReference || !canGenerate}
                  size="lg"
                  className="mt-3 w-full"
                >
                  {generating ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <HugeiconsIcon icon={StarsIcon} size={16} strokeWidth={1.7} className="mr-2" />
                  )}
                  {generating ? '生成中...' : '一键生成主图'}
                </Button>
                <p className="mt-2 text-center text-[10px] text-muted-foreground">
                  扣除 {cost} 创作积分
                  {activeCount > 0 && ` · ${activeCount} 个任务进行中`}
                </p>
              </CardContent>
            </Card>
          </div>

          {/* 右列：自由画布 + 生成记录（伸展匹配左列高度） */}
          <div className="flex min-h-0 flex-col gap-3 lg:h-full">
            {/* 1. 自由画布（占比大） */}
            <Card size="sm" className="flex min-h-[400px] min-h-0 flex-1 flex-col overflow-hidden py-0 gap-0 data-[size=sm]:py-0 data-[size=sm]:gap-0">
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">生成预览</span>
                  <span className="text-[10px] text-muted-foreground">自由画布</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCanvasModeToggle}
                    title={canvasMode === 'single' ? '当前：单图替换，点击切换为多图共存' : '当前：多图共存，点击切换为单图替换'}
                  >
                    <HugeiconsIcon icon={Layers01Icon} size={14} strokeWidth={1.7} className="mr-1.5" />
                    {canvasMode === 'single' ? '单图' : '多图'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleResetCanvas}
                    disabled={canvasImages.length === 0}
                  >
                    <HugeiconsIcon icon={Loading03Icon} size={14} strokeWidth={1.7} className="mr-1.5" />
                    重置视图
                  </Button>
                </div>
              </div>
              <div className="relative min-h-0 flex-1">
                <div className="pointer-events-none absolute right-3 top-3 z-20 rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-foreground shadow-sm">
                  {canvasZoom}%
                </div>
                <div
                  ref={canvasContainerRef}
                  className="relative h-full min-h-0 flex-1 overflow-hidden bg-muted/30"
                  style={{ backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)', backgroundSize: '16px 16px' }}
                  onWheel={handleCanvasWheel}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerCancel={handleCanvasPointerUp}
                >
                  {canvasImages.length === 0 ? (
                  (generating || pendingTasks.length > 0) ? (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-md bg-background shadow-sm">
                          <Loader2 className="h-7 w-7 animate-spin text-foreground" />
                        </div>
                        <p className="text-sm font-medium text-foreground">AI 正在生成...</p>
                        <p className="mt-1 text-xs text-muted-foreground">完成后将自动加入画布</p>
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center">
                        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-md bg-background shadow-sm">
                          <HugeiconsIcon icon={Image02Icon} size={28} strokeWidth={1.5} className="text-muted-foreground/40" />
                        </div>
                        <p className="text-sm font-medium text-muted-foreground">点击下方历史记录图片加入画布</p>
                        <p className="mt-1 text-xs text-muted-foreground">支持拖动、缩放、多图共存</p>
                      </div>
                    </div>
                  )
                ) : (
                  canvasImages.map((img) => {
                    const displayW = img.naturalWidth * img.scale
                    const displayH = img.naturalHeight * img.scale
                    const historyImg = historyImages.find(h => h.url === img.url)
                    
                    return (
                      <div
                        key={img.id}
                        data-canvas-image
                        className="group absolute touch-none select-none cursor-grab active:cursor-grabbing"
                        style={{
                          left: img.x + panOffset.x,
                          top: img.y + panOffset.y,
                          width: displayW,
                          height: displayH,
                        }}
                        onPointerDown={(e) => handleImagePointerDown(e, img)}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerCancel={handlePointerUp}
                      >
                        <img
                          src={img.url}
                          alt="画布图片"
                          draggable={false}
                          className="pointer-events-none h-full w-full rounded-sm object-contain shadow-md"
                        />
                        {/* 悬浮操作：右上角眼睛和关闭按钮 */}
                        <div className="absolute -right-2 -top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                          <button
                            type="button"
                            data-canvas-action="preview"
                            title="查看详情"
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background shadow-sm hover:bg-foreground/90"
                            onClick={(e) => {
                              e.stopPropagation()
                              setPreviewImageUrl(img.url)
                              setPreviewImageData(historyImg ? {
                                prompt: historyImg.prompt,
                                model_name: historyImg.modelName,
                                image_size: historyImg.imageSize,
                                started_at: historyImg.startedAt || null,
                                completed_at: historyImg.completedAt || null,
                                created_at: historyImg.createdAt,
                              } : null)
                              setPreviewOpen(true)
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            data-canvas-action="remove"
                            title="移除"
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background shadow-sm hover:bg-foreground/90"
                            onClick={(e) => {
                              e.stopPropagation()
                              handleCanvasDelete(img.id)
                            }}
                          >
                            <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
                          </button>
                        </div>
                        {/* 悬浮操作：右下角缩放按钮 */}
                        <div className="absolute -right-2 -bottom-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                          <button
                            type="button"
                            data-canvas-action="scale"
                            title="按住上下拖动缩放（向上放大，向下缩小）"
                            className="relative flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-background shadow-sm hover:bg-foreground/90 cursor-ns-resize"
                            onPointerDown={(e) => handleScalePointerDown(e, img)}
                            onPointerMove={handleScalePointerMove}
                            onPointerUp={handleScalePointerUp}
                            onPointerCancel={handleScalePointerUp}
                          >
                            <HugeiconsIcon icon={ArrowUpDownIcon} size={14} strokeWidth={2} />
                            {/* 缩放时显示百分比 */}
                            {scaleStateRef.current.isScaling && scaleStateRef.current.imageId === img.id && (
                              <div className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-0.5 text-xs font-medium text-background shadow-md">
                                {Math.round(img.scale * 100)}%
                              </div>
                            )}
                          </button>
                        </div>
                      </div>
                    )
                  })
                  )}
                </div>
              </div>
            </Card>

            {/* 2. 生成记录（占比小） */}
            <Card size="sm" className="flex flex-col overflow-hidden py-0 gap-0 data-[size=sm]:py-0 data-[size=sm]:gap-0" style={{ minHeight: '160px', maxHeight: '220px' }}>
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2">
                <span className="text-sm font-semibold text-foreground">生成记录</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5">
                    {([
                      ['all', '全部'],
                      ['completed', '已生成'],
                      ['failed', '失败'],
                    ] as const).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        onClick={() => setRecordFilter(value)}
                        className={cn(
                          'rounded px-2 py-0.5 text-[11px] transition',
                          recordFilter === value
                            ? 'bg-background text-foreground shadow-sm'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                    {filteredRecords.length > 0 && `共 ${filteredRecords.length} 条`}
                    {totalRecordPages > 1 && ` · 第 ${recordPage + 1}/${totalRecordPages} 页`}
                  </span>
                </div>
              </div>
              <div className="flex-1 p-3">
                {historyLoading ? (
                  <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在刷新生成记录
                  </div>
                ) : filteredRecords.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-xs text-muted-foreground">
                      {recordFilter === 'completed' ? '暂无已生成记录' : recordFilter === 'failed' ? '暂无失败记录' : '暂无生成记录'}
                    </p>
                  </div>
                ) : (
                  <div className="relative flex h-full items-start">
                    {recordPage > 0 && (
                      <button
                        type="button"
                        onClick={() => setRecordPage(prev => prev - 1)}
                        className="absolute left-0 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 shadow-sm transition hover:border-foreground/20 hover:bg-background"
                        title="上一页"
                      >
                        <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.9} style={{ transform: 'rotate(180deg)' }} className="text-muted-foreground" />
                      </button>
                    )}
                    <div className="grid h-full w-full grid-cols-8 gap-2.5 px-5">
                      {recordSlots.map((slot, slotIndex) => {
                        if (slot.type === 'empty') {
                          return <div key={slot.key} className="aspect-square w-full rounded-md" aria-hidden="true" />
                        }

                        const record = slot.record

                        if (record.type === 'completed') {
                          const img = record.data as HistoryImage
                          return (
                            <RecordThumbnail
                              key={`completed-${img.taskId}-${recordPage * recordsPerPage + slot.index}`}
                              url={img.url}
                              selected={selectedHistoryImages.has(img.url)}
                              onClick={() => handleHistoryClick(img.url)}
                            />
                          )
                        }

                        if (record.type === 'pending') {
                          const task = record.data as GenerationTask
                          return (
                            <div
                              key={`pending-${task.id}-${slotIndex}`}
                              className="flex aspect-square w-full items-center justify-center rounded-md border-2 border-dashed border-border bg-muted/50"
                              title="生成中..."
                            >
                              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                            </div>
                          )
                        }

                        const task = record.data as GenerationTask
                        return (
                          <div
                            key={`failed-${task.id}-${slotIndex}`}
                            className="flex aspect-square w-full items-center justify-center rounded-md border-2 border-dashed border-destructive/40 bg-destructive/5"
                            title={task.error_message || '生成失败'}
                          >
                            <HugeiconsIcon icon={AlertCircleIcon} size={20} strokeWidth={1.7} className="text-destructive/70" />
                          </div>
                        )
                      })}
                    </div>
                    {recordPage < totalRecordPages - 1 && (
                      <button
                        type="button"
                        onClick={() => setRecordPage(prev => prev + 1)}
                        className="absolute right-0 top-1/2 z-10 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 shadow-sm transition hover:border-foreground/20 hover:bg-background"
                        title="下一页"
                      >
                        <HugeiconsIcon icon={ArrowRight01Icon} size={16} strokeWidth={1.9} className="text-muted-foreground" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </main>

      <ImagePreviewOverlay
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        imageUrl={previewImageUrl}
        item={previewImageData}
      />
    </div>
  )
}

function getSubTemplatePreviewImage(subTemplate: ProductSubTemplate) {
  if (subTemplate.preview_image_url) return subTemplate.preview_image_url
  const images = parseJsonArray(subTemplate.fixed_reference_images)
  return images[0] || null
}

function getTemplatePreviewImage(template: ProductMainTemplate) {
  const firstSubTemplate = template.sub_templates?.[0]
  return firstSubTemplate ? getSubTemplatePreviewImage(firstSubTemplate) : null
}

function RecordThumbnail({
  url,
  selected,
  onClick,
}: {
  url: string
  selected: boolean
  onClick: () => void
}) {
  const thumbnailSrc = toImageSrc(url, { width: 176, height: 176 })
  const [loaded, setLoaded] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    setLoaded(false)
    setFailed(false)
    const image = new Image()
    image.onload = () => {
      if (!cancelled) setLoaded(true)
    }
    image.onerror = () => {
      if (!cancelled) setFailed(true)
    }
    image.src = thumbnailSrc
    if (image.complete && image.naturalWidth > 0) {
      setLoaded(true)
    }
    return () => {
      cancelled = true
      image.onload = null
      image.onerror = null
    }
  }, [thumbnailSrc])

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'group relative aspect-square w-full overflow-hidden rounded-md border-2 bg-muted/20 leading-none transition',
        selected
          ? 'border-foreground'
          : 'border-transparent hover:border-border'
      )}
      title="点击选中/取消"
    >
      {!loaded && !failed && <Skeleton className="absolute inset-0 h-full w-full rounded-md" />}
      {failed ? (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/40 text-[11px] text-muted-foreground">
          加载失败
        </div>
      ) : (
        <img
          src={thumbnailSrc}
          alt=""
          className={cn('block h-full w-full object-cover transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
        />
      )}
      {selected && (
        <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground">
          <svg className="h-2.5 w-2.5 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
      )}
    </button>
  )
}

interface TemplateManagementContentProps {
  templates: ProductMainTemplate[]
  templateGroups: ProductTemplateGroup[]
  currentTemplate: ProductMainTemplate | null | undefined
  currentSubTemplates: ProductSubTemplate[]
  selectedSubTemplates: ProductSubTemplate[]
  loading: boolean
  search: string
  groupFilter: string
  selectedTemplateId: number | null
  templateSelectedSubTemplateIds: Set<number>
  selectedSubTemplateCount: number
  selectedTemplateCount: number
  onSearchChange: (value: string) => void
  onGroupFilterChange: (value: string) => void
  onSelectTemplate: (id: number) => void
  onCreateTemplateClick: () => void
  onCreateSubTemplateClick: () => void
  onApplyCurrentTemplate: () => void
  onEditTemplate: () => void
  onDeleteTemplate: (template: ProductMainTemplate) => void
  onEditSubTemplate: (subTemplate: ProductSubTemplate) => void
  onDeleteSubTemplate: (subTemplate: ProductSubTemplate) => void
  onToggleSubTemplate: (subTemplate: ProductSubTemplate, checked: boolean) => void
  onApply: () => void
}

function TemplateManagementContent({
  templates,
  templateGroups,
  currentTemplate,
  currentSubTemplates,
  selectedSubTemplates,
  loading,
  search,
  groupFilter,
  selectedTemplateId,
  templateSelectedSubTemplateIds,
  selectedSubTemplateCount,
  selectedTemplateCount,
  onSearchChange,
  onGroupFilterChange,
  onSelectTemplate,
  onCreateTemplateClick,
  onCreateSubTemplateClick,
  onApplyCurrentTemplate,
  onEditTemplate,
  onDeleteTemplate,
  onEditSubTemplate,
  onDeleteSubTemplate,
  onToggleSubTemplate,
  onApply,
}: TemplateManagementContentProps) {
  const previewSubTemplates = selectedSubTemplates.slice(0, 5)
  const hiddenPreviewCount = Math.max(selectedSubTemplates.length - 5, 0)

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-muted/20">
      <div className="grid min-h-0 flex-1 grid-cols-[300px_1fr] overflow-hidden">
        <aside className="flex min-h-0 flex-col border-r border-border bg-background/80">
          <div className="border-b border-border p-3">
            <div className="grid grid-cols-[minmax(0,1fr)_88px_36px] items-center gap-2">
              <Input value={search} onChange={(event) => onSearchChange(event.target.value)} placeholder="搜索" className="h-8 min-w-0 text-sm leading-8" />
              <Select value={groupFilter} onValueChange={(value) => value && onGroupFilterChange(value)} items={{ all: '分组', ...Object.fromEntries(templateGroups.map(group => [String(group.id), group.name])) }}>
                <SelectTrigger className="h-8 w-full justify-center gap-1 rounded-md px-1 text-xs leading-8 [&>svg:last-child]:hidden [&_[data-slot=select-value]]:flex-none [&_[data-slot=select-value]]:grow-0">
                  <Tags className="h-3.5 w-3.5" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent side="bottom" align="start" sideOffset={4} alignItemWithTrigger={false} className="min-w-0">
                  <SelectItem value="all">分组</SelectItem>
                  {templateGroups.map(group => (
                    <SelectItem key={group.id} value={String(group.id)}>
                      <span className={cn('inline-flex h-5 items-center rounded-md border px-2 text-[10px]', getTemplateGroupBadgeClass(group.badge_color))}>{group.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button size="sm" onClick={onCreateTemplateClick} aria-label="模板" title="模板" className="h-8 w-full shrink-0 rounded-md px-0">
                <FilePlus2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-3">
            {loading ? (
              Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 w-full rounded-lg" />)
            ) : templates.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">暂无模板</div>
            ) : (
              templates.map(template => (
                <button key={template.id} type="button" onClick={() => onSelectTemplate(template.id)} className="w-full text-left">
                  <Card size="sm" className={cn('rounded-lg py-0 transition hover:border-foreground/30 hover:bg-muted/30', selectedTemplateId === template.id && 'border-foreground/40 bg-muted/50 shadow-sm')}>
                    <CardContent className="flex gap-3 px-3 py-1.5">
                      <div className="flex h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                        {(() => {
                          const previewImage = getTemplatePreviewImage(template)
                          return previewImage ? (
                            <img src={toImageSrc(previewImage, { width: 160, height: 160 })} alt={template.name} className="h-full w-full object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center bg-muted text-lg font-semibold text-muted-foreground">
                              {template.name.trim().charAt(0) || '?'}
                            </div>
                          )
                        })()}
                      </div>
                      <div className="flex h-14 min-w-0 flex-1 flex-col justify-between">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 truncate text-sm font-medium leading-5 text-foreground">{template.name}</p>
                          <div className="flex shrink-0 items-center gap-1">
                            <Badge variant="outline" className={cn('h-5 max-w-[76px] truncate px-1.5 text-[10px]', getTemplateGroupBadgeClass(template.group_badge_color))}>
                              {template.group_name || '默认分组'}
                            </Badge>
                            <Tooltip>
                              <TooltipTrigger render={<span className="inline-flex shrink-0" />}>
                                <Badge
                                  variant="outline"
                                  className={cn(
                                    'h-5 px-1.5 text-[10px]',
                                    template.visibility === 'public'
                                      ? 'border-green-200 bg-green-50 text-green-700'
                                      : 'border-yellow-200 bg-yellow-50 text-yellow-700'
                                  )}
                                >
                                  {template.visibility === 'public' ? '公开' : '私有'}
                                </Badge>
                              </TooltipTrigger>
                              <TooltipContent side="top">
                                {template.visibility === 'public' ? `模板所有者：${template.username || '未知用户'}` : `私有模板 · 所有者：${template.username || '当前用户'}`}
                              </TooltipContent>
                            </Tooltip>
                          </div>
                        </div>
                        <div className="flex items-end justify-between gap-2">
                          <p className="min-w-0 truncate text-xs leading-5 text-muted-foreground">{template.description || '暂无模板描述'}</p>
                          <Badge variant="outline" className="h-5 shrink-0 border-blue-200 bg-blue-50 px-1.5 text-[10px] text-blue-700">
                            {template.sub_template_count || template.sub_templates?.length || 0} 个小模板
                          </Badge>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="flex min-h-0 flex-col overflow-hidden bg-background">
          <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <p className="text-base font-medium text-foreground">{currentTemplate?.name || '选择模板'}</p>
              <p className="mt-1 text-xs text-muted-foreground">可选择一个或多个小模板，应用后可分别编辑每个提示词</p>
            </div>
            {currentTemplate && (
              <div className="flex items-center gap-2">
                {selectedSubTemplates.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    {previewSubTemplates.map(subTemplate => {
                      const previewImage = getSubTemplatePreviewImage(subTemplate)
                      return (
                        <div key={subTemplate.id} className="group/preview relative h-10 w-10 shrink-0 rounded-lg border border-border bg-muted">
                          {previewImage ? (
                            <img src={toImageSrc(previewImage, { width: 120, height: 120 })} alt={subTemplate.name} className="h-full w-full rounded-lg object-cover" />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                              <ImagePlus className="h-4 w-4" />
                            </div>
                          )}
                          {previewImage && (
                            <div className="pointer-events-none absolute right-0 top-full z-30 mt-2 hidden w-40 overflow-hidden rounded-xl border border-border bg-background p-1 shadow-xl group-hover/preview:block">
                              <img src={toImageSrc(previewImage, { width: 420, height: 420 })} alt={subTemplate.name} className="aspect-square w-full rounded-lg object-cover" />
                              <p className="mt-1 truncate px-1 pb-1 text-[10px] text-muted-foreground">{subTemplate.name}</p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                    {hiddenPreviewCount > 0 && <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-muted text-xs font-medium text-muted-foreground">+{hiddenPreviewCount}</div>}
                  </div>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      <MoreHorizontal className="mr-1.5 h-3.5 w-3.5" />
                      更多操作
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={onApplyCurrentTemplate}>
                      <Eye className="h-4 w-4" />
                      应用大模板
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={onEditTemplate}>
                      <Pencil className="h-4 w-4" />
                      编辑大模板
                    </DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => onDeleteTemplate(currentTemplate)}>
                      <Trash2 className="h-4 w-4" />
                      删除大模板
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="sm" variant="outline" onClick={onCreateSubTemplateClick}>
                  <Plus className="mr-1.5 h-3.5 w-3.5" />
                  添加小模板
                </Button>
              </div>
            )}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-5">
            {loading ? (
              <div className="grid grid-cols-4 gap-4">
                {Array.from({ length: 8 }).map((_, index) => (
                  <Card key={index} className="gap-0 overflow-hidden rounded-xl py-0">
                    <Skeleton className="aspect-square w-full" />
                    <CardContent className="flex flex-col gap-2.5 p-3">
                      <Skeleton className="h-4 w-3/4" />
                      <Skeleton className="h-8 w-full rounded-md" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : !currentTemplate ? (
              <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 text-xs text-muted-foreground">请选择左侧模板</div>
            ) : currentSubTemplates.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 text-center">
                <p className="text-xs text-muted-foreground">当前模板暂无小模板</p>
                <p className="text-[11px] text-muted-foreground/70">点击右上角添加小模板</p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-4">
                {currentSubTemplates.map(subTemplate => {
                  const previewImage = getSubTemplatePreviewImage(subTemplate)
                  const checked = templateSelectedSubTemplateIds.has(subTemplate.id)
                  return (
                    <Card key={subTemplate.id} role="button" tabIndex={0} onClick={() => onToggleSubTemplate(subTemplate, !checked)} onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        onToggleSubTemplate(subTemplate, !checked)
                      }
                    }} className={cn('group relative cursor-pointer gap-0 overflow-hidden rounded-xl py-0 ring-1 ring-foreground/10', checked && 'ring-2 ring-blue-600 bg-blue-50/20 shadow-sm')}>
                      {checked && (
                        <div className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
                          <Check className="h-3.5 w-3.5" />
                        </div>
                      )}
                      <div className="aspect-square overflow-hidden bg-muted">
                        {previewImage ? (
                          <img src={toImageSrc(previewImage, { width: 360, height: 360 })} alt={subTemplate.name} className="block h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-muted-foreground">
                            <ImagePlus className="h-5 w-5" />
                            暂无效果图
                          </div>
                        )}
                      </div>
                      <CardContent className="flex flex-col gap-2.5 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <p className="min-w-0 truncate text-left text-sm font-semibold leading-5 text-foreground" title={subTemplate.name}>{subTemplate.name}</p>
                          <Badge variant="outline" className="h-5 shrink-0 rounded-md bg-background/80 px-1.5 text-[10px] text-muted-foreground">#{subTemplate.sort_order ?? 0}</Badge>
                        </div>
                        <p className="line-clamp-2 min-h-8 rounded-lg bg-muted/35 px-2.5 py-1.5 text-left text-xs leading-4 text-muted-foreground" title={subTemplate.fixed_prompt}>{subTemplate.fixed_prompt || '暂无提示词'}</p>
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 flex-1 rounded-md bg-black px-2 text-xs text-white shadow-sm hover:bg-black/90" onClick={(event) => {
                            event.stopPropagation()
                            onEditSubTemplate(subTemplate)
                          }}>
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            编辑
                          </Button>
                          <Button size="sm" className="h-7 flex-1 rounded-md bg-red-600 px-2 text-xs text-white shadow-sm hover:bg-red-700" onClick={(event) => {
                            event.stopPropagation()
                            onDeleteSubTemplate(subTemplate)
                          }}>
                            <Trash2 className="mr-1 h-3.5 w-3.5" />
                            删除
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="flex items-center justify-between border-t border-border bg-background px-5 py-4">
        <p className="text-xs text-muted-foreground">
          已选择 {selectedSubTemplateCount} 个小模板，来自 {selectedTemplateCount} 个模板
        </p>
        <Button onClick={onApply} disabled={selectedSubTemplateCount === 0}>
          应用已选小模板
        </Button>
      </div>
    </div>
  )
}
