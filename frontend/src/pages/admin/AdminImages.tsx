import { useState, useEffect, useCallback, useRef, memo } from 'react'
import ImagePreviewOverlay from '@/components/ImagePreviewOverlay'
import { Clock, CalendarIcon, X, User, ChevronDown, Check, Loader2, LayoutGrid, Columns3 } from 'lucide-react'
import { Calendar } from '@/components/ui/calendar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { format } from 'date-fns'
import { zhCN } from 'react-day-picker/locale'
import type { DateRange } from 'react-day-picker'
import { cn, toImageSrc } from '@/lib/utils'
import { apiFetch } from '@/lib/api'

interface ImageItem {
  id: number
  prompt: string
  status: string
  result_images: string[]
  username: string
  model_name: string
  image_size: string
  created_at: string
  completed_at: string | null
  started_at: string | null
}

interface UserItem {
  id: number
  username: string
}

type ViewMode = 'waterfall' | 'grid'

function getDuration(item: ImageItem): string {
  if (!item.started_at || !item.completed_at) return '-'
  const ms = new Date(item.completed_at).getTime() - new Date(item.started_at).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`
}

const PAGE_SIZE = 20

// 瀑布流卡片 - memo 优化性能，渐进式加载
const WaterfallCard = memo(function WaterfallCard({
  url,
  item,
  onPreview,
}: {
  url: string
  item: ImageItem
  onPreview: (url: string, item: ImageItem) => void
}) {
  const [loaded, setLoaded] = useState(false)
  return (
    <div
      className="group relative mb-3 break-inside-avoid overflow-hidden rounded-lg cursor-pointer bg-muted"
      onClick={() => onPreview(url, item)}
    >
      {/* 高清图 - 全比例显示 */}
      <img
        src={toImageSrc(url, { width: 400 })}
        alt={item.prompt}
        className={cn('w-full block min-h-[120px] transition-opacity duration-300', loaded ? 'opacity-100' : 'opacity-0')}
        loading="lazy"
        onLoad={() => setLoaded(true)}
      />
      {/* 加载中占位 */}
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 h-[15%] min-h-[32px] bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end px-2.5 pb-1.5">
        <div className="flex items-center gap-1.5 w-full">
          <span className="text-[11px] text-white/90 font-medium truncate">{item.username}</span>
          <span className="text-white/40">·</span>
          <span className="flex items-center gap-0.5 text-[11px] text-white/70 shrink-0">
            <Clock className="h-3 w-3" />
            {getDuration(item)}
          </span>
        </div>
      </div>
    </div>
  )
})

// 正方形缩略图卡片 - memo 优化性能
const GridCard = memo(function GridCard({
  url,
  item,
  onPreview,
}: {
  url: string
  item: ImageItem
  onPreview: (url: string, item: ImageItem) => void
}) {
  return (
    <div
      className="group aspect-square rounded-lg overflow-hidden bg-muted cursor-pointer hover:opacity-80 transition-opacity relative"
      onClick={() => onPreview(url, item)}
    >
      <img
        src={toImageSrc(url, { width: 200, height: 200 })}
        alt={item.prompt}
        className="w-full h-full object-cover"
        loading="lazy"
      />
      <div className="absolute inset-x-0 bottom-0 h-[20%] min-h-[28px] bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end px-2 pb-1">
        <span className="text-[10px] text-white/90 font-medium truncate">{item.username}</span>
      </div>
    </div>
  )
})

export default function AdminImages() {
  const [images, setImages] = useState<ImageItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<ImageItem | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')

  // 筛选状态
  const [users, setUsers] = useState<UserItem[]>([])
  const [selectedUsername, setSelectedUsername] = useState<string>('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [userSearch, setUserSearch] = useState('')
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const scrollContainerRef = useRef<HTMLDivElement | null>(null)
  const loadingRef = useRef(false)
  const pageRef = useRef(1)
  const loadedPagesRef = useRef(new Set<number>())

  const hasMore = images.length < total

  const fetchImages = useCallback(async (pageNum: number, append: boolean) => {
    if (loadingRef.current) return
    if (append && loadedPagesRef.current.has(pageNum)) return

    loadingRef.current = true
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: String(PAGE_SIZE) })
      if (selectedUsername) params.set('username', selectedUsername)
      if (dateRange?.from) {
        params.set('startDate', format(dateRange.from, 'yyyy-MM-dd'))
      }
      if (dateRange?.to) {
        params.set('endDate', format(dateRange.to, 'yyyy-MM-dd'))
      }

      const res = await apiFetch(`/api/admin/images?${params}`)
      const data = await res.json()
      const newImages = data.images || []
      if (append) {
        setImages((prev) => {
          const seen = new Set(prev.map((item) => item.id))
          const deduped = newImages.filter((item: ImageItem) => !seen.has(item.id))
          return [...prev, ...deduped]
        })
        loadedPagesRef.current.add(pageNum)
      } else {
        setImages(newImages)
        loadedPagesRef.current = new Set([pageNum])
      }
      pageRef.current = pageNum
      setTotal(data.total || 0)
    } catch {
      // 非关键数据，静默失败
    } finally {
      loadingRef.current = false
      setLoading(false)
    }
  }, [selectedUsername, dateRange])

  const loadMore = useCallback(() => {
    if (loadingRef.current || !hasMore) return
    const nextPage = pageRef.current + 1
    fetchImages(nextPage, true)
  }, [fetchImages, hasMore])

  const fetchUsers = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/users')
      const data = await res.json()
      setUsers(data.users || [])
    } catch {
      // 非关键数据，静默失败
    }
  }, [])

  useEffect(() => {
    pageRef.current = 1
    loadedPagesRef.current.clear()
    fetchImages(1, false)
  }, [fetchImages])

  useEffect(() => {
    fetchUsers()
  }, [fetchUsers])

  const openPreview = useCallback((imageUrl: string, item: ImageItem) => {
    setPreviewImageUrl(imageUrl)
    setPreviewItem(item)
    setPreviewOpen(true)
  }, [])

  const hasFilters = selectedUsername || dateRange?.from || dateRange?.to

  // 筛选条件变化时重置到第 1 页
  const handleSelectUsername = (username: string) => {
    setSelectedUsername(username)
  }
  const handleSelectDateRange = (range: DateRange | undefined) => {
    setDateRange(range)
  }
  const clearFilters = () => {
    setSelectedUsername('')
    setDateRange(undefined)
  }

  // 展开所有 result_images 为扁平列表，用于正方形缩略图
  const flatImages = images.flatMap((item) =>
    (item.result_images || []).map((url, idx) => ({ url, item, key: `${item.id}-${idx}` }))
  )

  useEffect(() => {
    if (viewMode !== 'grid' || !hasMore || loading) return
    const el = sentinelRef.current
    const root = scrollContainerRef.current
    if (!el || !root) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !loadingRef.current) loadMore()
      },
      { root, rootMargin: '400px 0px' }
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [viewMode, hasMore, loading, loadMore])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <h1 className="text-2xl font-bold">图片管理</h1>
      </div>

      {/* 筛选栏 */}
      <div className="flex flex-wrap items-center gap-3 mb-4 shrink-0">
        {/* 用户筛选 */}
        <Popover>
          <PopoverTrigger
            className="inline-flex items-center justify-center w-[160px] h-8 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm font-normal text-left whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50"
          >
            <User className="mr-2 h-4 w-4" />
            {selectedUsername || <span className="text-muted-foreground">全部用户</span>}
            <ChevronDown className="ml-auto h-3.5 w-3.5 text-muted-foreground" />
          </PopoverTrigger>
          <PopoverContent className="w-64 p-0" align="start">
            <div className="p-2 border-b">
              <Input
                placeholder="搜索用户..."
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                className="h-8"
              />
            </div>
            <div className="max-h-[240px] overflow-y-auto">
              <button
                type="button"
                onClick={() => handleSelectUsername('')}
                className={cn(
                  'flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors hover:bg-accent',
                  !selectedUsername && 'bg-accent'
                )}
              >
                <span className="flex-1">全部用户</span>
                {!selectedUsername && <Check className="h-4 w-4 text-primary" />}
              </button>
              {users
                .filter((u) => u.username.toLowerCase().includes(userSearch.toLowerCase()))
                .map((u) => {
                  const isSelected = u.username === selectedUsername
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => handleSelectUsername(u.username)}
                      className={cn(
                        'flex items-center gap-2 w-full px-3 py-2 text-sm text-left transition-colors hover:bg-accent',
                        isSelected && 'bg-accent'
                      )}
                    >
                      <span className="flex-1">{u.username}</span>
                      {isSelected && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  )
                })}
            </div>
          </PopoverContent>
        </Popover>

        {/* 日期筛选 */}
        <Popover>
          <PopoverTrigger
            className="inline-flex items-center justify-center w-[240px] h-8 rounded-lg border border-input bg-transparent px-2.5 py-2 text-sm font-normal text-left whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:hover:bg-input/50"
          >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateRange?.from ? (
                dateRange.to ? (
                  <>
                    {format(dateRange.from, 'yyyy/MM/dd')} - {format(dateRange.to, 'yyyy/MM/dd')}
                  </>
                ) : (
                  format(dateRange.from, 'yyyy/MM/dd')
                )
              ) : (
                <span className="text-muted-foreground">选择日期范围</span>
              )}
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="range"
              selected={dateRange}
              onSelect={handleSelectDateRange}
              numberOfMonths={2}
              locale={zhCN}
            />
          </PopoverContent>
        </Popover>

        {/* 清除筛选 */}
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            <X className="h-4 w-4 mr-1" />
            清除筛选
          </Button>
        )}

        {/* 视图切换 */}
        <div className="ml-auto flex items-center rounded-lg border border-input p-0.5">
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

      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto min-h-0">
        {images.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center">暂无图片</p>
        ) : viewMode === 'waterfall' ? (
          <div className="columns-1 gap-3 sm:columns-2 md:columns-3 lg:columns-4">
            {images.map((item) =>
              item.result_images?.map((url, idx) => (
                <WaterfallCard
                  key={`${item.id}-${idx}`}
                  url={url}
                  item={item}
                  onPreview={openPreview}
                />
              ))
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {flatImages.map(({ url, item, key }) => (
                <GridCard
                  key={key}
                  url={url}
                  item={item}
                  onPreview={openPreview}
                />
              ))}
            </div>
            {hasMore && (
              <div ref={sentinelRef} className="flex items-center justify-center py-3 shrink-0">
                {loading && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
              </div>
            )}
          </>
        )}
      </div>

      {/* 加载更多 / 懒加载 */}
      {hasMore && viewMode === 'waterfall' && (
        <div className="flex items-center justify-center py-3 shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg px-6"
            disabled={loading}
            onClick={loadMore}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                加载中...
              </>
            ) : (
              '加载更多'
            )}
          </Button>
        </div>
      )}

      <ImagePreviewOverlay
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        imageUrl={previewImageUrl}
        item={previewItem ? {
          prompt: previewItem.prompt,
          model_name: previewItem.model_name,
          image_size: previewItem.image_size,
          started_at: previewItem.started_at,
          completed_at: previewItem.completed_at,
          created_at: previewItem.created_at,
        } : null}
      />
    </div>
  )
}
