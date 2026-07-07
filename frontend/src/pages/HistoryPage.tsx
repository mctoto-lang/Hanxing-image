import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react'
import { toImageSrc } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import ImagePreviewOverlay from '@/components/ImagePreviewOverlay'
import { ImageOff, Search, LayoutGrid, Columns3 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Task {
  id: number
  prompt: string
  model_name: string
  image_size: string
  image_count: number
  status: string
  result_images: string[]
  error_message: string | null
  credits_charged: number
  source: string
  created_at: string
  started_at: string | null
  completed_at: string | null
}

interface WorkspaceImage {
  id: number
  image_url: string
  size: string | null
  created_at: string
  is_selected: number
  prompt: string
  card_index: number
  task_id: number
  task_title: string
  task_created_at: string
}

type SourceFilter = 'all' | 'creative' | 'project' | 'product' | 'batch'
type AssetKind = 'creative' | 'project' | 'product' | 'batch'
type ViewMode = 'waterfall' | 'grid'

interface AssetImageItem {
  imageUrl: string
  prompt: string
  created_at: string
  kind: AssetKind
  previewItem: Task | { prompt?: string; model_name?: string; image_size?: string; created_at?: string }
}

const sourceOptions: { value: SourceFilter; label: string }[] = [
  { value: 'all', label: '全部' },
  { value: 'creative', label: '自由创作' },
  { value: 'project', label: '项目创作' },
  { value: 'product', label: '商品主图' },
  { value: 'batch', label: '批量生图' },
]

const kindConfig: Record<AssetKind, { label: string; className: string }> = {
  project: { label: '项目', className: 'bg-blue-500/95 text-white' },
  creative: { label: '创作', className: 'bg-purple-500/95 text-white' },
  product: { label: '商品主图', className: 'bg-orange-500/95 text-white' },
  batch: { label: '批量', className: 'bg-yellow-400/95 text-white' },
}

function getAssetKind(source: string): AssetKind {
  if (source === 'project') return 'project'
  if (source === 'product') return 'product'
  return 'creative'
}

function getDateKey(dateStr: string): string {
  const d = new Date(dateStr)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function formatDateLabel(dateKey: string): string {
  const today = new Date()
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  if (dateKey === todayKey) return '今日'

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`
  if (dateKey === yesterdayKey) return '昨日'

  const [y, m, d] = dateKey.split('-')
  return `${y}年${parseInt(m)}月${parseInt(d)}日`
}

const PAGE_SIZE = 20

// 正方形缩略图卡片 - memo 优化性能
const GridCard = memo(function GridCard({
  item,
  isFailed,
  badge,
  onPreview,
  onError,
}: {
  item: AssetImageItem
  isFailed: boolean
  badge: { label: string; className: string }
  onPreview: (imageUrl: string, previewItem: AssetImageItem['previewItem']) => void
  onError: (url: string) => void
}) {
  const [localFailed, setLocalFailed] = useState(false)

  const handleError = useCallback(() => {
    setLocalFailed(true)
    onError(item.imageUrl)
  }, [item.imageUrl, onError])

  const failed = isFailed || localFailed

  return (
    <div
      className="aspect-square rounded-md overflow-hidden bg-muted cursor-pointer hover:opacity-80 transition-opacity relative group"
      onClick={() => !failed && onPreview(item.imageUrl, item.previewItem)}
    >
      {failed ? (
        <div className="w-full h-full flex items-center justify-center bg-muted">
          <ImageOff className="h-6 w-6 text-muted-foreground/50" />
        </div>
      ) : (
        <>
          <img
            src={toImageSrc(item.imageUrl, { width: 200, height: 200 })}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
            onError={handleError}
          />
          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium shadow-sm ${badge.className}`}>
              {badge.label}
            </span>
          </div>
        </>
      )}
    </div>
  )
})

