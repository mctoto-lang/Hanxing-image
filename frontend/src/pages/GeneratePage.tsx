import { useState, useEffect, useCallback, useRef } from 'react'
import { Composer } from '@/components/ui/composer'
import { Badge } from '@/components/ui/badge'
import { cn, toImageSrc } from '@/lib/utils'
import { Image, ImageOff, Loader2, PanelRightClose, History, Send, ChevronDown, X, CircleAlert, RotateCcw, Copy, Check, CheckCircle2, Pin, Upload, AlertTriangle } from 'lucide-react'
import ImagePreviewOverlay from '@/components/ImagePreviewOverlay'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { QueueStatusBadge } from '@/components/QueueStatusBadge'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface Model {
  id: number
  name: string
  display_name: string
  cost_per_image: number
  icon_url: string | null
  supported_sizes: { ratios: { ratio: string; width: number; height: number }[] } | null
  supports_reference_image: boolean
  max_reference_images: number
}

interface QueueStatus {
  queued: number
  processing: number
}

interface HistoryItem {
  id: number
  prompt: string
  status: string
  result_images: string[]
  created_at: string
  model_name: string
  image_size: string
  image_count: number
  credits_charged: number
  error_message: string | null
  retry_count: number
  started_at: string | null
  completed_at: string | null
}

const defaultRatios = [
  { ratio: '1:1', width: 1024, height: 1024 },
  { ratio: '3:2', width: 1536, height: 1024 },
  { ratio: '2:3', width: 1024, height: 1536 },
  { ratio: '16:9', width: 2048, height: 1152 },
  { ratio: '9:16', width: 1156, height: 2048 },
]

const HISTORY_WIDTH = 320

function getBriefError(msg: string | null): string {
  if (!msg) return '生成失败'
  const colonIdx = msg.indexOf(':')
  if (colonIdx > 0 && colonIdx < 30) {
    const afterColon = msg.slice(colonIdx + 1).trim()
    const dashIdx = afterColon.indexOf(' - ')
    if (dashIdx > 0) {
      return msg.slice(0, colonIdx + 1) + ' ' + afterColon.slice(0, dashIdx)
    }
    if (afterColon.length > 30) {
      return msg.slice(0, colonIdx + 1) + ' ' + afterColon.slice(0, 25) + '...'
    }
  }
  if (msg.length > 30) return msg.slice(0, 27) + '...'
  return msg
}

