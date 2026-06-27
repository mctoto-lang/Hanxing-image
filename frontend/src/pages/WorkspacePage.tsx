import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import { Plus, Search, CheckCircle2, XCircle, Loader2, Trash2, ChevronDown, Wand2, ImagePlus, CheckSquare, Download, Square, PanelLeftClose, PanelLeftOpen, Pin, AlertCircle, RefreshCw, Sparkles, ArrowUp } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import Spinner from '@/components/Spinner'
import WorkspaceNewTaskDialog from '@/components/workspace/WorkspaceNewTaskDialog'
import WorkspaceCardGrid from '@/components/workspace/WorkspaceCardGrid'
import WorkspaceTemplateSelectDialog from '@/components/workspace/WorkspaceTemplateSelectDialog'
import WorkspaceModelSelectDialog from '@/components/workspace/WorkspaceModelSelectDialog'
import WorkspaceSizeSelectDialog from '@/components/workspace/WorkspaceSizeSelectDialog'
import WorkspaceExportDialog from '@/components/workspace/WorkspaceExportDialog'
import WorkspaceBatchConfirmDialog from '@/components/workspace/WorkspaceBatchConfirmDialog'
import WorkspaceGenerationConfigDialog from '@/components/workspace/WorkspaceGenerationConfigDialog'
import { QueueStatusBadge } from '@/components/QueueStatusBadge'

