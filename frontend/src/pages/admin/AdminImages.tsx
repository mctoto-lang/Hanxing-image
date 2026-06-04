import { useState, useEffect, useCallback } from 'react'
import ImagePreviewOverlay from '@/components/ImagePreviewOverlay'
import { Clock, CalendarIcon, X, User, ChevronDown, Check } from 'lucide-react'
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
import { cn } from '@/lib/utils'

interface ImageItem {
  id: number
  prompt: string
  status: string
  result_images: string[]
  username: string
  model_name: string
  created_at: string
  completed_at: string | null
  started_at: string | null
}

interface UserItem {
  id: number
  username: string
}

function toImageSrc(src: string): string {
  if (src.startsWith('data:')) return src
  if (src.startsWith('http://') || src.startsWith('https://')) return src
  if (src.startsWith('/')) return src
  return `data:image/png;base64,${src}`
}

function getDuration(item: ImageItem): string {
  if (!item.started_at || !item.completed_at) return '-'
  const ms = new Date(item.completed_at).getTime() - new Date(item.started_at).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`
}

export default function AdminImages() {
  const [images, setImages] = useState<ImageItem[]>([])
  const [page, _setPage] = useState(1)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<ImageItem | null>(null)

  // 筛选状态
  const [users, setUsers] = useState<UserItem[]>([])
  const [selectedUsername, setSelectedUsername] = useState<string>('')
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined)
  const [userSearch, setUserSearch] = useState('')

  const fetchImages = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const params = new URLSearchParams({ page: String(page), limit: '30' })
      if (selectedUsername) params.set('username', selectedUsername)
      if (dateRange?.from) {
        params.set('startDate', format(dateRange.from, 'yyyy-MM-dd'))
      }
      if (dateRange?.to) {
        params.set('endDate', format(dateRange.to, 'yyyy-MM-dd'))
      }

      const res = await fetch(`/api/admin/images?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setImages(data.images || [])
    } catch {}
  }, [page, selectedUsername, dateRange])

  const fetchUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setUsers(data.users || [])
    } catch {}
  }, [])

  useEffect(() => {
    fetchImages()
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

  const clearFilters = () => {
    setSelectedUsername('')
    setDateRange(undefined)
  }

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
                onClick={() => setSelectedUsername('')}
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
                      onClick={() => setSelectedUsername(u.username)}
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
              onSelect={setDateRange}
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
      </div>

      <div className="flex-1 overflow-y-auto min-h-0">
        {images.length === 0 ? (
          <p className="text-muted-foreground py-12 text-center">暂无图片</p>
        ) : (
          <div className="columns-1 gap-3 sm:columns-2 md:columns-3 lg:columns-4">
            {images.map((item) =>
              item.result_images?.map((url, idx) => (
                <div
                  key={`${item.id}-${idx}`}
                  className="group relative mb-3 break-inside-avoid overflow-hidden rounded-lg cursor-pointer"
                  onClick={() => openPreview(url, item)}
                >
                  <img
                    src={toImageSrc(url)}
                    alt={item.prompt}
                    className="w-full block"
                    loading="lazy"
                  />
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
              ))
            )}
          </div>
        )}
      </div>

      <ImagePreviewOverlay
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        imageUrl={previewImageUrl}
        item={previewItem ? {
          prompt: previewItem.prompt,
          model_name: previewItem.model_name,
          started_at: previewItem.started_at,
          completed_at: previewItem.completed_at,
          created_at: previewItem.created_at,
        } : null}
      />
    </div>
  )
}