// 瀑布流卡片 - memo 优化性能，渐进式加载
const WaterfallCard = memo(function WaterfallCard({
  item,
  isFailed,
  badge,
  onPreview,
  onError,
}: {
  item: AssetImageItem
  isFailed: boolean
  badge: { label: string; className: string }
  onPreview: (imageUrl: string, previewItem: AssetImageItem['previewItem']) => void
  onError: (url: string) => void
}) {
  const [localFailed, setLocalFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)

  const handleError = useCallback(() => {
    setLocalFailed(true)
    onError(item.imageUrl)
  }, [item.imageUrl, onError])

  const failed = isFailed || localFailed

  return (
    <div
      className="group relative mb-3 break-inside-avoid overflow-hidden rounded-lg cursor-pointer bg-muted"
      onClick={() => !failed && onPreview(item.imageUrl, item.previewItem)}
    >
      {failed ? (
        <div className="w-full flex items-center justify-center bg-muted py-12">
          <ImageOff className="h-6 w-6 text-muted-foreground/50" />
        </div>
      ) : (
        <>
          {/* 高清图 - 全比例显示 */}
          <img
            src={toImageSrc(item.imageUrl, { width: 400 })}
            alt=""
            className={cn('w-full block min-h-[120px] transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')}
            loading="lazy"
            onLoad={() => setLoaded(true)}
            onError={handleError}
          />
          {/* 加载中占位 */}
          {!loaded && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            </div>
          )}
          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <span className={`inline-flex rounded-md px-2 py-0.5 text-[10px] font-medium shadow-sm ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          <div className="absolute inset-x-0 bottom-0 h-[15%] min-h-[32px] bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end px-2.5 pb-1.5">
            <span className="text-[11px] text-white/90 font-medium truncate">{item.prompt}</span>
          </div>
        </>
      )}
    </div>
  )
})

interface ImageItem {
  imageUrl: string
  task: Task
}

export default function HistoryPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<Task | { prompt?: string; model_name?: string; image_size?: string; created_at?: string } | null>(null)
  // failedImages 改为 useRef，避免每次图片失败触发全组件重渲染
  const failedImagesRef = useRef<Set<string>>(new Set())
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [searchQuery, setSearchQuery] = useState('')
  // 用于防抖的实际搜索词
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  const [workspaceImages, setWorkspaceImages] = useState<WorkspaceImage[]>([])
  const [workspaceLoading, setWorkspaceLoading] = useState(false)

  // 加载更多分页
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)

  // 搜索防抖
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // 筛选变化时重置可见数量
  useEffect(() => {
    setVisibleCount(PAGE_SIZE)
  }, [sourceFilter, debouncedSearch])

  const handleImageError = useCallback((url: string) => {
    if (!failedImagesRef.current.has(url)) {
      failedImagesRef.current = new Set(failedImagesRef.current).add(url)
    }
  }, [])

  const fetchTasks = useCallback(async (source?: string) => {
    setLoading(true)
    setError(null)
    try {
      let url = '/api/tasks/history?limit=100'
      if (source && source !== 'all' && source !== 'batch') {
        url += `&source=${source}`
      }
      const res = await apiFetch(url)
      if (!res.ok) throw new Error('获取历史记录失败')
      const data = await res.json()
      setTasks(data.tasks || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  const fetchWorkspaceImages = useCallback(async () => {
    setWorkspaceLoading(true)
    try {
      const res = await apiFetch('/api/workspace/images/history?limit=100')
      if (!res.ok) throw new Error()
      const data = await res.json()
      setWorkspaceImages(data.images || [])
    } catch {
      // 非关键数据，静默失败
    } finally {
      setWorkspaceLoading(false)
    }
  }, [])

  useEffect(() => {
    if (sourceFilter === 'batch') {
      fetchWorkspaceImages()
    } else if (sourceFilter === 'all') {
      fetchTasks('all')
      fetchWorkspaceImages()
    } else {
      fetchTasks(sourceFilter)
    }
  }, [fetchTasks, fetchWorkspaceImages, sourceFilter])

  const handleFilterChange = useCallback((filter: SourceFilter) => {
    setSourceFilter(filter)
  }, [])

  const allImages = useMemo<ImageItem[]>(() => {
    const items: ImageItem[] = []
    for (const task of tasks) {
      if (task.source === 'workspace') continue
      if (task.result_images?.length > 0) {
        for (const url of task.result_images) {
          items.push({ imageUrl: url, task })
        }
      }
    }
    return items
  }, [tasks])

  const displayImages = useMemo<AssetImageItem[]>(() => {
    const items: AssetImageItem[] = []
    if (sourceFilter !== 'batch') {
      for (const item of allImages) {
        const kind = getAssetKind(item.task.source)
        items.push({
          imageUrl: item.imageUrl,
          prompt: item.task.prompt || '',
          created_at: item.task.created_at,
          kind,
          previewItem: item.task,
        })
      }
    }
    if (sourceFilter === 'all' || sourceFilter === 'batch') {
      for (const img of workspaceImages) {
        items.push({
          imageUrl: img.image_url,
          prompt: img.prompt || '',
          created_at: img.created_at,
          kind: 'batch',
          previewItem: { prompt: img.prompt, created_at: img.created_at },
        })
      }
    }

    const keyword = debouncedSearch.trim().toLowerCase()
    const filtered = keyword
      ? items.filter(item => item.prompt.toLowerCase().includes(keyword))
      : items

    // 预计算时间戳避免排序时重复创建 Date
    return filtered
      .map(item => ({ ...item, _ts: new Date(item.created_at).getTime() }))
      .sort((a, b) => b._ts - a._ts)
  }, [allImages, workspaceImages, sourceFilter, debouncedSearch])

  // 当前可见的图片
  const visibleImages = useMemo(() => displayImages.slice(0, visibleCount), [displayImages, visibleCount])
  const hasMore = visibleCount < displayImages.length

  const loadMore = useCallback(() => {
    setVisibleCount((prev) => prev + PAGE_SIZE)
  }, [])

  const grouped = useMemo(() => {
    const map = new Map<string, AssetImageItem[]>()
    for (const item of visibleImages) {
      const key = getDateKey(item.created_at)
      const arr = map.get(key)
      if (arr) arr.push(item)
      else map.set(key, [item])
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [visibleImages])

  const openPreview = useCallback((imageUrl: string, item: Task | { prompt?: string; model_name?: string; image_size?: string; created_at?: string }) => {
    setPreviewImageUrl(imageUrl)
    setPreviewItem(item)
    setPreviewOpen(true)
  }, [])

  const selectedSourceLabel = sourceOptions.find(option => option.value === sourceFilter)?.label ?? '全部'

  const isLoading = sourceFilter === 'batch' ? workspaceLoading : sourceFilter === 'all' ? loading || workspaceLoading : loading

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    )
  }

  if (error && sourceFilter !== 'batch') {
    return (
      <div className="flex flex-col items-center gap-3 py-20">
        <p className="text-destructive">{error}</p>
        <Button
          onClick={() => fetchTasks(sourceFilter)}
          variant="link"
          size="sm"
          className="underline"
        >
          重试
        </Button>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="px-6 py-6">
        <div className="mb-6 flex items-center gap-3">
          <div className="relative flex-1 max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="搜索生成图片的提示词..."
              className="pl-9"
            />
          </div>
          <Select value={sourceFilter} onValueChange={(value) => value && handleFilterChange(value as SourceFilter)}>
            <SelectTrigger className="w-36">
              <SelectValue>{selectedSourceLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent align="start" side="bottom" sideOffset={6} alignItemWithTrigger={false}>
              {sourceOptions.map(option => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* 视图切换 */}
          <div className="flex items-center rounded-lg border border-input p-0.5">
            <button
              type="button"
              className={cn(
                'inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors',
                viewMode === 'grid'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setViewMode('grid')}
              title="缩略图"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              type="button"
              className={cn(
                'inline-flex items-center justify-center h-7 w-7 rounded-md transition-colors',
                viewMode === 'waterfall'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => setViewMode('waterfall')}
              title="瀑布流"
            >
              <Columns3 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {displayImages.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            {debouncedSearch.trim() ? '没有匹配的生成图片' : sourceFilter === 'batch' ? '暂无批量生成图片' : '暂无生成图片'}
          </div>
        ) : viewMode === 'waterfall' ? (
          <div className="columns-1 gap-3 sm:columns-2 md:columns-3 lg:columns-4">
            {visibleImages.map((item) => (
              <WaterfallCard
                key={item.imageUrl}
                item={item}
                isFailed={failedImagesRef.current.has(item.imageUrl)}
                badge={kindConfig[item.kind]}
                onPreview={openPreview}
                onError={handleImageError}
              />
            ))}
          </div>
        ) : (
          grouped.map(([dateKey, images]) => (
            <div key={dateKey} className="mb-8">
              <h2 className="text-sm font-medium text-muted-foreground mb-3">
                {formatDateLabel(dateKey)}
              </h2>
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5">
                {images.map((item) => (
                  <GridCard
                    key={item.imageUrl}
                    item={item}
                    isFailed={failedImagesRef.current.has(item.imageUrl)}
                    badge={kindConfig[item.kind]}
                    onPreview={openPreview}
                    onError={handleImageError}
                  />
                ))}
              </div>
            </div>
          ))
        )}

        {/* 加载更多 / 懒加载 */}
        {hasMore && (
          <div className="flex items-center justify-center py-6">
            <Button
              variant="outline"
              size="sm"
              className="rounded-lg px-6"
              onClick={loadMore}
            >
              {viewMode === 'grid' ? '加载更多缩略图' : '加载更多'}
            </Button>
          </div>
        )}
      </div>

      <ImagePreviewOverlay
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        imageUrl={previewImageUrl}
        item={previewItem}
      />
    </div>
  )
}
