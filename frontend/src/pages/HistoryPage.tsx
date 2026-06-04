import { useState, useEffect, useCallback, useMemo } from 'react'
import { toImageSrc } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import ImagePreviewOverlay from '@/components/ImagePreviewOverlay'
import { ImageOff } from 'lucide-react'

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

interface ImageItem {
  imageUrl: string
  task: Task
}

type SourceFilter = 'all' | 'creative' | 'project'

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

export default function HistoryPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<Task | null>(null)
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set())
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')

  const handleImageError = useCallback((url: string) => {
    setFailedImages(prev => new Set(prev).add(url))
  }, [])

  const fetchTasks = useCallback(async (source?: string) => {
    setLoading(true)
    setError(null)
    try {
      const token = localStorage.getItem('token')
      let url = '/api/tasks/history?limit=500'
      if (source && source !== 'all') {
        url += `&source=${source}`
      }
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('获取历史记录失败')
      const data = await res.json()
      setTasks(data.tasks || [])
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTasks(sourceFilter)
  }, [fetchTasks, sourceFilter])

  const handleFilterChange = useCallback((filter: SourceFilter) => {
    setSourceFilter(filter)
  }, [])

  const allImages = useMemo<ImageItem[]>(() => {
    const items: ImageItem[] = []
    for (const task of tasks) {
      if (task.result_images?.length > 0) {
        for (const url of task.result_images) {
          items.push({ imageUrl: url, task })
        }
      }
    }
    return items
  }, [tasks])

  const grouped = useMemo(() => {
    const map = new Map<string, ImageItem[]>()
    for (const item of allImages) {
      const key = getDateKey(item.task.created_at)
      const arr = map.get(key)
      if (arr) arr.push(item)
      else map.set(key, [item])
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a))
  }, [allImages])

  const openPreview = useCallback((imageUrl: string, task: Task) => {
    setPreviewImageUrl(imageUrl)
    setPreviewItem(task)
    setPreviewOpen(true)
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
      </div>
    )
  }

  if (error) {
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
        <Tabs value={sourceFilter} onValueChange={(v) => handleFilterChange(v as SourceFilter)} className="mb-6">
          <TabsList className="bg-transparent gap-1 p-0 h-auto">
            <TabsTrigger value="all" className="data-active:bg-zinc-200 data-active:dark:bg-zinc-700 data-active:text-foreground rounded-lg px-4 py-2">全部</TabsTrigger>
            <TabsTrigger value="creative" className="data-active:bg-zinc-200 data-active:dark:bg-zinc-700 data-active:text-foreground rounded-lg px-4 py-2">自由创作</TabsTrigger>
            <TabsTrigger value="project" className="data-active:bg-zinc-200 data-active:dark:bg-zinc-700 data-active:text-foreground rounded-lg px-4 py-2">工作项目</TabsTrigger>
          </TabsList>
        </Tabs>

        {allImages.length === 0 ? (
          <div className="flex items-center justify-center py-20 text-muted-foreground">
            暂无生成图片
          </div>
        ) : (
          grouped.map(([dateKey, images]) => (
            <div key={dateKey} className="mb-8">
              <h2 className="text-sm font-medium text-muted-foreground mb-3">
                {formatDateLabel(dateKey)}
              </h2>
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-1.5">
                {images.map((item, idx) => {
                  const isFailed = failedImages.has(item.imageUrl)
                  return (
                    <div
                      key={`${dateKey}-${idx}`}
                      className="aspect-square rounded-md overflow-hidden bg-muted cursor-pointer hover:opacity-80 transition-opacity relative group"
                      onClick={() => !isFailed && openPreview(item.imageUrl, item.task)}
                    >
                      {isFailed ? (
                        <div className="w-full h-full flex items-center justify-center bg-muted">
                          <ImageOff className="h-6 w-6 text-muted-foreground/50" />
                        </div>
                      ) : (
                        <>
                          <img
                            src={toImageSrc(item.imageUrl)}
                            alt=""
                            className="w-full h-full object-cover"
                            loading="lazy"
                            onError={() => handleImageError(item.imageUrl)}
                          />
                          <div className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Badge
                              variant={item.task.source === 'project' ? 'default' : 'secondary'}
                              className="text-[10px] px-1 py-0"
                            >
                              {item.task.source === 'project' ? '项目' : '创作'}
                            </Badge>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))
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
