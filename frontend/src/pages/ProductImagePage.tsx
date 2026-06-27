import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { Upload, LayoutTemplate, FileText, Settings2, X, Loader2, AlertCircle, Image as ImageIcon, Package, FolderOpen, Sparkles, Trash2, ZoomIn, RotateCcw, Layers } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { apiFetch, safeResponseJson } from '@/lib/api'
import { uploadReferenceImages } from '@/lib/product-reference-upload'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

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
  icon_url?: string
  supported_sizes?: { ratios: ModelSizeRatio[] } | null
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
  status: 'pending' | 'processing' | 'completed' | 'failed'
  result_images?: string[]
  error_message?: string
  template_info?: {
    mode: 'single' | 'template'
    sub_template_name?: string
  }
  completedAt?: number
}

interface HistoryImage {
  url: string
  taskId: number
  subTemplateName?: string
  timestamp: number
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

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days === 1) return '昨天'
  return `${days}天前`
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

  const [previewImage, setPreviewImage] = useState<string | null>(null)
  const [historyImages, setHistoryImages] = useState<HistoryImage[]>([])
  const prevImageCount = useRef(0)

  // 自由画布
  const [canvasImages, setCanvasImages] = useState<CanvasImage[]>([])
  const [canvasMode, setCanvasMode] = useState<CanvasMode>('single')
  const canvasIdCounter = useRef(0)
  const canvasContainerRef = useRef<HTMLDivElement>(null)
  const dragStateRef = useRef<{
    type: 'drag' | 'zoom' | null
    id: string | null
    startClientX: number
    startClientY: number
    startImgX: number
    startImgY: number
    startScale: number
    centerCanvasX: number
    centerCanvasY: number
    startDist: number
  }>({ type: null, id: null, startClientX: 0, startClientY: 0, startImgX: 0, startImgY: 0, startScale: 1, centerCanvasX: 0, centerCanvasY: 0, startDist: 0 })

  const selectedModel = models.find(m => m.id === selectedModelId)
  const isTemplateMode = mode === 'template'
  const selectedLibraryImage = libraryImages.find(img => img.id === selectedLibraryImageId) || null
  const singleCost = (selectedModel?.cost_per_image || 0) * count
  const templateCost = (selectedModel?.cost_per_image || 0) * selectedSubTemplateIds.length
  const cost = isTemplateMode ? templateCost : singleCost

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
        // multi 模式：轻微错位叠放
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

  // 点击历史记录图片：加入画布
  const handleHistoryClick = useCallback((url: string) => {
    setPreviewImage(url)
    addImageToCanvas(url)
  }, [addImageToCanvas])

  // 重置画布视图：所有图片恢复到中心默认缩放
  const handleResetCanvas = useCallback(() => {
    const container = canvasContainerRef.current
    const cw = container?.clientWidth || 600
    const ch = container?.clientHeight || 400
    setCanvasImages(prev => prev.map(img => {
      const fitScale = Math.min(cw / img.naturalWidth, ch / img.naturalHeight) * 0.6
      const scale = Math.max(0.1, fitScale)
      const displayW = img.naturalWidth * scale
      const displayH = img.naturalHeight * scale
      return {
        ...img,
        scale,
        x: (cw - displayW) / 2,
        y: (ch - displayH) / 2,
      }
    }))
  }, [])

  // 从画布删除图片
  const handleCanvasDelete = useCallback((id: string) => {
    setCanvasImages(prev => prev.filter(img => img.id !== id))
  }, [])

  // 切换画布模式
  const handleCanvasModeToggle = useCallback(() => {
    setCanvasMode(prev => prev === 'single' ? 'multi' : 'single')
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
      startScale: img.scale,
      centerCanvasX: 0,
      centerCanvasY: 0,
      startDist: 0,
    }
  }, [])

  // 画布图片缩放（按住缩放图标拖动：远离中心放大，靠近中心缩小）
  const handleZoomPointerDown = useCallback((e: React.PointerEvent, img: CanvasImage) => {
    if (e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    const container = canvasContainerRef.current
    const rect = container?.getBoundingClientRect()
    const cLeft = rect?.left || 0
    const cTop = rect?.top || 0
    const centerCanvasX = img.x + (img.naturalWidth * img.scale) / 2
    const centerCanvasY = img.y + (img.naturalHeight * img.scale) / 2
    const pointerCanvasX = e.clientX - cLeft
    const pointerCanvasY = e.clientY - cTop
    const startDist = Math.hypot(pointerCanvasX - centerCanvasX, pointerCanvasY - centerCanvasY) || 1
    dragStateRef.current = {
      type: 'zoom',
      id: img.id,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startImgX: img.x,
      startImgY: img.y,
      startScale: img.scale,
      centerCanvasX,
      centerCanvasY,
      startDist,
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
    } else if (ds.type === 'zoom') {
      const container = canvasContainerRef.current
      const rect = container?.getBoundingClientRect()
      const cLeft = rect?.left || 0
      const cTop = rect?.top || 0
      const pointerCanvasX = e.clientX - cLeft
      const pointerCanvasY = e.clientY - cTop
      const currentDist = Math.hypot(pointerCanvasX - ds.centerCanvasX, pointerCanvasY - ds.centerCanvasY) || 1
      const ratio = currentDist / ds.startDist
      let newScale = ds.startScale * ratio
      newScale = Math.max(0.05, Math.min(5, newScale))
      setCanvasImages(prev => prev.map(im => {
        if (im.id !== ds.id) return im
        const newX = ds.centerCanvasX - (im.naturalWidth * newScale) / 2
        const newY = ds.centerCanvasY - (im.naturalHeight * newScale) / 2
        return { ...im, scale: newScale, x: newX, y: newY }
      }))
    }
  }, [])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const ds = dragStateRef.current
    if (ds.id) {
      try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId) } catch {}
    }
    dragStateRef.current = { ...ds, type: null, id: null }
  }, [])

  useEffect(() => {
    const now = Date.now()
    const completed = tasks.filter(t => t.status === 'completed' && t.result_images && t.result_images.length > 0)
    const images: HistoryImage[] = completed.flatMap(t =>
      (t.result_images || []).map(url => ({
        url,
        taskId: t.id,
        subTemplateName: t.template_info?.sub_template_name,
        timestamp: t.completedAt || now
      }))
    )
    setHistoryImages(images)
    if (images.length > prevImageCount.current) {
      const newImg = images[images.length - 1]
      setPreviewImage(newImg.url)
      // 新生成的图片自动加入画布
      addImageToCanvas(newImg.url)
    }
    prevImageCount.current = images.length
  }, [tasks, addImageToCanvas])

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
    try {
      const uploadedUrls = await uploadReferenceImages(Array.from(files).slice(0, maxImages))
      setReferenceImages(prev => [...prev, ...uploadedUrls])
      toast.success(`已上传 ${uploadedUrls.length} 张参考图`)
    } catch (error: any) {
      toast.error(error.message || '参考图上传失败')
    } finally {
      setUploadingReference(false)
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
      if (!prompt.trim()) { toast.error('请输入提示词'); return }
      await runGenerate('single', {
        reference_images: finalReferenceImages,
        prompt,
        size,
        count
      }, singleCost)
    }
  }

  const pollTasks = async (taskIds: number[]) => {
    const initialTasks: GenerationTask[] = taskIds.map(id => ({ id, status: 'pending' }))
    setTasks(prev => [...prev, ...initialTasks])
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
        if (allDone) clearInterval(interval)
      } catch (error) {
        console.error('轮询任务状态失败:', error)
      }
    }, 2000)
    setTimeout(() => clearInterval(interval), 300000)
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
        <Package className="h-10 w-10 text-muted-foreground/50" />
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
                    <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
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
                  <Upload className="h-4 w-4 text-muted-foreground" />
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
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                  {canUploadMore && (
                    <label className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed border-border transition hover:border-foreground/40 hover:bg-muted/50">
                      <div className="flex h-6 w-6 items-center justify-center rounded-full bg-muted">
                        {uploadingReference ? (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        ) : (
                          <Upload className="h-3 w-3 text-muted-foreground" />
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{uploadingReference ? '上传中' : '上传图片'}</span>
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
              </CardContent>
            </Card>

            {/* 2. 模板库（单张模式） / 选择主图模板（模板模式） */}
            <Card size="sm">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    {isTemplateMode ? (
                      <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
                    ) : (
                      <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
                    )}
                    {isTemplateMode ? '选择主图模板' : '模板库'}
                  </CardTitle>
                  <span className="text-[10px] text-muted-foreground">可选</span>
                </div>
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
                            <Trash2 className="h-3 w-3" />
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
                              <Upload className="h-3 w-3 text-muted-foreground" />
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
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    输入文案
                  </CardTitle>
                  <span className="text-[10px] text-muted-foreground">可选</span>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative">
                  <Textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value.slice(0, 100))}
                    placeholder={isTemplateMode ? '补充说明，如产品颜色、尺寸等...' : '描述商品卖点、场景、光线、构图等...'}
                    rows={3}
                    className="resize-none text-sm"
                  />
                  <span className="absolute bottom-2 right-3 text-[10px] text-muted-foreground">{prompt.length}/100</span>
                </div>
              </CardContent>
            </Card>

            {/* 4. 生成设置 */}
            <Card size="sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-sm">
                  <Settings2 className="h-4 w-4 text-muted-foreground" />
                  生成设置
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2.5">
                  <div className="flex items-center gap-3">
                    <Label className="w-16 shrink-0 text-xs text-muted-foreground">生图模型</Label>
                    <Select value={String(selectedModelId)} onValueChange={(v) => setSelectedModelId(Number(v))}>
                      <SelectTrigger className="flex-1 text-sm">
                        <SelectValue placeholder="选择模型" />
                      </SelectTrigger>
                      <SelectContent>
                        {models.map((model) => (
                          <SelectItem key={model.id} value={String(model.id)}>
                            {model.display_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="w-16 shrink-0 text-xs text-muted-foreground">生图尺寸</Label>
                    <Select value={size} onValueChange={(val) => setSize(val || '1024x1024')}>
                      <SelectTrigger className="flex-1 text-sm">
                        <SelectValue placeholder="选择尺寸" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableSizes.map((s) => (
                          <SelectItem key={`${s.width}x${s.height}`} value={`${s.width}x${s.height}`}>
                            {s.width}×{s.height}{s.ratio ? ` (${s.ratio})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {!isTemplateMode && (
                    <div className="flex items-center gap-3">
                      <Label className="w-16 shrink-0 text-xs text-muted-foreground">生图数量</Label>
                      <Select value={String(count)} onValueChange={(v) => setCount(Number(v))}>
                        <SelectTrigger className="flex-1 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1 张</SelectItem>
                          <SelectItem value="2">2 张</SelectItem>
                          <SelectItem value="3">3 张</SelectItem>
                          <SelectItem value="4">4 张</SelectItem>
                        </SelectContent>
                      </Select>
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
                    <Sparkles className="mr-2 h-4 w-4" />
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
                    <Layers className="mr-1.5 h-3.5 w-3.5" />
                    {canvasMode === 'single' ? '单图' : '多图'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleResetCanvas}
                    disabled={canvasImages.length === 0}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    重置视图
                  </Button>
                </div>
              </div>
              <div
                ref={canvasContainerRef}
                className="relative flex-1 overflow-hidden bg-muted/30"
                style={{ backgroundImage: 'radial-gradient(circle, hsl(var(--border)) 1px, transparent 1px)', backgroundSize: '16px 16px' }}
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
                          <ImageIcon className="h-7 w-7 text-muted-foreground/40" />
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
                    return (
                      <div
                        key={img.id}
                        className="group absolute touch-none select-none cursor-grab active:cursor-grabbing"
                        style={{
                          left: img.x,
                          top: img.y,
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
                        {/* 悬浮操作：缩放 + 删除 */}
                        <div className="absolute -right-2 -top-2 flex gap-1 opacity-0 transition group-hover:opacity-100">
                          <button
                            type="button"
                            data-canvas-action="zoom"
                            title="按住拖动缩放（向外放大，向内缩小）"
                            className="flex h-6 w-6 cursor-ns-resize items-center justify-center rounded-full bg-foreground text-background shadow-sm hover:bg-foreground/90"
                            onPointerDown={(e) => handleZoomPointerDown(e, img)}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerCancel={handlePointerUp}
                          >
                            <ZoomIn className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            data-canvas-action="delete"
                            title="从画布删除"
                            className="flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90"
                            onClick={(e) => { e.stopPropagation(); handleCanvasDelete(img.id) }}
                          >
                            <X className="h-3.5 w-3.5" />
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
                  {historyImages.length} 已完成 · {pendingTasks.length} 进行中 · {failedTasks.length} 失败
                </span>
              </div>
              <div className="flex-1 overflow-x-auto overflow-y-hidden p-3">
                {historyImages.length === 0 && pendingTasks.length === 0 && failedTasks.length === 0 ? (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-xs text-muted-foreground">暂无生成记录</p>
                  </div>
                ) : (
                  <div className="flex gap-2.5">
                    {historyImages.map((img, i) => (
                      <button
                        key={`${img.taskId}-${i}`}
                        type="button"
                        onClick={() => handleHistoryClick(img.url)}
                        className={cn(
                          'group relative shrink-0 overflow-hidden rounded-md border-2 transition',
                          previewImage === img.url
                            ? 'border-foreground'
                            : 'border-transparent hover:border-border'
                        )}
                        style={{ width: '88px', height: '88px' }}
                        title="点击加入画布"
                      >
                        <img src={img.url} alt="" className="h-full w-full object-cover" />
                        {previewImage === img.url && (
                          <div className="absolute right-1 top-1 flex h-4 w-4 items-center justify-center rounded-full bg-foreground">
                            <svg className="h-2.5 w-2.5 text-background" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                      </button>
                    ))}
                    {pendingTasks.map(task => (
                      <div
                        key={`pending-${task.id}`}
                        className="flex shrink-0 items-center justify-center rounded-md border-2 border-dashed border-border bg-muted/50"
                        style={{ width: '88px', height: '88px' }}
                      >
                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      </div>
                    ))}
                    {failedTasks.map(task => (
                      <div
                        key={`failed-${task.id}`}
                        className="flex shrink-0 items-center justify-center rounded-md border-2 border-dashed border-destructive/40 bg-destructive/5"
                        style={{ width: '88px', height: '88px' }}
                        title={task.error_message || '生成失败'}
                      >
                        <AlertCircle className="h-5 w-5 text-destructive/70" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {historyImages.length > 0 && (
                <div className="border-t border-border px-4 py-1.5">
                  <div className="flex gap-2.5 overflow-x-auto">
                    {historyImages.map((img, i) => (
                      <span
                        key={`time-${img.taskId}-${i}`}
                        className={cn(
                          'shrink-0 text-center text-[10px]',
                          previewImage === img.url ? 'w-[88px] font-medium text-foreground' : 'w-[88px] text-muted-foreground'
                        )}
                      >
                        {formatRelativeTime(img.timestamp)}
                      </span>
                    ))}
                    {pendingTasks.map((_, i) => (
                      <span key={`pt-${i}`} className="w-[88px] shrink-0 text-center text-[10px] text-muted-foreground">生成中</span>
                    ))}
                    {failedTasks.map((_, i) => (
                      <span key={`ft-${i}`} className="w-[88px] shrink-0 text-center text-[10px] text-destructive">失败</span>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
        </div>
      </main>
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