function ModelPopover({ models, selectedModel, onSelect, disabled }: {
  models: Model[]
  selectedModel: string
  onSelect: (v: string) => void
  disabled: boolean
}) {
  const selected = models.find((m) => String(m.id) === selectedModel)
  const needsScroll = models.length > 3
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        disabled={disabled}
        className="flex items-center gap-1 h-9 px-3 rounded-xl text-sm transition-colors cursor-pointer bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50 overflow-hidden max-w-[160px]"
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 1024 1024" fill="currentColor"><path d="M86.517714 244.899429L493.350857 10.013714a36.571429 36.571429 0 0 1 36.571429 0l406.834285 234.885715a36.571429 36.571429 0 0 1 18.285715 31.672v469.771428a36.571429 36.571429 0 0 1-18.285715 31.670857l-406.834285 234.885715a36.571429 36.571429 0 0 1-36.571429 0L86.516571 778.013714a36.571429 36.571429 0 0 1-18.285714-31.670857V276.571429a36.571429 36.571429 0 0 1 18.285714-31.672z m59.525715 50.203428a9.142857 9.142857 0 0 0-4.571429 7.918857v416.870857a9.142857 9.142857 0 0 0 4.571429 7.917715l361.021714 208.435428a9.142857 9.142857 0 0 0 9.142857 0l361.020571-208.434285a9.142857 9.142857 0 0 0 4.571429-7.918858V303.021714a9.142857 9.142857 0 0 0-4.571429-7.918857L516.208 86.668571a9.142857 9.142857 0 0 0-9.142857 0l-361.021714 208.434286z m365.213714 178.8l281.588571-162.574857c17.491429-10.098286 39.858286-4.105143 49.957715 13.386286 10.098286 17.491429 4.105143 39.858286-13.386286 49.957714L548.571429 536.818286V858.285714c0 20.197714-16.373714 36.571429-36.571429 36.571429-20.197714 0-36.571429-16.373714-36.571429-36.571429V537.675429L194.088 375.243429c-17.491429-10.099429-23.485714-32.466286-13.386286-49.957715 10.099429-17.491429 32.466286-23.485714 49.957715-13.386285L511.257143 473.902857z" /></svg>
        <span className="truncate min-w-0">{selected?.display_name || '选择模型'}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <div className={cn(
          'flex flex-col gap-1',
          needsScroll && 'max-h-[240px] overflow-y-auto'
        )}>
          {models.map((model) => {
            const isSelected = String(model.id) === selectedModel
            return (
              <button
                key={model.id}
                type="button"
                onClick={() => onSelect(String(model.id))}
                className={cn(
                  'flex items-start gap-3 p-3 rounded-xl text-left w-full transition-colors',
                  isSelected
                    ? 'bg-primary/10 ring-1 ring-primary/30'
                    : 'hover:bg-accent',
                )}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted overflow-hidden">
                  {model.icon_url ? (
                    <img src={model.icon_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Image className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{model.display_name}</span>
                    {isSelected && (
                      <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{model.cost_per_image} 积分/张</div>
                </div>
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function SizePopover({ imageSize, onSelect, disabled, width, height, onWidthChange, onHeightChange, ratios }: {
  imageSize: string
  onSelect: (v: string) => void
  disabled: boolean
  width: string
  height: string
  onWidthChange: (v: string) => void
  onHeightChange: (v: string) => void
  ratios: { ratio: string; width: number; height: number }[]
}) {
  const selected = ratios.find((r) => `${r.width}x${r.height}` === imageSize)
  return (
    <Popover>
      <PopoverTrigger
        type="button"
        disabled={disabled}
        className="flex items-center gap-1 h-9 px-3 rounded-xl text-sm transition-colors cursor-pointer bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-600 disabled:opacity-50 overflow-hidden max-w-[120px]"
      >
        <svg className="h-4 w-4 shrink-0" viewBox="0 0 1024 1024" fill="currentColor"><path d="M625.777778 256h142.222222V398.222222h113.777778V142.222222H625.777778v113.777778zM256 398.222222V256H398.222222v-113.777778H142.222222V398.222222h113.777778zM768 625.777778v142.222222H625.777778v113.777778h256V625.777778h-113.777778zM398.222222 768H256V625.777778h-113.777778v256H398.222222v-113.777778z" /></svg>
        <span className="truncate min-w-0">{selected?.ratio || imageSize}</span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
      </PopoverTrigger>
      <PopoverContent className="w-80 p-3" align="start">
        <div className="text-xs font-semibold text-muted-foreground mb-2">选择比例</div>
        <div className="flex flex-wrap gap-2 mb-4">
          {ratios.map((r) => {
            const isSelected = `${r.width}x${r.height}` === imageSize
            return (
              <Button
                key={r.ratio}
                variant="outline"
                onClick={() => {
                  onSelect(`${r.width}x${r.height}`)
                  onWidthChange(String(r.width))
                  onHeightChange(String(r.height))
                }}
                className={cn(
                  'px-3 py-2 rounded-xl',
                  isSelected
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'hover:bg-accent',
                )}
              >
                {r.ratio}
              </Button>
            )
          })}
        </div>

        <div className="text-xs font-semibold text-muted-foreground mb-2">尺寸</div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 flex-1">
            <span className="text-xs text-muted-foreground">W</span>
            <Input
              type="number"
              value={width}
              onChange={(e) => {
                onWidthChange(e.target.value)
                onSelect(`${e.target.value}x${height || '1024'}`)
              }}
              className="h-8 text-xs text-center"
            />
          </div>
          <span className="text-xs text-muted-foreground">×</span>
          <div className="flex items-center gap-1 flex-1">
            <span className="text-xs text-muted-foreground">H</span>
            <Input
              type="number"
              value={height}
              onChange={(e) => {
                onHeightChange(e.target.value)
                onSelect(`${width || '1024'}x${e.target.value}`)
              }}
              className="h-8 text-xs text-center"
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

function ErrorDialog({ open, onOpenChange, errorMessage }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  errorMessage: string
}) {
  const [copied, setCopied] = useState(false)

  const rawPrefix = '原始响应: '
  const rawIdx = errorMessage.indexOf(rawPrefix)
  const briefError = rawIdx >= 0 ? errorMessage.slice(0, rawIdx).trimEnd().replace(/ \|$/, '') : errorMessage
  const rawResponse = rawIdx >= 0 ? errorMessage.slice(rawIdx + rawPrefix.length) : ''

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(errorMessage)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <CircleAlert className="h-5 w-5" />
            错误详情
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg bg-muted p-4">
            <p className="text-xs text-muted-foreground mb-1.5 font-medium">错误信息</p>
            <p className="text-sm font-mono break-all leading-relaxed">{briefError}</p>
          </div>
          {rawResponse && (
            <div className="rounded-lg bg-muted p-4">
              <p className="text-xs text-muted-foreground mb-1.5 font-medium">API 原始响应</p>
              <pre className="text-xs font-mono break-all leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">{rawResponse}</pre>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCopy}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? '已复制' : '复制完整错误信息'}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RefImageDialog({ open, onOpenChange, referenceImages, maxCount, onUpload, onRemove, uploading, dragOver, onDragOver, onDragLeave, onDrop }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  referenceImages: string[]
  maxCount: number
  onUpload: (files: FileList) => void
  onRemove: (idx: number) => void
  uploading: boolean
  dragOver: boolean
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const remaining = maxCount - referenceImages.length

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>上传参考图片</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {referenceImages.length > 0 && (
            <div className="flex gap-2 flex-wrap">
              {referenceImages.map((url, idx) => (
                <div key={idx} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-border shrink-0">
                  <img src={toImageSrc(url)} alt="" className="w-full h-full object-cover" />
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={() => onRemove(idx)}
                    className="absolute top-1 right-1 h-5 w-5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60 hover:text-white"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {remaining > 0 && (
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={cn(
                'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed p-8 transition-colors cursor-pointer',
                dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-accent/50',
              )}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="h-8 w-8 text-muted-foreground animate-spin" />
              ) : (
                <Upload className="h-8 w-8 text-muted-foreground" />
              )}
              <div className="text-center">
                <p className="text-sm font-medium">拖拽图片到此处或点击上传</p>
                <p className="text-xs text-muted-foreground mt-1">还可上传 {remaining} 张，支持 PNG/JPG/WebP/GIF</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.length) onUpload(e.target.files)
                  e.target.value = ''
                }}
              />
            </div>
          )}

          {remaining <= 0 && (
            <p className="text-sm text-muted-foreground text-center">已达到最大参考图数量 ({maxCount} 张)</p>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>完成</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function HistoryCard({ item, isSelected, onClick, onRetry, onErrorClick, onImageClick, onPin, isPinned }: {
  item: HistoryItem
  isSelected: boolean
  onClick: () => void
  onRetry: () => void
  onErrorClick: () => void
  onImageClick: () => void
  onPin: () => void
  isPinned: boolean
}) {
  const isActive = item.status === 'queued' || item.status === 'processing'
  const isFailed = item.status === 'failed'
  const [imgError, setImgError] = useState(false)

  const getDuration = (item: HistoryItem) => {
    if (!item.started_at || !item.completed_at) return ''
    const ms = new Date(item.completed_at).getTime() - new Date(item.started_at).getTime()
    if (ms < 1000) return `${ms}ms`
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
    return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`
  }

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div
      className={cn(
        'group w-full flex items-start gap-3 px-3 py-3 transition-colors text-left border-b border-border/50 relative',
        isSelected ? 'bg-accent' : 'hover:bg-accent/50',
        isPinned && 'bg-amber-50/50 dark:bg-amber-950/20',
      )}
    >
      <div
        role="button"
        tabIndex={0}
        onClick={onClick}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onClick() }}
        className="flex items-start gap-3 flex-1 min-w-0 cursor-pointer bg-transparent border-none text-left p-0"
      >
        <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0 overflow-hidden">
          {isActive ? (
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          ) : isFailed ? (
            <CircleAlert className="h-6 w-6 text-destructive" />
          ) : item.result_images?.[0] && !imgError ? (
            <img src={toImageSrc(item.result_images[0])} alt="" className="w-full h-full object-cover cursor-pointer" onClick={(e) => { e.stopPropagation(); onImageClick() }} onError={() => setImgError(true)} />
          ) : (
            <ImageOff className="h-6 w-6 text-muted-foreground/50" />
          )}
        </div>
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          {isFailed ? (
            <>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onErrorClick() }}
                className="text-sm text-left truncate text-destructive underline decoration-destructive/40 underline-offset-2 hover:decoration-destructive w-full"
                title={item.error_message || '生成失败'}
              >
                {getBriefError(item.error_message)}
              </button>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-muted-foreground">{item.image_size}</span>
                <span className="text-[11px] text-muted-foreground">·</span>
                <span className="text-[11px] text-muted-foreground">{formatTime(item.created_at)}</span>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm truncate" title={item.prompt}>{item.prompt}</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-muted-foreground">{item.image_size}</span>
                <span className="text-[11px] text-muted-foreground">·</span>
                <span className="text-[11px] text-muted-foreground">{formatTime(item.created_at)}</span>
                {getDuration(item) && (
                  <>
                    <span className="text-[11px] text-muted-foreground">·</span>
                    <span className="text-[11px] text-muted-foreground">{getDuration(item)}</span>
                  </>
                )}
              </div>
            </>
          )}
        </div>
      </div>
      {!isActive && !isFailed && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={(e) => { e.stopPropagation(); onPin() }}
            className={cn(
              isPinned ? 'text-amber-500' : 'text-muted-foreground'
            )}
            title={isPinned ? '取消置顶' : '置顶'}
          >
            <Pin className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {isFailed && (
        <Button
          variant="outline"
          onClick={(e) => { e.stopPropagation(); onRetry() }}
          className="gap-1 px-2 py-1 text-[11px] text-primary border-primary/30 bg-transparent hover:bg-primary/10 hover:text-primary shrink-0 mt-1 h-auto"
        >
          <RotateCcw className="h-3 w-3" />
          重试
        </Button>
      )}
    </div>
  )
}

function TaskDetail({ item, onClose, onRetry, onErrorClick, onImageClick }: {
  item: HistoryItem
  onClose: () => void
  onRetry: () => void
  onErrorClick: () => void
  onImageClick: (imageUrl: string) => void
}) {
  const isActive = item.status === 'queued' || item.status === 'processing'
  const isFailed = item.status === 'failed'
  const [failedImages, setFailedImages] = useState<Set<number>>(new Set())

  const handleImageError = (idx: number) => {
    setFailedImages(prev => new Set(prev).add(idx))
  }

  return (
    <div className="w-full max-w-2xl mb-4">
      <div className="rounded-2xl bg-zinc-100 dark:bg-zinc-800 p-4">
        <div className="flex items-start justify-between gap-2 mb-3">
          <p className="text-sm leading-relaxed flex-1">{item.prompt}</p>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            className="rounded-full hover:bg-zinc-200 dark:hover:bg-zinc-700 shrink-0 text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {isActive ? (
          <div className="flex items-center gap-2 py-6 justify-center text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">{item.status === 'processing' ? '正在生成中...' : '排队中...'}</span>
          </div>
        ) : item.result_images?.length > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            {item.result_images.map((img, idx) => {
              const isImgFailed = failedImages.has(idx)
              return (
                <div key={idx} className="aspect-square rounded-xl overflow-hidden bg-muted cursor-pointer" onClick={() => !isImgFailed && onImageClick(img)}>
                  {isImgFailed ? (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <ImageOff className="h-8 w-8 text-muted-foreground/50" />
                    </div>
                  ) : (
                    <img src={toImageSrc(img)} alt="" className="w-full h-full object-cover" onError={() => handleImageError(idx)} />
                  )}
                </div>
              )
            })}
          </div>
        ) : isFailed ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <CircleAlert className="h-8 w-8 text-destructive" />
            <Button
              variant="ghost"
              onClick={onErrorClick}
              className="text-sm text-destructive underline decoration-destructive/40 underline-offset-2 hover:decoration-destructive h-auto px-0"
            >
              {getBriefError(item.error_message)}
            </Button>
            <Button
              variant="outline"
              onClick={onRetry}
              className="gap-1.5 px-4 py-2 rounded-xl text-primary border-primary/30 bg-transparent hover:bg-primary/10 hover:text-primary h-auto"
            >
              <RotateCcw className="h-4 w-4" />
              重新生成
            </Button>
          </div>
        ) : null}

        <div className="flex items-center gap-2 mt-3 text-[11px] text-muted-foreground">
          <span>{item.model_name}</span>
          <span>·</span>
          <span>{item.image_size}</span>
          <span>·</span>
          <span>{item.credits_charged}创作积分</span>
        </div>
      </div>
    </div>
  )
}

export default function GeneratePage() {
  const [prompt, setPrompt] = useState('')
  const [models, setModels] = useState<Model[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [imageSize, setImageSize] = useState('1024x1024')
  const [customWidth, setCustomWidth] = useState('1024')
  const [customHeight, setCustomHeight] = useState('1024')
  const [creativeCredits, setCreativeCredits] = useState(0)
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({ queued: 0, processing: 0 })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(true)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorDialogContent, setErrorDialogContent] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<HistoryItem | null>(null)
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set())
  const [referenceImages, setReferenceImages] = useState<string[]>([])
  const [refDialogOpen, setRefDialogOpen] = useState(false)
  const [refUploading, setRefUploading] = useState(false)
  const [refDragOver, setRefDragOver] = useState(false)
  const historyRef = useRef<HTMLDivElement>(null)
  const selectedModelData = models.find((m) => String(m.id) === selectedModel)

  const fetchPinnedIds = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/tasks/pinned', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setPinnedIds(new Set(data.pinned_ids || []))
    } catch {}
  }, [])

  const handlePin = useCallback(async (taskId: number) => {
    try {
      const token = localStorage.getItem('token')
      const isPinned = pinnedIds.has(taskId)
      const res = await fetch(`/api/tasks/${taskId}/pin`, {
        method: isPinned ? 'DELETE' : 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setPinnedIds(prev => {
          const next = new Set(prev)
          if (isPinned) next.delete(taskId)
          else next.add(taskId)
          return next
        })
      }
    } catch {}
  }, [pinnedIds])

  const fetchModels = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/models?source=generate', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setModels(data.models || [])
      setSelectedModel((prev) => {
        if (prev) return prev
        if (data.models?.length > 0) return String(data.models[0].id)
        return prev
      })
    } catch {}
  }, [])

  const fetchQueueStatus = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/tasks/queue', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setQueueStatus(data)
    } catch {}
  }, [])

  const fetchHistory = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/tasks/history?limit=20&source=creative', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setHistory(data.tasks || [])
    } catch {} finally {
      setHistoryLoading(false)
    }
  }, [])

  const fetchUserInfo = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (data.user) {
        setCreativeCredits(data.user.creative_credits || 0)
        localStorage.setItem('userCreativeCredits', String(data.user.creative_credits || 0))
      }
    } catch {}
  }, [])

  const handleRefUpload = useCallback(async (files: FileList | File[]) => {
    const maxRef = selectedModelData?.max_reference_images || 1
    const remaining = maxRef - referenceImages.length
    if (remaining <= 0) return

    const filesToUpload = Array.from(files).slice(0, remaining)
    setRefUploading(true)
    try {
      const token = localStorage.getItem('token')
      const uploadedUrls: string[] = []
      for (const file of filesToUpload) {
        const formData = new FormData()
        formData.append('image', file)
        const res = await fetch('/api/upload/reference-image', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        })
        const data = await res.json()
        if (res.ok && data.url) {
          uploadedUrls.push(data.url)
        }
      }
      setReferenceImages(prev => [...prev, ...uploadedUrls])
    } catch {} finally {
      setRefUploading(false)
    }
  }, [selectedModelData, referenceImages.length])

  useEffect(() => {
    fetchModels()
    fetchQueueStatus()
    fetchUserInfo()
    fetchHistory()
    fetchPinnedIds()
    const interval = setInterval(() => {
      fetchQueueStatus()
      fetchHistory()
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchModels, fetchQueueStatus, fetchUserInfo, fetchHistory, fetchPinnedIds])

  const handleRetry = useCallback(async (taskId: number) => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/tasks/${taskId}/retry`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      if (res.ok) {
        fetchHistory()
        fetchUserInfo()
        fetchQueueStatus()
      } else {
        toast.error(data.error || '重试失败')
      }
    } catch {
      toast.error('网络错误')
    }
  }, [fetchHistory, fetchUserInfo, fetchQueueStatus])

  const openErrorDialog = useCallback((errorMsg: string) => {
    setErrorDialogContent(errorMsg || '生成失败')
    setErrorDialogOpen(true)
  }, [])

  const openImagePreview = useCallback((imageUrl: string, item: HistoryItem) => {
    setPreviewImageUrl(imageUrl)
    setPreviewItem(item)
    setPreviewOpen(true)
  }, [])

  const handleSubmit = useCallback(async (text: string) => {
    if (!text.trim() || !selectedModel || loading) return
    setLoading(true)
    setMessage('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/tasks/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          prompt: text,
          model_id: parseInt(selectedModel),
          image_size: imageSize,
          image_count: 1,
          source: 'creative',
          reference_images: referenceImages.length > 0 ? referenceImages : undefined,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setMessage('任务已提交，正在排队生成...')
        setPrompt('')
        setReferenceImages([])
        fetchUserInfo()
        fetchQueueStatus()
        if (data.task?.id) {
          const modelObj = models.find((m) => String(m.id) === selectedModel)
          const newTask: HistoryItem = {
            id: data.task.id,
            prompt: text,
            status: 'queued',
            result_images: [],
            created_at: new Date().toISOString(),
            model_name: modelObj?.display_name || '',
            image_size: imageSize,
            image_count: 1,
            credits_charged: modelObj?.cost_per_image || 0,
            error_message: null,
            retry_count: 0,
            started_at: null,
            completed_at: null,
          }
          setHistory((prev) => [newTask, ...prev])
          setSelectedTaskId(data.task.id)
        }
        fetchHistory()
      } else {
        setMessage(data.error || '提交失败')
      }
    } catch {
      setMessage('网络错误')
    } finally {
      setLoading(false)
    }
  }, [selectedModel, imageSize, loading, fetchUserInfo, fetchQueueStatus, fetchHistory, models])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(''), 3000)
    return () => clearTimeout(timer)
  }, [message])

  const totalCost = selectedModelData?.cost_per_image || 0
  const isError = message.includes('失败') || message.includes('错误')
  const isWarning = !isError && (message.includes('不足') || message.includes('已达到') || message.includes('网络错误'))
  const selectedTask = history.find((h) => h.id === selectedTaskId) || null

  void creativeCredits

  return (
    <div className="flex h-screen overflow-hidden">
      {showHistory && (
        <aside
          className="flex flex-col border-r border-border bg-sidebar/50 shrink-0 overflow-hidden relative"
          style={{ width: HISTORY_WIDTH }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
            <Button
              variant="ghost"
              onClick={() => setShowHistory(false)}
              className="gap-1.5 font-semibold"
            >
              <History className="h-4 w-4" />
              <span>自由创作历史</span>
            </Button>
            <div className="flex items-center gap-1">
              <QueueStatusBadge queued={queueStatus.queued} processing={queueStatus.processing} />
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => setShowHistory(false)}
                className="text-muted-foreground"
              >
                <PanelRightClose className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div ref={historyRef} className="flex-1 overflow-y-auto">
            {historyLoading ? (
              <div className="flex flex-col">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-start gap-3 px-3 py-3 border-b border-border/50">
                    <Skeleton className="w-14 h-14 rounded-lg shrink-0" />
                    <div className="flex-1 flex flex-col gap-2 py-1">
                      <Skeleton className="h-3.5 w-full" />
                      <Skeleton className="h-3 w-2/3" />
                    </div>
                  </div>
                ))}
              </div>
            ) : history.length === 0 ? (
              <p className="text-muted-foreground text-sm text-center py-8">暂无生成记录</p>
            ) : (
              <div className="flex flex-col">
                {[...history]
                  .sort((a, b) => {
                    const aPinned = pinnedIds.has(a.id) ? 1 : 0
                    const bPinned = pinnedIds.has(b.id) ? 1 : 0
                    return bPinned - aPinned
                  })
                  .map((item) => (
                  <HistoryCard
                    key={item.id}
                    item={item}
                    isSelected={selectedTaskId === item.id}
                    onClick={() => setSelectedTaskId(selectedTaskId === item.id ? null : item.id)}
                    onRetry={() => handleRetry(item.id)}
                    onErrorClick={() => openErrorDialog(item.error_message || '生成失败')}
                    onImageClick={() => {
                      if (item.result_images?.[0]) {
                        openImagePreview(item.result_images[0], item)
                      }
                    }}
                    onPin={() => handlePin(item.id)}
                    isPinned={pinnedIds.has(item.id)}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>
      )}

      <div className={cn("flex-1 flex flex-col items-center min-w-0 overflow-y-auto relative", !selectedTask && !loading && "justify-center")}>
        {(message || loading) && (
          <div className="absolute top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-md px-4 animate-in fade-in slide-in-from-top-2 duration-300">
            <Alert
              variant={isError ? 'destructive' : 'default'}
              className={cn(
                isError && 'border-red-500/50 bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-400',
                isWarning && 'border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
                !isError && !isWarning && !loading && 'border-emerald-500/50 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
              )}
            >
              {loading ? <Loader2 className="size-4 animate-spin" /> : isError ? <CircleAlert className="size-4" /> : isWarning ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
              <AlertTitle>{loading ? '正在提交任务...' : message}</AlertTitle>
            </Alert>
          </div>
        )}

        {!showHistory && (
          <Button
            variant="outline"
            onClick={() => setShowHistory(true)}
            className="absolute left-4 top-4 gap-1.5 px-3 py-1.5 shadow-sm z-10"
          >
            <History className="h-4 w-4" />
            <span>历史</span>
          </Button>
        )}

        {(selectedTask || loading) && <div className="flex-1" />}

        <div className="w-full max-w-2xl px-8 pb-8 flex flex-col items-center">
          {!selectedTask && (
            <h1 className="text-3xl font-bold mb-8 text-center">你好，想创作什么？</h1>
          )}

          {selectedTask && (
            <TaskDetail
              item={selectedTask}
              onClose={() => setSelectedTaskId(null)}
              onRetry={() => handleRetry(selectedTask.id)}
              onErrorClick={() => openErrorDialog(selectedTask.error_message || '生成失败')}
              onImageClick={(imgUrl) => openImagePreview(imgUrl, selectedTask)}
            />
          )}

          <div className="w-full rounded-3xl bg-zinc-100 dark:bg-zinc-800 p-4">
            {referenceImages.length > 0 && (
              <div className="flex gap-2 mb-3 flex-wrap">
                {referenceImages.map((url, idx) => (
                  <div key={idx} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-border shrink-0">
                    <img src={toImageSrc(url)} alt="" className="w-full h-full object-cover" />
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={() => setReferenceImages(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60 hover:text-white"
                    >
                      <X className="h-2.5 w-2.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
            <Composer
              placeholder="描述你想要生成的图片..."
              value={prompt}
              onChange={setPrompt}
              onSubmit={handleSubmit}
              isLoading={loading}
              maxRows={4}
              showToolsButton={false}
              showSendButton={false}
            />

            <div className="flex items-center justify-between px-2 pt-2 gap-3">
              <div className="flex items-center gap-2">
                <ModelPopover
                  models={models}
                  selectedModel={selectedModel}
                  onSelect={(v) => { setSelectedModel(v); setReferenceImages([]) }}
                  disabled={loading}
                />
                <SizePopover
                  imageSize={imageSize}
                  onSelect={setImageSize}
                  disabled={loading}
                  width={customWidth}
                  height={customHeight}
                  onWidthChange={setCustomWidth}
                  onHeightChange={setCustomHeight}
                  ratios={Array.isArray(selectedModelData?.supported_sizes?.ratios) ? selectedModelData.supported_sizes.ratios : defaultRatios}
                />
                {selectedModelData?.supports_reference_image && (selectedModelData?.max_reference_images ?? 0) > 0 ? (
                  <Button
                    variant="ghost"
                    disabled={loading}
                    onClick={() => setRefDialogOpen(true)}
                    className={cn(
                      'gap-1 h-9 px-3 rounded-xl overflow-hidden',
                      referenceImages.length > 0
                        ? 'bg-primary/10 text-primary ring-1 ring-primary/30'
                        : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-600 dark:text-zinc-400 hover:bg-zinc-300 dark:hover:bg-zinc-600',
                    )}
                  >
                    <svg className="h-4 w-4 shrink-0" viewBox="0 0 1024 1024" fill="currentColor"><path d="M938.666667 553.92V768c0 64.8-52.533333 117.333333-117.333334 117.333333H202.666667c-64.8 0-117.333333-52.533333-117.333334-117.333333V256c0-64.8 52.533333-117.333333 117.333334-117.333333h618.666666c64.8 0 117.333333 52.533333 117.333334 117.333333v297.92z m-64-74.624V256a53.333333 53.333333 0 0 0-53.333334-53.333333H202.666667a53.333333 53.333333 0 0 0-53.333334 53.333333v344.48A290.090667 290.090667 0 0 1 192 597.333333a286.88 286.88 0 0 1 183.296 65.845334C427.029333 528.384 556.906667 437.333333 704 437.333333c65.706667 0 126.997333 16.778667 170.666667 41.962667z m0 82.24c-5.333333-8.32-21.130667-21.653333-43.648-32.917333C796.768 511.488 753.045333 501.333333 704 501.333333c-121.770667 0-229.130667 76.266667-270.432 188.693334-2.730667 7.445333-7.402667 20.32-13.994667 38.581333-7.68 21.301333-34.453333 28.106667-51.370666 13.056-16.437333-14.634667-28.554667-25.066667-36.138667-31.146667A222.890667 222.890667 0 0 0 192 661.333333c-14.464 0-28.725333 1.365333-42.666667 4.053334V768a53.333333 53.333333 0 0 0 53.333334 53.333333h618.666666a53.333333 53.333333 0 0 0 53.333334-53.333333V561.525333zM320 480a96 96 0 1 1 0-192 96 96 0 0 1 0 192z m0-64a32 32 0 1 0 0-64 32 32 0 0 0 0 64z" /></svg>
                    <span className="truncate min-w-0">参考图{referenceImages.length > 0 ? ` ${referenceImages.length}` : ''}</span>
                  </Button>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
                  消耗 {totalCost} 创作积分
                </span>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  onClick={() => handleSubmit(prompt)}
                  disabled={loading || !prompt.trim() || !selectedModel}
                  className={cn(
                    'rounded-full',
                    prompt.trim() && selectedModel && !loading
                      ? 'bg-[#00bbff] text-white hover:bg-[#00a3e0]'
                      : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500',
                  )}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          </div>

        </div>
      </div>

      <ErrorDialog
        open={errorDialogOpen}
        onOpenChange={setErrorDialogOpen}
        errorMessage={errorDialogContent}
      />

      <ImagePreviewOverlay
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        imageUrl={previewImageUrl}
        item={previewItem}
      />

      <RefImageDialog
        open={refDialogOpen}
        onOpenChange={setRefDialogOpen}
        referenceImages={referenceImages}
        maxCount={selectedModelData?.max_reference_images || 1}
        onUpload={(files) => handleRefUpload(files)}
        onRemove={(idx) => setReferenceImages(prev => prev.filter((_, i) => i !== idx))}
        uploading={refUploading}
        dragOver={refDragOver}
        onDragOver={(e) => { e.preventDefault(); setRefDragOver(true) }}
        onDragLeave={() => setRefDragOver(false)}
        onDrop={(e) => {
          e.preventDefault()
          setRefDragOver(false)
          if (e.dataTransfer.files.length) handleRefUpload(e.dataTransfer.files)
        }}
      />
    </div>
  )
}
