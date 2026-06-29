import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Loader2, Eye } from 'lucide-react'
import { HugeiconsIcon, Upload04Icon, Layers01Icon, File02Icon, Settings02Icon, Cancel01Icon, AlertCircleIcon, Image02Icon, CubeIcon, FolderKanbanIcon, StarsIcon, Delete02Icon, Loading03Icon, ArrowRight01Icon, ArrowUpDownIcon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Combobox } from '@/components/ui/combobox'
import { apiFetch, safeResponseJson } from '@/lib/api'
import { uploadReferenceImages, type ReferenceUploadProgress } from '@/lib/product-reference-upload'
import { cn, toImageSrc } from '@/lib/utils'
import { toast } from 'sonner'
import ImagePreviewOverlay from '@/components/ImagePreviewOverlay'

type GenerateMode = 'single' | 'template'

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

interface MainTemplate {
  id: number
  name: string
  description: string
  visibility: 'private' | 'public'
  user_id: number
  username: string
  sub_template_count: number
  created_at: string
}

interface SubTemplate {
  id: number
  main_template_id: number
  name: string
  fixed_prompt: string
  fixed_reference_images: string[]
  sort_order: number
}

interface TemplateDetail extends MainTemplate {
  sub_templates: SubTemplate[]
}

interface LibraryImage {
  id: number
  url: string
  name: string
  created_at: string
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

export default function ProductImagePage() {
  const [models, setModels] = useState<Model[]>([])
  const [selectedModelId, setSelectedModelId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [userCredits, setUserCredits] = useState(0)

  // 模式：单张生成 / 模板生成
  const [mode, setMode] = useState<GenerateMode>('single')

  const [referenceImages, setReferenceImages] = useState<string[]>([])
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState('1024x1024')
  const [count, setCount] = useState(1)

  // 模板相关
  const [mainTemplates, setMainTemplates] = useState<MainTemplate[]>([])
  const [selectedMainTemplateId, setSelectedMainTemplateId] = useState<number | null>(null)
  const [selectedTemplateDetail, setSelectedTemplateDetail] = useState<TemplateDetail | null>(null)
  const [selectedSubTemplateIds, setSelectedSubTemplateIds] = useState<number[]>([])

  // 模板库相关（单张模式使用）
  const [libraryImages, setLibraryImages] = useState<LibraryImage[]>([])
  const [selectedLibraryImageId, setSelectedLibraryImageId] = useState<number | null>(null)
  const [uploadingLibrary, setUploadingLibrary] = useState(false)
  const libraryFileRef = useRef<HTMLInputElement>(null)

  const [showTemplateDialog, setShowTemplateDialog] = useState(false)

  const [tasks, setTasks] = useState<GenerationTask[]>([])
  const [generating, setGenerating] = useState(false)
  const [uploadingReference, setUploadingReference] = useState(false)
  const [referenceUploadProgress, setReferenceUploadProgress] = useState<ReferenceUploadProgress>({ uploadedCount: 0, totalCount: 0, percent: 0, currentFileName: '' })

  const [selectedHistoryImages, setSelectedHistoryImages] = useState<Set<string>>(new Set())
  const [historyImages, setHistoryImages] = useState<HistoryImage[]>([])
  const prevImageCount = useRef(0)
  const pollCleanupFns = useRef<Set<() => void>>(new Set())

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
  const isTemplateMode = mode === 'template'
  const selectedLibraryImage = libraryImages.find(img => img.id === selectedLibraryImageId) || null
  const singleCost = (selectedModel?.cost_per_image || 0) * count
  const templateCost = (selectedModel?.cost_per_image || 0) * selectedSubTemplateIds.length
  const cost = isTemplateMode ? templateCost : singleCost
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
  const canUploadMore = referenceImages.length < (selectedModel?.max_reference_images || 5)
  const activeCount = tasks.filter(t => t.status === 'pending' || t.status === 'processing').length
  const pendingTasks = tasks.filter(t => t.status === 'pending' || t.status === 'processing')
  const failedTasks = tasks.filter(t => t.status === 'failed')

  // 生成记录：合并所有类型的记录（已完成、进行中、失败）
  const allRecords = useMemo(() => {
    const records: Array<{
      type: 'completed' | 'pending' | 'failed'
      data: HistoryImage | GenerationTask
      timestamp: number
    }> = []
    
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
  const [recordPage, setRecordPage] = useState(0)
  const recordsPerPage = 10
  const totalRecordPages = Math.ceil(allRecords.length / recordsPerPage)
  const currentPageRecords = allRecords.slice(recordPage * recordsPerPage, (recordPage + 1) * recordsPerPage)

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
      try {
        const res = await apiFetch('/api/tasks/history?limit=20&source=product')
        if (!res.ok) return
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
          .filter(task => task.status === 'pending' || task.status === 'processing' || task.status === 'queued')
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
          .filter(task => task.status === 'pending' || task.status === 'processing' || task.status === 'queued')
          .map(task => task.id)

        if (stillPendingTaskIds.length > 0) {
          pollTasks(stillPendingTaskIds, { appendInitialTasks: false })
        }
      } catch {}
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

  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const res = await apiFetch('/api/product/templates')
        if (res.status === 404) { setMainTemplates([]); return }
        if (!res.ok) throw new Error(`加载模板失败 (${res.status})`)
        if (!isJsonResponse(res)) throw new Error('模板接口暂不可用')
        const data = await res.json()
        setMainTemplates(getArrayData<MainTemplate>(data))
      } catch {
        setMainTemplates([])
      }
    }
    fetchTemplates()
  }, [])