export interface WorkspaceTask {
  id: number
  title: string
  theme_prompt: string
  template_id: number | null
  template_name: string | null
  status: 'generating' | 'completed' | 'failed'
  card_count: number
  thumbnail_url?: string | null
  thumbnail_urls?: string[] | null
  completed_image_count?: number
  generating_image_count?: number
  failed_image_count?: number
  is_pinned?: number
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface PromptCard {
  id: number
  task_id: number
  card_index: number
  prompt: string
  selected_image_id: number | null
  sel_img_id: number | null
  sel_img_url: string | null
  sel_img_model_name: string | null
  sel_img_size: string | null
  sel_img_started_at?: string | null
  sel_img_completed_at?: string | null
  sel_img_created_at?: string | null
  created_at: string
  updated_at: string
}

export interface CardImage {
  id: number
  card_id: number
  image_api_id: number | null
  image_url: string
  model_name?: string | null
  size: string | null
  format: string
  status: 'pending' | 'generating' | 'completed' | 'failed'
  error_message: string | null
  is_selected: number
  generation_started_at?: string | null
  generation_completed_at?: string | null
  created_at: string
}

interface TaskCardImagesPayload {
  cards: Record<number, {
    card_id: number
    pending_count: number
    completed_count: number
    failed_count: number
    selected_image: {
      id: number
      image_url: string
      model_name: string | null
      size: string | null
      started_at: string | null
      completed_at: string | null
      created_at: string
    } | null
    images: CardImage[]
  }>
}

export interface Template {
  id: number
  type: 'fission' | 'deepen' | 'regenerate' | 'extract'
  name: string
  content: string
  chat_api_id: number
  api_name: string | null
  fission_count: number | null
  created_at: string
}

export interface ImageModel {
  id: number
  name: string
  display_name: string | null
  supported_sizes: { ratios: { ratio: string; width: number; height: number }[] } | null
  icon_url: string | null
}

const SIDEBAR_WIDTH = 280
const GENERATION_CONFIG_STORAGE_KEY = 'workspace:generation-config'
const WORKSPACE_CARDS_PAGE_SIZE = 500

function TaskSidebarSkeleton() {
  return (
    <div className="flex flex-col">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="px-2 py-1.5">
          <div className="rounded-xl border border-border/60 bg-background/70 px-3 py-3">
            <div className="flex items-start gap-3">
              <Skeleton className="h-12 w-12 rounded-lg shrink-0" />
              <div className="flex-1 space-y-2.5 pt-0.5">
                <Skeleton className="h-3.5 w-4/5" />
                <Skeleton className="h-3 w-2/3" />
                <div className="flex items-center gap-2 pt-1">
                  <Skeleton className="h-5 w-12 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

interface StoredGenerationConfig {
  fissionTemplate: Template | null
  refineTemplate: Template | null
  regenTemplate: Template | null
  imageModel: ImageModel | null
  size: string | null
}

function loadStoredGenerationConfig(): StoredGenerationConfig {
  const emptyConfig = { fissionTemplate: null, refineTemplate: null, regenTemplate: null, imageModel: null, size: null }
  if (typeof window === 'undefined') return emptyConfig

  try {
    const raw = localStorage.getItem(GENERATION_CONFIG_STORAGE_KEY)
    if (!raw) return emptyConfig
    return { ...emptyConfig, ...JSON.parse(raw) }
  } catch {
    return emptyConfig
  }
}

function saveStoredGenerationConfig(config: StoredGenerationConfig) {
  if (typeof window === 'undefined') return
  localStorage.setItem(GENERATION_CONFIG_STORAGE_KEY, JSON.stringify(config))
}

export function mergeCardsWithImageSummary(
  fetchedCards: PromptCard[],
  payload: TaskCardImagesPayload,
  previousCards: PromptCard[] = []
): PromptCard[] {
  const previousCardMap = new Map(previousCards.map(card => [card.id, card]))

  return fetchedCards.map(card => {
    const summary = payload.cards[card.id]
    const selected = summary?.selected_image
    const previousCard = previousCardMap.get(card.id)

    if (!selected) {
      if (!previousCard) return card
      return {
        ...previousCard,
        ...card,
        selected_image_id: card.selected_image_id ?? previousCard.selected_image_id,
        sel_img_id: card.sel_img_id ?? previousCard.sel_img_id,
        sel_img_url: card.sel_img_url ?? previousCard.sel_img_url,
        sel_img_model_name: card.sel_img_model_name ?? previousCard.sel_img_model_name,
        sel_img_size: card.sel_img_size ?? previousCard.sel_img_size,
        sel_img_started_at: card.sel_img_started_at ?? previousCard.sel_img_started_at,
        sel_img_completed_at: card.sel_img_completed_at ?? previousCard.sel_img_completed_at,
        sel_img_created_at: card.sel_img_created_at ?? previousCard.sel_img_created_at,
      }
    }

    return {
      ...previousCard,
      ...card,
      selected_image_id: selected.id,
      sel_img_id: selected.id,
      sel_img_url: selected.image_url,
      sel_img_model_name: selected.model_name,
      sel_img_size: selected.size,
      sel_img_started_at: selected.started_at,
      sel_img_completed_at: selected.completed_at,
      sel_img_created_at: selected.created_at,
    }
  })
}

function buildCardImagesMap(payload: TaskCardImagesPayload, fallbackMap?: Map<number, CardImage[]>): Map<number, CardImage[]> {
  const next = new Map<number, CardImage[]>()
  Object.values(payload.cards).forEach(summary => {
    next.set(summary.card_id, summary.images || [])
  })
  if (fallbackMap) {
    for (const [cardId, images] of fallbackMap.entries()) {
      if (!next.has(cardId)) next.set(cardId, images)
    }
  }
  return next
}

const statusConfig = {
  generating: { label: '生成中', icon: Loader2, className: 'text-amber-600 bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800', spin: true },
  completed: { label: '已完成', icon: CheckCircle2, className: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800', spin: false },
  failed: { label: '未完成', icon: XCircle, className: 'text-red-600 bg-red-50 dark:bg-red-950/30 border-red-200 dark:border-red-800', spin: false },
}

const TaskCard = memo(function TaskCard({ task, isActive, isPinned, onClick, onPin, onDelete }: {
  task: WorkspaceTask
  isActive: boolean
  isPinned: boolean
  onClick: () => void
  onPin: (id: number) => void
  onDelete: (id: number) => void
}) {
  const { label, icon: Icon, className, spin } = statusConfig[task.status]
  const thumbnailUrls = task.thumbnail_urls?.length ? task.thumbnail_urls.slice(0, 3) : task.thumbnail_url ? [task.thumbnail_url] : []
  const hasThumbnail = thumbnailUrls.length > 0
  const stackLayers = [
    'translate-x-2 translate-y-2 rotate-0',
    'translate-x-1 translate-y-1 -rotate-6',
    'translate-x-0 translate-y-0 -rotate-12',
  ]

  // 计算细分状态：生成中优先，其次失败
  const generatingCount = task.generating_image_count || 0
  const failedCount = task.failed_image_count || 0
  const hasGenerating = generatingCount > 0
  const hasFailed = failedCount > 0
  const subStatus = hasGenerating ? 'generating' : hasFailed ? 'failed' : null

  return (
    <div
      onClick={onClick}
      className={cn(
        'group relative px-3 py-2.5 rounded-xl cursor-pointer transition-colors border',
        isActive
          ? 'bg-primary/8 border-primary/30 text-foreground'
          : isPinned
            ? 'bg-amber-50/50 border-amber-200/70 text-foreground dark:bg-amber-950/20 dark:border-amber-900/60'
            : 'border-transparent hover:bg-accent hover:border-border text-muted-foreground hover:text-foreground',
      )}
    >
      <div className={cn('absolute right-2 top-2 flex items-center gap-1 transition-all shrink-0', isPinned ? 'opacity-100' : 'opacity-0 group-hover:opacity-100')}>
        <button
          onClick={(e) => { e.stopPropagation(); onPin(task.id) }}
          className={cn('text-muted-foreground hover:text-foreground transition-colors', isPinned && 'text-amber-500 hover:text-amber-600')}
          aria-label={isPinned ? '取消置顶' : '置顶任务'}
          title={isPinned ? '取消置顶' : '置顶'}
        >
          <Pin className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(task.id) }}
          className="text-muted-foreground hover:text-destructive transition-colors"
          aria-label="删除任务"
          title="删除"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex gap-3">
        <div className="group/image-stack relative h-16 w-16 shrink-0">
          {stackLayers.map((layerClass, index) => {
            const imageIndex = index - (stackLayers.length - thumbnailUrls.length)
            const layerImageUrl = imageIndex >= 0 ? thumbnailUrls[imageIndex] : undefined
            const isTopLayer = index === stackLayers.length - 1

            return (
            <div
              key={layerClass}
              className={cn(
                'absolute left-0 top-0 flex h-14 w-14 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted shadow-sm transition-transform duration-200 ease-out',
                layerClass,
                isTopLayer && 'group-hover/image-stack:scale-[1.03] group-hover/image-stack:shadow-md',
                !isTopLayer && 'opacity-80',
              )}
            >
              {layerImageUrl ? (
                <img src={layerImageUrl} alt={isTopLayer ? task.title : ''} className="h-full w-full object-cover" loading="lazy" />
              ) : isTopLayer && !hasThumbnail && (
                <div className="text-xl font-semibold leading-none text-foreground">{task.card_count}</div>
              )}
            </div>
            )
          })}
        </div>

        <div className="min-w-0 flex-1 pr-1">
          <div className="text-sm font-medium truncate leading-5">{task.title}</div>
          <div className="mt-1 truncate text-xs leading-4 text-muted-foreground">
            {task.theme_prompt || '暂无主题提示词'}
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground shrink-0 mr-auto">
              {new Date(task.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
            </span>
            <div className="flex items-center gap-1 shrink-0">
              {/* 细分状态图标（只显示图标） */}
              {subStatus && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger render={<span />}>
                      <span
                        className={cn(
                          'inline-flex h-5 w-5 items-center justify-center rounded-full shrink-0',
                          subStatus === 'generating'
                            ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                            : 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
                        )}
                      >
                        {subStatus === 'generating' ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <AlertCircle className="h-3 w-3" />
                        )}
                      </span>
                    </TooltipTrigger>
                    <TooltipContent side="top">
                      {subStatus === 'generating' ? `${generatingCount} 张图片生成中` : `${failedCount} 张图片生成失败`}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {/* 任务级状态标签 */}
              <span className={cn('inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border font-medium shrink-0', className)}>
                <Icon className={cn('h-2.5 w-2.5', spin && 'animate-spin')} />
                {label}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
})

export default function WorkspacePage() {

  const [tasks, setTasks] = useState<WorkspaceTask[]>([])
  const [loadingTasks, setLoadingTasks] = useState(false)
  const [queueStatus, setQueueStatus] = useState({ queued: 0, processing: 0 })
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set())
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [taskPage, setTaskPage] = useState(1)
  const [hasMoreTasks, setHasMoreTasks] = useState(false)

  const [activeTaskId, setActiveTaskId] = useState<number | null>(null)
  const [activeTask, setActiveTask] = useState<WorkspaceTask | null>(null)

  const [cards, setCards] = useState<PromptCard[]>([])
  const [cardImagesMap, setCardImagesMap] = useState<Map<number, CardImage[]>>(new Map())
  const [loadingCards, setLoadingCards] = useState(false)

  const [batchMode, setBatchMode] = useState(false)
  const [selectedCardIds, setSelectedCardIds] = useState<Set<number>>(new Set())
  const [flipAllToImage, setFlipAllToImage] = useState(false)

  const [selectedFissionTemplate, setSelectedFissionTemplate] = useState<Template | null>(() => loadStoredGenerationConfig().fissionTemplate)
  const [selectedDeepenTemplate, setSelectedDeepenTemplate] = useState<Template | null>(() => loadStoredGenerationConfig().refineTemplate)
  const [selectedRegenTemplate, setSelectedRegenTemplate] = useState<Template | null>(() => loadStoredGenerationConfig().regenTemplate)
  const [selectedImageModel, setSelectedImageModel] = useState<ImageModel | null>(() => loadStoredGenerationConfig().imageModel)
  const [selectedSize, setSelectedSize] = useState<string | null>(() => loadStoredGenerationConfig().size)

  const [showNewTask, setShowNewTask] = useState(false)
  const [showFissionTemplateDialog, setShowFissionTemplateDialog] = useState(false)
  const [showDeepenTemplateDialog, setShowDeepenTemplateDialog] = useState(false)
  const [showRegenTemplateDialog, setShowRegenTemplateDialog] = useState(false)
  const [showModelDialog, setShowModelDialog] = useState(false)
  const [showSizeDialog, setShowSizeDialog] = useState(false)
  const [showGenerationConfigDialog, setShowGenerationConfigDialog] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [batchConfirm, setBatchConfirm] = useState<{ action: string; count: number; onConfirm: () => void } | null>(null)
  const [deleteConfirmTask, setDeleteConfirmTask] = useState<WorkspaceTask | null>(null)

  // 批量操作加载状态：记录哪些卡片正在执行批量操作
  const [batchDeepeningCardIds, setBatchDeepeningCardIds] = useState<Set<number>>(new Set())
  const [batchRegeneratingCardIds, setBatchRegeneratingCardIds] = useState<Set<number>>(new Set())
  const [batchGeneratingImageCardIds, setBatchGeneratingImageCardIds] = useState<Set<number>>(new Set())
  // 单张生图状态：记录哪些卡片正在单独生图
  const [generatingImageCardIds, setGeneratingImageCardIds] = useState<Set<number>>(new Set())

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const cardImagesPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const taskRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const batchPollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const [showSidebar, setShowSidebar] = useState(true)
  const [showScrollToTop, setShowScrollToTop] = useState(false)
  const cardScrollContainerRef = useRef<HTMLDivElement | null>(null)

  const handleScrollToTop = useCallback(() => {
    cardScrollContainerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }, [])

  useEffect(() => {
    const container = cardScrollContainerRef.current
    if (!container) return

    const handleScroll = () => {
      setShowScrollToTop(container.scrollTop > 240)
    }

    handleScroll()
    container.addEventListener('scroll', handleScroll)
    return () => container.removeEventListener('scroll', handleScroll)
  }, [activeTaskId, cards.length, loadingCards])

  const sortedTasks = useMemo(() => {
    return [...tasks].sort((a, b) => Number(pinnedIds.has(b.id)) - Number(pinnedIds.has(a.id)))
  }, [tasks, pinnedIds])

  const fetchPinnedIds = useCallback(async () => {
    try {
      const res = await apiFetch('/api/workspace/tasks/pinned')
      const data = await res.json()
      setPinnedIds(new Set(data.pinned_ids || []))
    } catch (e) {
      console.error('获取置顶任务失败:', e)
    }
  }, [])

  const fetchTasks = useCallback(async (page = 1, append = false) => {
    setLoadingTasks(true)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '20' })
      if (statusFilter !== 'all') params.set('status', statusFilter)
      if (searchQuery) params.set('search', searchQuery)

      const res = await apiFetch(`/api/workspace/tasks?${params}`)
      const data = await res.json()
      if (append) {
        setTasks(prev => [...prev, ...(data.tasks || [])])
      } else {
        setTasks(data.tasks || [])
      }
      setHasMoreTasks((data.tasks?.length || 0) === 20)
    } catch {
      toast.error('获取任务列表失败')
    } finally {
      setLoadingTasks(false)
    }
  }, [statusFilter, searchQuery])

  const fetchQueueStatus = useCallback(async () => {
    try {
      const data = await apiFetch('/api/tasks/queue').then(r => r.json())
      setQueueStatus({
        queued: Number(data.queued || 0),
        processing: Number(data.processing || 0),
      })
    } catch {}
  }, [])

  const fetchTaskCardImages = useCallback(async (taskId: number) => {
    const res = await apiFetch(`/api/workspace/tasks/${taskId}/card-images`)
    return await res.json() as TaskCardImagesPayload
  }, [])

  const fetchCards = useCallback(async (taskId: number) => {
    setLoadingCards(true)
    try {
      const [cardsRes, imagesData] = await Promise.all([
        apiFetch(`/api/workspace/tasks/${taskId}/cards?page_size=${WORKSPACE_CARDS_PAGE_SIZE}`),
        fetchTaskCardImages(taskId),
      ])
      const data = await cardsRes.json()
      const fetchedCards: PromptCard[] = data.cards || []
      setCards(prev => mergeCardsWithImageSummary(fetchedCards, imagesData, prev))
      setCardImagesMap(buildCardImagesMap(imagesData, cardImagesMap))
    } catch {
      toast.error('获取卡片列表失败')
    } finally {
      setLoadingCards(false)
    }
  }, [cardImagesMap, fetchTaskCardImages])

  const pollTaskStatus = useCallback(async (taskId: number) => {
    try {
      const res = await apiFetch(`/api/workspace/tasks/${taskId}/status`)
      const data = await res.json()
      if (data.status === 'completed' || data.status === 'failed') {
        if (pollingRef.current) clearInterval(pollingRef.current)
        pollingRef.current = null
        await fetchTasks(1)
        if (data.status === 'completed') {
          await fetchCards(taskId)
          setActiveTask(prev => prev ? { ...prev, status: data.status, card_count: data.card_count } : prev)
        }
      }
    } catch (e) {
      // 轮询失败不中断，下次间隔会重试；仅记录日志
      console.error('轮询任务状态失败:', e)
    }
  }, [fetchTasks, fetchCards])

  // 统一轮询卡片图片状态：一次请求获取所有卡片数据，避免 N 个独立轮询
  const pollCardImages = useCallback(async () => {
    if (!activeTaskId) return
    try {
      const [cardsRes, imagesData] = await Promise.all([
        apiFetch(`/api/workspace/tasks/${activeTaskId}/cards?page_size=${WORKSPACE_CARDS_PAGE_SIZE}`),
        fetchTaskCardImages(activeTaskId),
      ])
      const data = await cardsRes.json()
      const fetchedCards: PromptCard[] = data.cards || []
      const newImagesMap = buildCardImagesMap(imagesData, cardImagesMap)

      setCards(prev => mergeCardsWithImageSummary(fetchedCards, imagesData, prev))
      setCardImagesMap(newImagesMap)

      // 检查是否还有 pending/generating 的图片，如果没有则停止轮询
      let hasAnyPending = false
      for (const summary of Object.values(imagesData.cards)) {
        if (summary.pending_count > 0) {
          hasAnyPending = true
          break
        }
      }
      if (!hasAnyPending && cardImagesPollRef.current) {
        clearInterval(cardImagesPollRef.current)
        cardImagesPollRef.current = null
        setGeneratingImageCardIds(new Set())
        setBatchGeneratingImageCardIds(new Set())
        void fetchTasks(1)
        void fetchQueueStatus()
      }

      // 清除已完成的单张生图状态
      setGeneratingImageCardIds(prev => {
        const next = new Set(prev)
        for (const card of fetchedCards) {
          const summary = imagesData.cards[card.id]
          if (!summary || summary.pending_count === 0) next.delete(card.id)
        }
        if (next.size === prev.size) return prev
        return next
      })
    } catch {
      // 轮询失败不中断
    }
  }, [activeTaskId, cardImagesMap, fetchTaskCardImages])

  // 启动/停止卡片图片轮询
  const startCardImagesPoll = useCallback(() => {
    if (cardImagesPollRef.current) {
      clearInterval(cardImagesPollRef.current)
    }
    pollCardImages()
    cardImagesPollRef.current = setInterval(pollCardImages, 3000)
  }, [pollCardImages])

  const stopCardImagesPoll = useCallback(() => {
    if (cardImagesPollRef.current) {
      clearInterval(cardImagesPollRef.current)
      cardImagesPollRef.current = null
    }
  }, [])

  useEffect(() => {
    fetchTasks(1)
    fetchPinnedIds()
    fetchQueueStatus()
    const interval = setInterval(() => {
      fetchQueueStatus()
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchTasks, fetchPinnedIds, fetchQueueStatus])

  // 使用 ref 存储最新的回调，避免 useEffect 依赖导致的无限循环
  const fetchCardsRef = useRef(fetchCards)
  const pollTaskStatusRef = useRef(pollTaskStatus)
  const stopCardImagesPollRef = useRef(stopCardImagesPoll)
  useEffect(() => { fetchCardsRef.current = fetchCards })
  useEffect(() => { pollTaskStatusRef.current = pollTaskStatus })
  useEffect(() => { stopCardImagesPollRef.current = stopCardImagesPoll })

  useEffect(() => {
    if (activeTaskId) {
      const task = tasks.find(t => t.id === activeTaskId)
      if (task) setActiveTask(task)
      fetchCardsRef.current(activeTaskId)
      setSelectedCardIds(new Set())
      setGeneratingImageCardIds(new Set())
      setBatchDeepeningCardIds(new Set())
      setBatchRegeneratingCardIds(new Set())
      setBatchGeneratingImageCardIds(new Set())

      if (pollingRef.current) clearInterval(pollingRef.current)
      if (task?.status === 'generating') {
        pollingRef.current = setInterval(() => pollTaskStatusRef.current(activeTaskId), 3000)
      }
    } else {
      stopCardImagesPollRef.current()
      setGeneratingImageCardIds(new Set())
      setBatchDeepeningCardIds(new Set())
      setBatchRegeneratingCardIds(new Set())
      setBatchGeneratingImageCardIds(new Set())
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [activeTaskId])

  useEffect(() => {
    if (!activeTaskId) return
    const task = tasks.find(t => t.id === activeTaskId)
    if (task) setActiveTask(task)
    if (task?.status === 'generating') {
      if (!pollingRef.current) {
        pollingRef.current = setInterval(() => pollTaskStatusRef.current(activeTaskId), 3000)
      }
    } else {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null }
    }
  }, [tasks, activeTaskId])

  // 清理轮询
  useEffect(() => {
    return () => {
      if (batchPollRef.current) {
        clearInterval(batchPollRef.current)
        batchPollRef.current = null
      }
      if (cardImagesPollRef.current) {
        clearInterval(cardImagesPollRef.current)
        cardImagesPollRef.current = null
      }
    }
  }, [])

  const handleSearch = (val: string) => {
    setSearchQuery(val)
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current)
    searchTimeoutRef.current = setTimeout(() => {
      setTaskPage(1)
    }, 400)
  }

  const handleTaskSelect = (task: WorkspaceTask) => {
    setBatchMode(false)
    setSelectedCardIds(new Set())
    setActiveTaskId(task.id)
  }

  const handleDeleteTask = async (taskId: number) => {
    try {
      const res = await apiFetch(`/api/workspace/tasks/${taskId}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      toast.success('任务已删除')
      setTasks(prev => prev.filter(t => t.id !== taskId))
      setPinnedIds(prev => { const next = new Set(prev); next.delete(taskId); return next })
      if (activeTaskId === taskId) {
        setActiveTaskId(null)
        setActiveTask(null)
        setCards([])
        setCardImagesMap(new Map())
        setGeneratingImageCardIds(new Set())
        setBatchDeepeningCardIds(new Set())
        setBatchRegeneratingCardIds(new Set())
        setBatchGeneratingImageCardIds(new Set())
      }
      void fetchQueueStatus()
    } catch {
      toast.error('删除任务失败')
    }
  }

  const handleRequestDeleteTask = (taskId: number) => {
    const task = tasks.find(t => t.id === taskId)
    if (task) setDeleteConfirmTask(task)
  }

  const handlePinTask = async (taskId: number) => {
    const isPinned = pinnedIds.has(taskId)
    try {
      const res = await apiFetch(`/api/workspace/tasks/${taskId}/pin`, {
        method: isPinned ? 'DELETE' : 'POST',
      })
      if (!res.ok) throw new Error()
      setPinnedIds(prev => {
        const next = new Set(prev)
        if (isPinned) next.delete(taskId)
        else next.add(taskId)
        return next
      })
    } catch {
      toast.error(isPinned ? '取消置顶失败' : '置顶失败')
    }
  }

  const handleTaskCreated = (task: WorkspaceTask, config?: { fissionTemplate: Template | null; refineTemplate: Template | null; regenTemplate: Template | null; imageModel: ImageModel | null; size: string | null }) => {
    if (config) {
      const nextConfig = {
        fissionTemplate: config.fissionTemplate ?? selectedFissionTemplate,
        refineTemplate: config.refineTemplate ?? selectedDeepenTemplate,
        regenTemplate: config.regenTemplate ?? selectedRegenTemplate,
        imageModel: config.imageModel ?? selectedImageModel,
        size: config.size ?? selectedSize,
      }
      setSelectedFissionTemplate(nextConfig.fissionTemplate)
      setSelectedDeepenTemplate(nextConfig.refineTemplate)
      setSelectedRegenTemplate(nextConfig.regenTemplate)
      setSelectedImageModel(nextConfig.imageModel)
      setSelectedSize(nextConfig.size)
      saveStoredGenerationConfig(nextConfig)
    }
    setTasks(prev => [task, ...prev])
    setActiveTaskId(task.id)
    setActiveTask(task)
    setCards([])
    setShowNewTask(false)
    // 清理已有轮询再启动新轮询，避免多个 interval 并行
    if (pollingRef.current) clearInterval(pollingRef.current)
    pollingRef.current = setInterval(() => pollTaskStatus(task.id), 3000)
  }

  const handleCardUpdated = (updatedCard: PromptCard) => {
    setCards(prev => prev.map(c => c.id === updatedCard.id ? updatedCard : c))
    // 卡片图片状态变化时，防抖刷新任务列表以更新细分状态
    if (taskRefreshTimeoutRef.current) clearTimeout(taskRefreshTimeoutRef.current)
    taskRefreshTimeoutRef.current = setTimeout(() => fetchTasks(1), 500)
  }

  const handleCardDeleted = (cardId: number) => {
    setCards(prev => prev.filter(c => c.id !== cardId))
    setSelectedCardIds(prev => { const next = new Set(prev); next.delete(cardId); return next })
  }

  const handleAddCard = async (prompt: string) => {
    if (!activeTaskId) return
    try {
      const res = await apiFetch(`/api/workspace/tasks/${activeTaskId}/cards`, {
        method: 'POST',
        body: { prompt },
      })
      if (!res.ok) throw new Error()
      const newCard = await res.json()
      setCards(prev => [...prev, newCard])
      setTasks(prev => prev.map(t => t.id === activeTaskId ? { ...t, card_count: t.card_count + 1 } : t))
      toast.success('卡片已添加')
      return newCard
    } catch {
      toast.error('添加卡片失败')
      return null
    }
  }

  const toggleCardSelection = (cardId: number) => {
    setSelectedCardIds(prev => {
      const next = new Set(prev)
      if (next.has(cardId)) next.delete(cardId)
      else next.add(cardId)
      return next
    })
  }

  // 处理单张生图状态变化：启动统一轮询
  const handleCardGeneratingImage = (cardId: number, generating: boolean) => {
    setGeneratingImageCardIds(prev => {
      const next = new Set(prev)
      if (generating) next.add(cardId)
      else next.delete(cardId)
      return next
    })
    // 有新的生图任务时，启动统一轮询
    if (generating && !cardImagesPollRef.current) {
      startCardImagesPoll()
    }
  }

  // 轮询批量操作后的卡片状态，逐卡片检查，完成的卡片立即清除加载状态
  // type: 'image' 轮询图片状态（pending/generating 为0时完成）
  //       'prompt' 轮询提示词（提示词内容变化后完成）
  const startBatchPoll = useCallback((cardIds: number[], type: 'image' | 'prompt') => {
    if (batchPollRef.current) {
      clearInterval(batchPollRef.current)
      batchPollRef.current = null
    }
    // 记录原始提示词，用于 prompt 类型对比
    const originalPrompts = new Map<number, string>()
    // 使用当前的 cards 状态来获取原始提示词
    const currentCards = cards
    for (const card of currentCards) {
      if (cardIds.includes(card.id)) {
        originalPrompts.set(card.id, card.prompt)
      }
    }

    const MAX_POLL_COUNT = 100 // 最多轮询 100 次（5 分钟）
    const remainingImageIds = new Set(cardIds)

    const poll = async () => {
      try {
        if (!activeTaskId) return

        if (type === 'image') {
          let hasAnyPending = false
          const activeIds = [...remainingImageIds]
          const imagesData = await fetchTaskCardImages(activeTaskId)

          setCardImagesMap(prev => buildCardImagesMap(imagesData, prev))
          setCards(prev => mergeCardsWithImageSummary(prev, imagesData))

          for (const cardId of activeIds) {
            const summary = imagesData.cards[cardId]
            const pending = summary?.pending_count ?? 1
            if (pending > 0) {
              hasAnyPending = true
            } else {
              // 该卡片没有 pending 图片，清除其加载状态
              setBatchGeneratingImageCardIds(prev => {
                const next = new Set(prev)
                next.delete(cardId)
                return next
              })
              remainingImageIds.delete(cardId)
            }
          }

          // 如果所有卡片都完成，停止轮询
          if (!hasAnyPending || remainingImageIds.size === 0) {
            if (batchPollRef.current) {
              clearInterval(batchPollRef.current)
              batchPollRef.current = null
            }
            void fetchTasks(1)
          }
        } else {
          // prompt 类型：逐卡片检查提示词是否变化，只更新参与批量操作的卡片
          const res = await apiFetch(`/api/workspace/tasks/${activeTaskId}/cards?page_size=${WORKSPACE_CARDS_PAGE_SIZE}`)
          const data = await res.json()
          const newCards: PromptCard[] = data.cards || []

          let hasAnyPending = false
          for (const newCard of newCards) {
            if (!cardIds.includes(newCard.id)) continue
            const original = originalPrompts.get(newCard.id)
            if (original === undefined) continue
            if (newCard.prompt !== original) {
              // 该卡片提示词已变化，清除其加载状态，只更新该卡片
              setBatchDeepeningCardIds(prev => {
                const next = new Set(prev)
                next.delete(newCard.id)
                return next
              })
              setBatchRegeneratingCardIds(prev => {
                const next = new Set(prev)
                next.delete(newCard.id)
                return next
              })
              setCards(prev => prev.map(c =>
                c.id === newCard.id ? newCard : c
              ))
            } else {
              hasAnyPending = true
            }
          }
          // 如果所有卡片都完成，停止轮询
          if (!hasAnyPending) {
            if (batchPollRef.current) {
              clearInterval(batchPollRef.current)
              batchPollRef.current = null
            }
          }
        }
      } catch {
        // 轮询失败不中断，下次间隔重试
      }
    }

    // 立即执行一次，然后每 3 秒轮询
    poll()
    let pollCount = 0
    batchPollRef.current = setInterval(() => {
      pollCount++
      if (pollCount >= MAX_POLL_COUNT) {
        // 兜底：最长轮询 5 分钟
        if (batchPollRef.current) {
          clearInterval(batchPollRef.current)
          batchPollRef.current = null
        }
        setBatchDeepeningCardIds(new Set())
        setBatchRegeneratingCardIds(new Set())
        setBatchGeneratingImageCardIds(new Set())
        setGeneratingImageCardIds(new Set())
        void fetchTasks(1)
        void fetchQueueStatus()
      } else {
        poll()
      }
    }, 3000)
  }, [activeTaskId, cards, cardImagesMap, fetchTaskCardImages, fetchTasks])

  const handleBatchDelete = async () => {
    const ids = [...selectedCardIds]
    try {
      const res = await apiFetch('/api/workspace/cards/batch-delete', {
        method: 'POST',
        body: { card_ids: ids },
      })
      if (!res.ok) throw new Error()
      toast.success(`已删除 ${ids.length} 张卡片`)
      setCards(prev => prev.filter(c => !ids.includes(c.id)))
      setSelectedCardIds(new Set())
      setGeneratingImageCardIds(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.delete(id))
        return next
      })
      setBatchDeepeningCardIds(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.delete(id))
        return next
      })
      setBatchRegeneratingCardIds(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.delete(id))
        return next
      })
      setBatchGeneratingImageCardIds(prev => {
        const next = new Set(prev)
        ids.forEach(id => next.delete(id))
        return next
      })
      setTasks(prev => prev.map(t => t.id === activeTaskId ? { ...t, card_count: t.card_count - ids.length } : t))
      void fetchQueueStatus()
    } catch {
      toast.error('批量删除失败')
    }
  }

  const handleBatchGenerateImage = async () => {
    if (!selectedImageModel || !selectedSize) {
      toast.error('请先选择图片模型和尺寸')
      return
    }
    const ids = [...selectedCardIds]
    setBatchGeneratingImageCardIds(new Set(ids))
    try {
      const res = await apiFetch('/api/workspace/cards/batch-generate-image', {
        method: 'POST',
        body: { card_ids: ids, api_id: selectedImageModel.id, size: selectedSize },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '批量生图提交失败')

      const submittedCount = Number(data.submitted || 0)
      const errors = Array.isArray(data.errors) ? data.errors : []
      const successCardIds = ids.filter(id => !errors.some((item: { card_id: number }) => item.card_id === id))

      if (submittedCount > 0 && errors.length > 0) {
        toast.warning(`已提交 ${submittedCount} 张，${errors.length} 张失败`)
      } else if (submittedCount > 0) {
        toast.success(`已提交 ${submittedCount} 张卡片的生图任务`)
      } else {
        throw new Error(errors[0]?.error || '批量生图提交失败')
      }

      setSelectedCardIds(new Set())
      setBatchMode(false)
      void fetchQueueStatus()
      if (successCardIds.length > 0) {
        setBatchGeneratingImageCardIds(new Set(successCardIds))
        startBatchPoll(successCardIds, 'image')
      } else {
        setBatchGeneratingImageCardIds(new Set())
      }
    } catch (err) {
      toast.error((err as Error).message || '批量生图提交失败')
      setBatchGeneratingImageCardIds(new Set())
    }
  }

  const handleBatchDeepen = async () => {
    if (!selectedDeepenTemplate) {
      toast.error('请先选择细化模板')
      return
    }
    const ids = [...selectedCardIds]
    setBatchDeepeningCardIds(new Set(ids))
    try {
      const res = await apiFetch('/api/workspace/cards/batch-deepen', {
        method: 'POST',
        body: { card_ids: ids, template_id: selectedDeepenTemplate.id },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '批量细化失败')
      toast.success(`已提交 ${data.submitted || ids.length} 张卡片的细化任务`)
      setSelectedCardIds(new Set())
      setBatchMode(false)
      // 启动轮询：批量细化后需要轮询卡片状态
      startBatchPoll(ids, 'prompt')
    } catch (err) {
      toast.error((err as Error).message || '批量细化提交失败')
      setBatchDeepeningCardIds(new Set())
    }
  }

  const handleBatchRegeneratePrompt = async () => {
    if (!selectedRegenTemplate) {
      toast.error('请先选择重新生成模板')
      return
    }
    const ids = [...selectedCardIds]
    setBatchRegeneratingCardIds(new Set(ids))
    try {
      const res = await apiFetch('/api/workspace/cards/batch-regenerate-prompt', {
        method: 'POST',
        body: { card_ids: ids, template_id: selectedRegenTemplate.id },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '批量重新生成失败')
      toast.success(`已提交 ${data.submitted || ids.length} 张卡片的重新生成任务`)
      setSelectedCardIds(new Set())
      setBatchMode(false)
      // 启动轮询：批量重新生成后需要轮询卡片状态
      startBatchPoll(ids, 'prompt')
    } catch (err) {
      toast.error((err as Error).message || '批量重新生成提交失败')
      setBatchRegeneratingCardIds(new Set())
    }
  }

  return (
    <div className="flex h-full">
      {showSidebar && (
      <aside
        className="flex flex-col border-r border-border bg-sidebar/20 shrink-0"
        style={{ width: SIDEBAR_WIDTH }}
      >
        <div className="flex items-center justify-between px-3 h-12 border-b border-border shrink-0">
          <span className="text-sm font-semibold">批量生图</span>
          <div className="flex items-center gap-1">
            <QueueStatusBadge queued={queueStatus.queued} processing={queueStatus.processing} />
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={() => setShowSidebar(false)}
              className="text-muted-foreground ml-1"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="px-3 py-2.5 space-y-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="搜索任务..."
              value={searchQuery}
              onChange={e => handleSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          <div className="flex gap-1">
            {(['all', 'generating', 'completed', 'failed'] as const).map(s => (
              <button
                key={s}
                onClick={() => { setStatusFilter(s); setTaskPage(1) }}
                className={cn(
                  'flex-1 text-[10px] py-1 rounded-lg transition-colors border',
                  statusFilter === s
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'text-muted-foreground border-border hover:bg-accent',
                )}
              >
                {{ all: '全部', generating: '生成中', completed: '完成', failed: '失败' }[s]}
              </button>
            ))}
          </div>

          <Button size="sm" className="w-full h-8 gap-1.5 text-xs rounded-xl" onClick={() => setShowNewTask(true)}>
            <Plus className="h-3.5 w-3.5" />
            新建任务
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
          {loadingTasks && tasks.length === 0 ? (
            <TaskSidebarSkeleton />
          ) : tasks.length === 0 ? (
            <div className="text-center text-muted-foreground text-xs py-8 px-4">
              暂无任务，点击「新建任务」开始
            </div>
          ) : (
            <>
              {sortedTasks.map(task => (
                <TaskCard
                  key={task.id}
                  task={task}
                  isActive={task.id === activeTaskId}
                  isPinned={pinnedIds.has(task.id)}
                  onClick={() => handleTaskSelect(task)}
                  onPin={handlePinTask}
                  onDelete={handleRequestDeleteTask}
                />
              ))}
              {hasMoreTasks && (
                <button
                  onClick={() => { const next = taskPage + 1; setTaskPage(next); fetchTasks(next, true) }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground py-2 flex items-center justify-center gap-1"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                  加载更多
                </button>
              )}
            </>
          )}
        </div>
      </aside>
      )}

      <main className="relative flex-1 min-w-0 flex flex-col overflow-hidden">
        {!activeTaskId ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            {!showSidebar && (
              <Button
                variant="outline"
                onClick={() => setShowSidebar(true)}
                className="absolute left-4 top-4 gap-1.5 px-3 py-1.5 shadow-sm z-10"
              >
                <PanelLeftOpen className="h-4 w-4" />
                <span>任务列表</span>
              </Button>
            )}
            <div className="text-center space-y-2">
              <ImagePlus className="h-12 w-12 mx-auto opacity-20" />
              <p className="text-sm">选择左侧任务，或新建任务开始工作</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border bg-background/80 backdrop-blur-sm shrink-0 flex-wrap">
              {!showSidebar && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSidebar(true)}
                  className="h-7 text-xs gap-1 mr-1 rounded-lg"
                >
                  <PanelLeftOpen className="h-3.5 w-3.5" />
                  任务列表
                </Button>
              )}
              <Button
                size="sm"
                className="h-7 text-xs gap-1 rounded-lg mr-4 bg-blue-600 text-white hover:bg-blue-700"
                onClick={() => setShowGenerationConfigDialog(true)}
              >
                生成配置
                <span className="max-w-[180px] truncate text-white/80">
                  {selectedDeepenTemplate || selectedImageModel || selectedSize
                    ? [selectedDeepenTemplate?.name, selectedImageModel?.display_name || selectedImageModel?.name, selectedSize].filter(Boolean).join(' / ')
                    : '未选择'}
                </span>
                <ChevronDown className="h-3 w-3" />
              </Button>

              <div className="flex items-center gap-1 ml-auto">
                {batchMode && cards.length > 0 && (
                  <Button
                    size="sm"
                    className={cn(
                      'h-7 text-xs gap-1 rounded-lg text-white',
                      selectedCardIds.size === cards.length
                        ? 'bg-gray-400 hover:bg-gray-500'
                        : 'bg-green-600 hover:bg-green-700'
                    )}
                    onClick={() => {
                      if (selectedCardIds.size === cards.length) {
                        setSelectedCardIds(new Set())
                        setFlipAllToImage(false)
                      } else {
                        setSelectedCardIds(new Set(cards.map(c => c.id)))
                        setFlipAllToImage(true)
                      }
                    }}
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    {selectedCardIds.size === cards.length ? '取消全选' : '全部选择'}
                  </Button>
                )}

                <Button
                  variant={batchMode ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs gap-1 rounded-lg"
                  onClick={() => { setBatchMode(!batchMode); setSelectedCardIds(new Set()); setFlipAllToImage(false) }}
                >
                  {batchMode ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
                  {batchMode ? `已选 ${selectedCardIds.size}` : '批量选择'}
                </Button>

                {batchMode && selectedCardIds.size > 0 && (
                  (() => {
                    const selectedCards = cards.filter(c => selectedCardIds.has(c.id))
                    const hasSelectedCardGeneratingImage = selectedCards.some(card => {
                      const images = cardImagesMap.get(card.id) || []
                      return images.some(image => image.status === 'pending' || image.status === 'generating')
                    })
                    const hasGeneratingCard = selectedCards.some(c => {
                      return batchGeneratingImageCardIds.has(c.id) || generatingImageCardIds.has(c.id)
                    }) || hasSelectedCardGeneratingImage
                    if (hasGeneratingCard) {
                      return (
                        <Button
                          size="sm"
                          className="h-7 text-xs gap-1 rounded-lg bg-red-600 hover:bg-red-700 text-white"
                          onClick={() => setBatchConfirm({
                            action: '批量删除',
                            count: selectedCardIds.size,
                            onConfirm: handleBatchDelete,
                          })}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          批量删除卡片
                        </Button>
                      )
                    }
                    return (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            className="h-7 text-xs gap-1 rounded-lg bg-violet-600 hover:bg-violet-700 text-white"
                          >
                            <Wand2 className="h-3.5 w-3.5" />
                            批量操作
                            <ChevronDown className="h-3 w-3" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" sideOffset={6}>
                          <DropdownMenuItem
                            onClick={() => {
                              if (!selectedRegenTemplate) {
                                toast.error('请先在生成配置中选择重新生成模板')
                                return
                              }
                              setBatchConfirm({
                                action: '批量重新生成提示词',
                                count: selectedCardIds.size,
                                onConfirm: handleBatchRegeneratePrompt,
                              })
                            }}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            批量生成提示词
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              if (!selectedDeepenTemplate) {
                                toast.error('请先在生成配置中选择细化模板')
                                return
                              }
                              setBatchConfirm({
                                action: '批量细化提示词',
                                count: selectedCardIds.size,
                                onConfirm: handleBatchDeepen,
                              })
                            }}
                          >
                            <Sparkles className="h-4 w-4 mr-2" />
                            批量细化提示词
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => {
                              if (!selectedImageModel || !selectedSize) {
                                toast.error('请先在生成配置中选择图片模型和尺寸')
                                return
                              }
                              setBatchConfirm({
                                action: '批量生成图片',
                                count: selectedCardIds.size,
                                onConfirm: handleBatchGenerateImage,
                              })
                            }}
                          >
                            <ImagePlus className="h-4 w-4 mr-2" />
                            批量生成图片
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setBatchConfirm({
                              action: '批量删除',
                              count: selectedCardIds.size,
                              onConfirm: handleBatchDelete,
                            })}
                          >
                            <Trash2 className="h-4 w-4 mr-2 text-red-600" />
                            批量删除卡片
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )
                  })()
                )}

                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1 rounded-lg"
                  onClick={() => setShowExportDialog(true)}
                >
                  <Download className="h-3.5 w-3.5" />
                  导出
                </Button>
              </div>
            </div>

            <div ref={cardScrollContainerRef} className="relative flex-1 overflow-y-auto">
              {loadingCards ? (
                <div className="flex items-center justify-center h-full">
                  <Spinner />
                </div>
              ) : activeTask?.status === 'generating' ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-3">
                    <Loader2 className="h-10 w-10 mx-auto animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">正在裂变提示词，请稍候...</p>
                  </div>
                </div>
              ) : activeTask?.status === 'failed' ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-3">
                    <XCircle className="h-10 w-10 mx-auto text-destructive opacity-60" />
                    <p className="text-sm text-muted-foreground">裂变失败</p>
                    {activeTask.error_message && (
                      <p className="text-xs text-muted-foreground max-w-sm">{activeTask.error_message}</p>
                    )}
                  </div>
                </div>
              ) : cards.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-center space-y-2">
                    <Wand2 className="h-10 w-10 mx-auto opacity-20" />
                    <p className="text-sm text-muted-foreground">暂无卡片</p>
                  </div>
                </div>
              ) : (
                <WorkspaceCardGrid
                  taskId={activeTaskId}
                  cards={cards}
                  cardImagesMap={cardImagesMap}
                  batchMode={batchMode}
                  selectedCardIds={selectedCardIds}
                  flipAllToImage={flipAllToImage}
                  selectedDeepenTemplate={selectedDeepenTemplate}
                  selectedRegenTemplate={selectedRegenTemplate}
                  selectedImageModel={selectedImageModel}
                  selectedSize={selectedSize}
                  onToggleSelect={toggleCardSelection}
                  onCardUpdated={handleCardUpdated}
                  onCardDeleted={handleCardDeleted}
                  onAddCard={handleAddCard}
                  onCardGeneratingImage={handleCardGeneratingImage}
                  batchDeepeningCardIds={batchDeepeningCardIds}
                  batchRegeneratingCardIds={batchRegeneratingCardIds}
                  batchGeneratingImageCardIds={batchGeneratingImageCardIds}
                />
              )}

              <button
                type="button"
                onClick={handleScrollToTop}
                className={cn(
                  'sticky ml-auto mr-5 mb-5 bottom-5 flex h-12 w-12 items-center justify-center rounded-full border border-border/70 bg-background/95 text-foreground shadow-lg backdrop-blur transition-all duration-300 ease-out hover:-translate-y-0.5 hover:bg-accent',
                  showScrollToTop
                    ? 'translate-y-0 opacity-100 pointer-events-auto'
                    : 'translate-y-3 opacity-0 pointer-events-none'
                )}
                aria-label="回到顶部"
                title="回到顶部"
              >
                <ArrowUp className="h-5 w-5" />
              </button>
            </div>
          </>
        )}
      </main>

      <WorkspaceNewTaskDialog
        open={showNewTask}
        onClose={() => setShowNewTask(false)}
        onCreated={handleTaskCreated}
      />

      <WorkspaceTemplateSelectDialog
        open={showFissionTemplateDialog}
        type="fission"
        selected={selectedFissionTemplate}
        onSelect={t => { setSelectedFissionTemplate(t); setShowFissionTemplateDialog(false) }}
        onClose={() => setShowFissionTemplateDialog(false)}
      />

      <WorkspaceTemplateSelectDialog
        open={showDeepenTemplateDialog}
        type="deepen"
        selected={selectedDeepenTemplate}
        onSelect={t => { setSelectedDeepenTemplate(t); setShowDeepenTemplateDialog(false) }}
        onClose={() => setShowDeepenTemplateDialog(false)}
      />

      <WorkspaceTemplateSelectDialog
        open={showRegenTemplateDialog}
        type="regenerate"
        selected={selectedRegenTemplate}
        onSelect={t => { setSelectedRegenTemplate(t); setShowRegenTemplateDialog(false) }}
        onClose={() => setShowRegenTemplateDialog(false)}
      />

      <WorkspaceModelSelectDialog
        open={showModelDialog}
        selected={selectedImageModel}
        onSelect={m => { setSelectedImageModel(m); setSelectedSize(null); setShowModelDialog(false) }}
        onClose={() => setShowModelDialog(false)}
      />

      <WorkspaceSizeSelectDialog
        open={showSizeDialog}
        model={selectedImageModel}
        selected={selectedSize}
        onSelect={s => { setSelectedSize(s); setShowSizeDialog(false) }}
        onClose={() => setShowSizeDialog(false)}
      />

      <WorkspaceGenerationConfigDialog
        open={showGenerationConfigDialog}
        selectedFissionTemplate={selectedFissionTemplate}
        selectedRefineTemplate={selectedDeepenTemplate}
        selectedRegenTemplate={selectedRegenTemplate}
        selectedImageModel={selectedImageModel}
        selectedSize={selectedSize}
        onApply={config => {
          setSelectedFissionTemplate(config.fissionTemplate)
          setSelectedDeepenTemplate(config.refineTemplate)
          setSelectedRegenTemplate(config.regenTemplate)
          setSelectedImageModel(config.imageModel)
          setSelectedSize(config.size)
          saveStoredGenerationConfig(config)
        }}
        onClose={() => setShowGenerationConfigDialog(false)}
      />

      <WorkspaceExportDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        taskId={activeTaskId}
        taskTitle={activeTask?.title || ''}
        cards={cards}
        selectedCardIds={selectedCardIds}
        batchMode={batchMode}
      />

      <Dialog open={Boolean(deleteConfirmTask)} onOpenChange={open => !open && setDeleteConfirmTask(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              确认删除历史任务
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 py-2 text-sm">
            <p className="text-muted-foreground">
              删除后将移除该批量生图任务及其提示词卡片记录，此操作不可撤销。
            </p>
            {deleteConfirmTask && (
              <div className="rounded-lg border border-border bg-muted/40 px-3 py-2">
                <div className="font-medium text-foreground truncate" title={deleteConfirmTask.title}>{deleteConfirmTask.title}</div>
                <div className="mt-1 text-xs text-muted-foreground">{deleteConfirmTask.card_count} 张卡片</div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteConfirmTask(null)}>取消</Button>
            <Button
              variant="destructive"
              onClick={async () => {
                if (!deleteConfirmTask) return
                const taskId = deleteConfirmTask.id
                setDeleteConfirmTask(null)
                await handleDeleteTask(taskId)
              }}
            >
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {batchConfirm && (
        <WorkspaceBatchConfirmDialog
          open={true}
          action={batchConfirm.action}
          count={batchConfirm.count}
          onConfirm={() => { batchConfirm.onConfirm(); setBatchConfirm(null) }}
          onClose={() => setBatchConfirm(null)}
        />
      )}
    </div>
  )
}
