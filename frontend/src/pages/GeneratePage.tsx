import { useState, useRef, memo } from 'react'
import { Composer } from '@/components/ui/composer'
import { cn, toImageSrc } from '@/lib/utils'
import { Image, ImageOff, Loader2, ChevronDown, X, RotateCcw, CheckCircle2, Pin, Upload, AlertTriangle, AlertCircle } from 'lucide-react'
import { HugeiconsIcon, TimeScheduleIcon, CubeIcon, CropIcon, Image02Icon, ArrowUp02Icon, SidebarRightIcon } from '@/components/icons'
import { ShineBorder } from '@/components/ui/shine-border'
import ImagePreviewOverlay from '@/components/ImagePreviewOverlay'
import ApiErrorDialog from '@/components/ApiErrorDialog'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
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
import { useGeneratePage, type Model, type HistoryItem, defaultRatios, getBriefError } from '@/hooks/useGeneratePage'

const HISTORY_WIDTH = 320
const PROMPT_CACHE_KEY = 'creative:prompt-draft'

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
        <HugeiconsIcon icon={CubeIcon} size={16} strokeWidth={1.8} className="shrink-0" />
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
        <HugeiconsIcon icon={CropIcon} size={16} strokeWidth={1.8} className="shrink-0" />
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
                  <img src={toImageSrc(url, { width: 150, height: 150 })} alt="" className="w-full h-full object-cover" />
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

const HistoryCard = memo(function HistoryCard({ item, isSelected, onClick, onRetry, onErrorClick, onImageClick, onPin, isPinned }: {
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
            <AlertCircle className="h-6 w-6 text-destructive" />
          ) : item.result_images?.[0] && !imgError ? (
            <img src={toImageSrc(item.result_images[0], { width: 150, height: 150 })} alt="" className="w-full h-full object-cover cursor-pointer" onClick={(e) => { e.stopPropagation(); onImageClick() }} onError={() => setImgError(true)} />
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
})

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
                    <img src={toImageSrc(img, { width: 400, height: 400 })} alt="" className="w-full h-full object-cover" onError={() => handleImageError(idx)} />
                  )}
                </div>
              )
            })}
          </div>
        ) : isFailed ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <AlertCircle className="h-8 w-8 text-destructive" />
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
  const historyRef = useRef<HTMLDivElement>(null)

  const {
    prompt, setPrompt,
    models, selectedModel, setSelectedModel,
    imageSize, setImageSize,
    customWidth, setCustomWidth,
    customHeight, setCustomHeight,
    selectedModelData,
    queueStatus,
    loading, message,
    history, historyLoading,
    showHistory, setShowHistory,
    selectedTaskId, setSelectedTaskId,
    errorDialogOpen, setErrorDialogOpen,
    errorDialogContent,
    previewOpen, setPreviewOpen,
    previewImageUrl, previewItem,
    pinnedIds, handlePin,
    referenceImages, setReferenceImages,
    refDialogOpen, setRefDialogOpen,
    refUploading, refDragOver, setRefDragOver,
    totalCost, isError, isWarning,
    selectedTask, sortedHistory,
    handleRetry, openErrorDialog, openImagePreview,
    handleSubmit, handleRefUpload,
  } = useGeneratePage({
    modelSource: 'generate',
    taskSource: 'creative',
    creditField: 'creative_credits',
    creditStorageKey: 'userCreativeCredits',
    promptCacheKey: PROMPT_CACHE_KEY,
  })

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
              <HugeiconsIcon icon={TimeScheduleIcon} size={16} strokeWidth={1.8} />
              <span>自由创作历史</span>
            </Button>
            <div className="flex items-center gap-1">
              <QueueStatusBadge queued={queueStatus.queued} processing={queueStatus.processing} />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowHistory(false)}
                className="text-muted-foreground"
              >
                <HugeiconsIcon icon={SidebarRightIcon} size={16} strokeWidth={1.8} />
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
                {sortedHistory.map((item) => (
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
              {loading ? <Loader2 className="size-4 animate-spin" /> : isError ? <AlertCircle className="size-4" /> : isWarning ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
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
            <HugeiconsIcon icon={TimeScheduleIcon} size={16} strokeWidth={1.8} />
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

          <div className="w-full rounded-3xl bg-zinc-100 dark:bg-zinc-800 p-4 relative overflow-hidden">
            {loading && (
              <ShineBorder
                shineColor={["#00bbff", "#00d4ff", "#00e9ff"]}
                duration={3}
                borderWidth={2}
              />
            )}
            {referenceImages.length > 0 && (
              <div className="flex gap-2 mb-3 flex-wrap">
                {referenceImages.map((url, idx) => (
                  <div key={idx} className="relative group w-14 h-14 rounded-lg overflow-hidden border border-border shrink-0">
                    <img src={toImageSrc(url, { width: 150, height: 150 })} alt="" className="w-full h-full object-cover" />
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
                    <HugeiconsIcon icon={Image02Icon} size={16} strokeWidth={1.8} className="shrink-0" />
                    <span className="truncate min-w-0">参考图{referenceImages.length > 0 ? ` ${referenceImages.length}` : ''}</span>
                  </Button>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-zinc-400 dark:text-zinc-500 whitespace-nowrap">
                  消张{totalCost} 创作积分
                </span>
                <Button
                  variant="ghost"
                  size="icon-lg"
                  onClick={() => handleSubmit(prompt)}
                  disabled={loading || !prompt.trim() || !selectedModel}
                  className={cn(
                    'rounded-lg',
                    prompt.trim() && selectedModel && !loading
                      ? 'bg-[#00bbff] text-white hover:bg-[#00a3e0]'
                      : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500',
                  )}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <HugeiconsIcon icon={ArrowUp02Icon} size={18} strokeWidth={2} />
                  )}
                </Button>
              </div>
            </div>
          </div>

        </div>
      </div>

      <ApiErrorDialog
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