  // 加载模板库图片
  const fetchLibraryImages = async () => {
    try {
      const res = await apiFetch('/api/product/library-images')
      if (!res.ok) return
      const data = await res.json()
      setLibraryImages(getArrayData<LibraryImage>(data))
    } catch {
      setLibraryImages([])
    }
  }

  useEffect(() => {
    fetchLibraryImages()
  }, [])

  useEffect(() => {
    if (!selectedMainTemplateId) {
      setSelectedTemplateDetail(null)
      return
    }
    const fetchTemplateDetail = async () => {
      try {
        const res = await apiFetch(`/api/product/templates/${selectedMainTemplateId}`)
        if (res.status === 404) {
          setSelectedTemplateDetail(null)
          setSelectedSubTemplateIds([])
          return
        }
        if (!res.ok) throw new Error(`加载模板详情失败 (${res.status})`)
        if (!isJsonResponse(res)) throw new Error('模板详情接口暂不可用')
        const data = await res.json()
        setSelectedTemplateDetail(data)
        setSelectedSubTemplateIds([])
      } catch {
        setSelectedTemplateDetail(null)
        setSelectedSubTemplateIds([])
      }
    }
    fetchTemplateDetail()
  }, [selectedMainTemplateId])

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
    setSelectedHistoryImages(prev => {
      const newSet = new Set(prev)
      if (newSet.has(url)) {
        // 取消选中：从 set 和画布中移除
        newSet.delete(url)
        setCanvasImages(prev => prev.filter(img => img.url !== url))
      } else {
        // 选中：加入 set 和画布
        if (canvasMode === 'single') {
          // 单图模式：清空之前的选中
          newSet.clear()
          newSet.add(url)
          addImageToCanvas(url, 'single')
        } else {
          // 多图模式：追加
          newSet.add(url)
          addImageToCanvas(url, 'multi')
        }
      }
      return newSet
    })
  }, [canvasMode, addImageToCanvas])

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
    if (images.length > prevImageCount.current) {
      const newImg = images[images.length - 1]
      // 新生成的图片自动选中并加入画布
      setSelectedHistoryImages(prev => {
        const newSet = new Set(prev)
        if (canvasMode === 'single') {
          newSet.clear()
        }
        newSet.add(newImg.url)
        return newSet
      })
      addImageToCanvas(newImg.url)
      // 有新记录时跳转到第一页
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

  // 模式切换：清空模板相关选择
  const handleModeChange = (newMode: GenerateMode) => {
    if (newMode === mode) return
    setMode(newMode)
    setSelectedMainTemplateId(null)
    setSelectedSubTemplateIds([])
    setSelectedTemplateDetail(null)
    setSelectedLibraryImageId(null)
  }

  const handleImageUpload = async (files: FileList) => {
    if (!selectedModel) return
    const maxImages = selectedModel.max_reference_images - referenceImages.length
    if (files.length > maxImages) {
      toast.error(`最多只能上传 ${selectedModel.max_reference_images} 张参考图`)
      return
    }

    setUploadingReference(true)
    setReferenceUploadProgress({ uploadedCount: 0, totalCount: Math.min(files.length, maxImages), percent: 0, currentFileName: '' })
    try {
      const uploadedUrls = await uploadReferenceImages(Array.from(files).slice(0, maxImages), {
        onProgress: (progress) => {
          setReferenceUploadProgress(progress)
        },
      })
      setReferenceImages(prev => [...prev, ...uploadedUrls])
      toast.success(`已上传 ${uploadedUrls.length} 张参考图`)
    } catch (error: any) {
      toast.error(error.message || '参考图上传失败')
    } finally {
      setUploadingReference(false)
      setReferenceUploadProgress({ uploadedCount: 0, totalCount: 0, percent: 0, currentFileName: '' })
    }
  }

  const handleRemoveImage = (index: number) => {
    setReferenceImages(referenceImages.filter((_, i) => i !== index))
  }

  // 上传模板库图片
  const handleLibraryUpload = async (files: FileList) => {
    if (!files || files.length === 0) return
    setUploadingLibrary(true)
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        const formData = new FormData()
        formData.append('image', file)
        formData.append('name', file.name)
        const res = await apiFetch('/api/product/library-images', {
          method: 'POST',
          body: formData,
        })
        if (!res.ok) {
          const data = await res.json().catch(() => ({}))
          throw new Error(data.error || '上传失败')
        }
      }
      toast.success('已上传到模板库')
      await fetchLibraryImages()
    } catch (error: any) {
      toast.error(error.message || '上传模板库图片失败')
    } finally {
      setUploadingLibrary(false)
      if (libraryFileRef.current) libraryFileRef.current.value = ''
    }
  }

  // 删除模板库图片
  const handleLibraryDelete = async (id: number) => {
    try {
      const res = await apiFetch(`/api/product/library-images/${id}`, { method: 'DELETE' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || '删除失败')
      }
      if (selectedLibraryImageId === id) setSelectedLibraryImageId(null)
      await fetchLibraryImages()
      toast.success('已删除')
    } catch (error: any) {
      toast.error(error.message || '删除模板库图片失败')
    }
  }

  const handleGenerate = async () => {
    if (!selectedModelId) { toast.error('请选择模型'); return }
    if (referenceImages.length === 0) { toast.error('请至少上传一张参考图'); return }

    // 单张模式下，若选中模板库图片，作为最后一张参考图追加
    const finalReferenceImages = isTemplateMode
      ? referenceImages
      : (selectedLibraryImage ? [...referenceImages, selectedLibraryImage.url] : referenceImages)

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

    if (isTemplateMode) {
      await runGenerate('template', {
        main_template_id: selectedMainTemplateId,
        sub_template_ids: selectedSubTemplateIds,
        reference_images: finalReferenceImages,
        additional_prompt: prompt
      }, templateCost)
    } else {
      if (!prompt.trim()) { toast.error('请输入文案'); return }
      await runGenerate('single', {
        reference_images: finalReferenceImages,
        prompt,
        size,
        count
      }, singleCost)
    }
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
              const wasPending = updated[idx].status === 'pending' || updated[idx].status === 'processing'
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

  const canGenerate = isTemplateMode
    ? referenceImages.length > 0 && selectedSubTemplateIds.length > 0
    : referenceImages.length > 0 && prompt.trim().length > 0

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
            {/* 单张生成 / 模板生成 下拉选择 */}
            <Select
              value={mode}
              onValueChange={(v) => handleModeChange(v as GenerateMode)}
              items={{ single: '单张生成', template: '模板生成' }}
            >
              <SelectTrigger size="sm" className="w-[120px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">单张生成</SelectItem>
                <SelectItem value="template">模板生成</SelectItem>
              </SelectContent>
            </Select>

            <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
              <DialogTrigger
                render={
                  <Button variant="outline" size="sm">
                    <HugeiconsIcon icon={FolderKanbanIcon} size={14} strokeWidth={1.7} className="mr-1.5" />
                    模板管理
                  </Button>
                }
              />
              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>模板管理</DialogTitle>
                </DialogHeader>
                <TemplateManagementContent />
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </header>

      {/* 主体：左列固定窄宽 + 右列弹性，左列自然高，右列伸展匹配，整页右侧滚动 */}
      <main className="flex-1">
        <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-[340px_1fr] lg:items-stretch">
          {/* 左列：4 个卡片 */}
          <div className="space-y-3">
            {/* 1. 上传产品图片 */}
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <HugeiconsIcon icon={Upload04Icon} size={16} strokeWidth={1.7} className="text-muted-foreground" />
                  上传产品图片
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">支持 JPG / PNG / WEBP 格式</p>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-2">
                  {referenceImages.map((img, index) => (
                    <div key={index} className="group relative aspect-square overflow-hidden rounded-md border border-border bg-muted">
                      <img src={img} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveImage(index)}
                        className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-foreground/70 text-background opacity-0 transition group-hover:opacity-100"
                      >
                        <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
                      </button>
                    </div>
                  ))}
                  {canUploadMore && (
                    <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border transition hover:border-foreground/40 hover:bg-muted/50">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                        {uploadingReference ? (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        ) : (
                          <HugeiconsIcon icon={Upload04Icon} size={12} strokeWidth={1.7} className="text-muted-foreground" />
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{uploadingReference ? `${referenceUploadProgress.percent}%` : '上传图片'}</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        disabled={uploadingReference}
                        onChange={(e) => e.target.files && handleImageUpload(e.target.files)}
                      />
                    </label>
                  )}
                </div>
                {selectedModel && (
                  <p className="mt-2 text-[10px] text-muted-foreground">
                    {referenceImages.length}/{selectedModel.max_reference_images} 张
                  </p>
                )}
                {uploadingReference && referenceUploadProgress.totalCount > 0 && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    正在上传 {referenceUploadProgress.uploadedCount}/{referenceUploadProgress.totalCount}
                    {referenceUploadProgress.currentFileName ? ` · ${referenceUploadProgress.currentFileName}` : ''}
                  </p>
                )}
              </CardContent>
            </Card>

            {/* 2. 模板库（单张模式） / 选择主图模板（模板模式） */}
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  {isTemplateMode ? (
                    <HugeiconsIcon icon={Layers01Icon} size={16} strokeWidth={1.7} className="text-muted-foreground" />
                  ) : (
                    <HugeiconsIcon icon={Layers01Icon} size={16} strokeWidth={1.7} className="text-muted-foreground" />
                  )}
                  {isTemplateMode ? '选择主图模板' : '模板库'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {isTemplateMode ? (
                  <>
                    <Select
                      value={String(selectedMainTemplateId || '')}
                      onValueChange={(v) => setSelectedMainTemplateId(Number(v))}
                    >
                      <SelectTrigger className="text-sm">
                        <SelectValue placeholder="选择主图模板" />
                      </SelectTrigger>
                      <SelectContent>
                        {mainTemplates.map((template) => (
                          <SelectItem key={template.id} value={String(template.id)}>
                            <span>{template.name}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {selectedTemplateDetail && (
                      <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
                        {selectedTemplateDetail.sub_templates.map((subTemplate) => (
                          <label
                            key={subTemplate.id}
                            className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 transition hover:bg-muted"
                          >
                            <Checkbox
                              checked={selectedSubTemplateIds.includes(subTemplate.id)}
                              onCheckedChange={(checked) => {
                                if (checked) {
                                  setSelectedSubTemplateIds([...selectedSubTemplateIds, subTemplate.id])
                                } else {
                                  setSelectedSubTemplateIds(selectedSubTemplateIds.filter(id => id !== subTemplate.id))
                                }
                              }}
                              className="mt-0.5"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="text-xs font-medium text-foreground">{subTemplate.name}</div>
                              <div className="mt-0.5 truncate text-[10px] text-muted-foreground">{subTemplate.fixed_prompt}</div>
                            </div>
                          </label>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <input
                      ref={libraryFileRef}
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => e.target.files && handleLibraryUpload(e.target.files)}
                    />
                    <div className="grid grid-cols-3 gap-2">
                      {libraryImages.map((img) => (
                        <div
                          key={img.id}
                          className={cn(
                            'group relative aspect-square overflow-hidden rounded-md border-2 cursor-pointer transition',
                            selectedLibraryImageId === img.id
                              ? 'border-foreground'
                              : 'border-border hover:border-foreground/40'
                          )}
                          onClick={() => setSelectedLibraryImageId(selectedLibraryImageId === img.id ? null : img.id)}
                          title={img.name}
                        >
                          <img src={img.url} alt={img.name} className="h-full w-full object-cover" />
                          {selectedLibraryImageId === img.id && (
                            <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground">
                              <svg className="h-2.5 w-2.5 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            </div>
                          )}
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); handleLibraryDelete(img.id) }}
                            className="absolute bottom-1 right-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground opacity-0 transition group-hover:opacity-100"
                            title="删除"
                          >
                            <HugeiconsIcon icon={Delete02Icon} size={12} strokeWidth={2} />
                          </button>
                        </div>
                      ))}
                      <label
                        className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border transition hover:border-foreground/40 hover:bg-muted/50"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {uploadingLibrary ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                        ) : (
                          <>
                            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                              <HugeiconsIcon icon={Upload04Icon} size={12} strokeWidth={1.7} className="text-muted-foreground" />
                            </div>
                            <span className="text-[10px] text-muted-foreground">上传</span>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          className="hidden"
                          onChange={(e) => e.target.files && handleLibraryUpload(e.target.files)}
                        />
                      </label>
                    </div>
                    {selectedLibraryImage && (
                      <p className="mt-2 text-[10px] text-muted-foreground">
                        已选模板库图片，将作为最后一张参考图发送
                      </p>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* 3. 输入文案 */}
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <HugeiconsIcon icon={File02Icon} size={16} strokeWidth={1.7} className="text-muted-foreground" />
                  输入文案
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value.slice(0, 5000))}
                    placeholder={isTemplateMode ? '补充说明，如产品颜色、尺寸等...' : '描述商品卖点、场景、光线、构图等...'}
                    rows={4}
                    className="resize-none text-sm overflow-y-auto"
                    style={{ maxHeight: '120px' }}
                  />
                  <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">{prompt.length}/5000</span>
                </div>
              </CardContent>
            </Card>

            {/* 4. 生成设置 */}
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
                  {!isTemplateMode && (
                    <div className="flex items-center gap-3">
                      <Label className="w-16 shrink-0 text-xs text-muted-foreground">生图数量</Label>
                      <Input
                        type="number"
                        min={1}
                        value={count}
                        onChange={(e) => {
                          const value = Math.max(1, parseInt(e.target.value) || 1)
                          setCount(value)
                        }}
                        className="flex-1 text-sm"
                      />
                    </div>
                  )}
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
          <div className="flex flex-col gap-3 lg:h-full">
            {/* 1. 自由画布（占比大） */}
            <Card size="sm" className="flex min-h-[400px] flex-1 flex-col overflow-hidden">
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
              <div
                ref={canvasContainerRef}
                className="relative flex-1 overflow-hidden bg-muted/30"
                style={{ backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)', backgroundSize: '16px 16px' }}
                onWheel={handleCanvasWheel}
                onPointerDown={handleCanvasPointerDown}
                onPointerMove={handleCanvasPointerMove}
                onPointerUp={handleCanvasPointerUp}
                onPointerCancel={handleCanvasPointerUp}
              >
                {/* 缩放百分比指示器 */}
                <div className="absolute right-3 top-3 rounded-md bg-background/90 px-2 py-1 text-xs font-medium text-foreground shadow-sm">
                  {canvasZoom}%
                </div>
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
            </Card>

            {/* 2. 生成记录（占比小） */}
            <Card size="sm" className="flex flex-col overflow-hidden" style={{ minHeight: '160px', maxHeight: '220px' }}>
              <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
                <span className="text-sm font-semibold text-foreground">生成记录</span>
                <span className="text-[11px] text-muted-foreground">
                  {allRecords.length > 0 && `共 ${allRecords.length} 条`}
                  {totalRecordPages > 1 && ` · 第 ${recordPage + 1}/${totalRecordPages} 页`}
                </span>
              </div>
              <div className="flex-1 overflow-x-auto overflow-y-hidden p-3">
                {allRecords.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-xs text-muted-foreground">暂无生成记录</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2.5">
                    {/* 上一页按钮 */}
                    {recordPage > 0 && (
                      <button
                        type="button"
                        onClick={() => setRecordPage(prev => prev - 1)}
                        className="flex shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 transition hover:bg-muted hover:border-foreground/20"
                        style={{ width: '88px', height: '88px' }}
                        title="上一页"
                      >
                        <HugeiconsIcon icon={ArrowRight01Icon} size={24} strokeWidth={1.7} style={{ transform: 'rotate(180deg)' }} className="text-muted-foreground" />
                      </button>
                    )}
                    
                    {/* 当前页的记录 */}
                    {currentPageRecords.map((record, i) => {
                      if (record.type === 'completed') {
                        const img = record.data as HistoryImage
                        return (
                          <button
                            key={`completed-${img.taskId}-${recordPage * recordsPerPage + i}`}
                            type="button"
                            onClick={() => handleHistoryClick(img.url)}
                            className={cn(
                              'group relative shrink-0 overflow-hidden rounded-md border-2 transition',
                              selectedHistoryImages.has(img.url)
                                ? 'border-foreground'
                                : 'border-transparent hover:border-border'
                            )}
                            style={{ width: '88px', height: '88px' }}
                            title="点击选中/取消"
                          >
                            <img src={img.url} alt="" className="h-full w-full object-cover" />
                            {selectedHistoryImages.has(img.url) && (
                              <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground">
                                <svg className="h-2.5 w-2.5 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                </svg>
                              </div>
                            )}
                          </button>
                        )
                      } else if (record.type === 'pending') {
                        const task = record.data as GenerationTask
                        return (
                          <div
                            key={`pending-${task.id}`}
                            className="flex shrink-0 items-center justify-center rounded-md border-2 border-dashed border-border bg-muted/50"
                            style={{ width: '88px', height: '88px' }}
                            title="生成中..."
                          >
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        )
                      } else {
                        const task = record.data as GenerationTask
                        return (
                          <div
                            key={`failed-${task.id}`}
                            className="flex shrink-0 items-center justify-center rounded-md border-2 border-dashed border-destructive/40 bg-destructive/5"
                            style={{ width: '88px', height: '88px' }}
                            title={task.error_message || '生成失败'}
                          >
                            <HugeiconsIcon icon={AlertCircleIcon} size={20} strokeWidth={1.7} className="text-destructive/70" />
                          </div>
                        )
                      }
                    })}
                    
                    {/* 下一页按钮 */}
                    {recordPage < totalRecordPages - 1 && (
                      <button
                        type="button"
                        onClick={() => setRecordPage(prev => prev + 1)}
                        className="flex shrink-0 items-center justify-center rounded-md border border-border bg-muted/50 transition hover:bg-muted hover:border-foreground/20"
                        style={{ width: '88px', height: '88px' }}
                        title="下一页"
                      >
                        <HugeiconsIcon icon={ArrowRight01Icon} size={24} strokeWidth={1.7} className="text-muted-foreground" />
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

function TemplateManagementContent() {
  return (
    <div className="py-8 text-center text-sm text-muted-foreground">
      <p>模板管理功能开发中</p>
    </div>
  )
}
