import { useState, useEffect, useRef, memo } from 'react'
import { Wand2, ImagePlus, RotateCcw, Loader2, Trash2, FlipHorizontal, Eye, MoreHorizontal } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
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
import { cn, toImageSrc } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import type { PromptCard, CardImage, Template, ImageModel } from '@/pages/WorkspacePage'
import WorkspaceImageGalleryDialog from './WorkspaceImageGalleryDialog'
import ImagePreviewOverlay from '@/components/ImagePreviewOverlay'
import ApiErrorDialog from '@/components/ApiErrorDialog'

interface FlipCardProps {
  card: PromptCard
  images: CardImage[]
  batchMode: boolean
  isSelected: boolean
  flipAllToImage: boolean
  selectedDeepenTemplate: Template | null
  selectedRegenTemplate: Template | null
  selectedImageModel: ImageModel | null
  selectedSize: string | null
  onToggleSelect: (id: number) => void
  onCardUpdated: (card: PromptCard) => void
  onCardDeleted: (id: number) => void
  onCardGeneratingImage?: (id: number, generating: boolean) => void
  // 外部批量操作加载状态
  batchDeepening?: boolean
  batchRegenerating?: boolean
  batchGeneratingImage?: boolean
}

export default memo(function WorkspaceFlipCard({
  card,
  images,
  batchMode,
  isSelected,
  flipAllToImage,
  selectedDeepenTemplate,
  selectedRegenTemplate,
  selectedImageModel,
  selectedSize,
  onToggleSelect,
  onCardUpdated,
  onCardDeleted,
  onCardGeneratingImage,
  batchDeepening = false,
  batchRegenerating = false,
  batchGeneratingImage = false,
}: FlipCardProps) {
  const [isFlipped, setIsFlipped] = useState(!card.sel_img_url)
  const [prompt, setPrompt] = useState(card.prompt)
  const [generatingImage, setGeneratingImage] = useState(false)
  const [deepening, setDeepening] = useState(false)
  const [regeneratingPrompt, setRegeneratingPrompt] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardRef = useRef(card)
  const onCardUpdatedRef = useRef(onCardUpdated)

  useEffect(() => { cardRef.current = card }, [card])
  useEffect(() => { onCardUpdatedRef.current = onCardUpdated }, [onCardUpdated])

  useEffect(() => {
    setPrompt(card.prompt)
  }, [card.prompt])

  // 全选时，有图片的卡片翻转到图片面
  useEffect(() => {
    if (flipAllToImage && card.sel_img_url && isFlipped) {
      setIsFlipped(false)
    }
  }, [flipAllToImage, card.sel_img_url])

  // 当图片生成完成时（sel_img_url 从 null 变为有值），自动翻转到图片面
  useEffect(() => {
    if (card.sel_img_url && isFlipped) {
      setIsFlipped(false)
    }
  }, [card.sel_img_url])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  const handlePromptChange = (val: string) => {
    setPrompt(val)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => savePrompt(val), 800)
  }

  const handlePromptBlur = () => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    savePrompt(prompt)
  }

  const savePrompt = async (val: string) => {
    if (val === card.prompt) return
    try {
      await apiFetch(`/api/workspace/cards/${card.id}`, {
        method: 'PATCH',
        body: { prompt: val },
      })
      onCardUpdated({ ...card, prompt: val })
    } catch {
      toast.error('保存失败')
    }
  }

  const handleDeepen = async () => {
    if (!selectedDeepenTemplate) { toast.error('请先在生成配置中选择细化模板'); return }
    setDeepening(true)
    try {
      const res = await apiFetch(`/api/workspace/cards/${card.id}/deepen`, {
        method: 'POST',
        body: { prompt, template_id: selectedDeepenTemplate.id },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '细化失败')
      setPrompt(data.new_prompt)
      onCardUpdated({ ...card, prompt: data.new_prompt })
      toast.success('提示词已细化')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setDeepening(false)
    }
  }

  const handleRegeneratePrompt = async () => {
    if (!selectedRegenTemplate) { toast.error('请先在操作栏选择重生成模板'); return }
    setRegeneratingPrompt(true)
    try {
      const res = await apiFetch(`/api/workspace/cards/${card.id}/regenerate-prompt`, {
        method: 'POST',
        body: { prompt, template_id: selectedRegenTemplate.id },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '重新生成失败')
      setPrompt(data.new_prompt)
      onCardUpdated({ ...card, prompt: data.new_prompt })
      toast.success('提示词已重新生成')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setRegeneratingPrompt(false)
    }
  }

  const handleGenerateImage = async () => {
    if (!selectedImageModel) { toast.error('请先在操作栏选择图片模型'); return }
    if (!selectedSize) { toast.error('请先在操作栏选择尺寸'); return }
    setGeneratingImage(true)
    onCardGeneratingImage?.(card.id, true)
    try {
      const res = await apiFetch(`/api/workspace/cards/${card.id}/generate-image`, {
        method: 'POST',
        body: { prompt, api_id: selectedImageModel.id, size: selectedSize },
      })
      if (!res.ok) throw new Error()
      toast.success('已提交生图任务')
      setIsFlipped(false)
    } catch {
      toast.error('提交生图失败')
      setGeneratingImage(false)
      onCardGeneratingImage?.(card.id, false)
    }
  }

  const handleDelete = async () => {
    try {
      const res = await apiFetch(`/api/workspace/cards/${card.id}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error()
      onCardDeleted(card.id)
    } catch {
      toast.error('删除卡片失败')
    }
  }

  const handleImageSelected = (image: CardImage) => {
    onCardUpdated({ ...card, sel_img_url: image.image_url, sel_img_id: image.id, selected_image_id: image.id })
  }

  const openImagePreview = () => {
    if (!card.sel_img_url) return
    setPreviewOpen(true)
  }

  const openErrorDialog = () => {
    if (!failedImages[0]?.error_message) return
    setErrorDialogOpen(true)
  }

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (batchMode) {
      onToggleSelect(card.id)
    }
  }

  const hasImage = !!card.sel_img_url
  const completedImages = images.filter(i => i.status === 'completed')
  const failedImages = images.filter(i => i.status === 'failed')
  const pendingImageCount = images.filter(i => i.status === 'pending' || i.status === 'generating').length
  const hasFailedImage = !hasImage && pendingImageCount === 0 && failedImages.length > 0
  const hasGeneratingImage = generatingImage || pendingImageCount > 0 || batchGeneratingImage
  const isLoading = deepening || regeneratingPrompt || generatingImage || pendingImageCount > 0 || batchDeepening || batchRegenerating || batchGeneratingImage

  return (
    <>
      <div
        className={cn(
          'relative rounded-2xl transition-all duration-200',
          isLoading && 'p-[2px] shine-border-bg',
        )}
        style={{ aspectRatio: '3/5' }}
      >
        <div
          onClick={handleCardClick}
          className={cn(
            'relative rounded-2xl border overflow-hidden transition-all duration-200 h-full',
            batchMode && 'cursor-pointer',
            isSelected && batchMode ? 'ring-2 ring-gray-400 border-gray-400/50 bg-gray-50/5' : 'border-border bg-card',
          )}
        >
        <div className="absolute inset-0" style={{ perspective: '1000px' }}>
          <div
            className="relative w-full h-full transition-transform duration-500"
            style={{
              transformStyle: 'preserve-3d',
              transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            }}
          >
            <div
              className="group absolute inset-0 bg-muted/30"
              style={{ backfaceVisibility: 'hidden' }}
            >
              {hasGeneratingImage ? (
                <div className="flex flex-col items-center justify-center h-full gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <span className="text-xs text-muted-foreground">生成中...</span>
                </div>
              ) : hasFailedImage ? (
                <div
                  className="flex flex-col items-center justify-center h-full gap-3 cursor-pointer px-4 text-center"
                >
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        className="flex h-16 w-16 items-center justify-center rounded-xl border border-destructive/30 bg-destructive/10 text-3xl font-semibold text-destructive shadow-sm"
                      >
                        !
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {failedImages[0]?.error_message || '生图失败'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <span className="text-xs text-destructive/90 leading-relaxed">
                    {!batchMode && (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); openErrorDialog() }}
                        className="font-medium underline underline-offset-2 decoration-destructive/60 hover:text-destructive"
                      >
                        生图失败
                      </button>
                    )}
                    {batchMode && <span className="font-medium">生图失败</span>}
                    {!batchMode && <><br />点击翻转编辑或重试</>}
                  </span>
                </div>
              ) : hasImage ? (
                <div
                  className="relative w-full h-full cursor-pointer group"
                  onClick={(e) => { if (!batchMode) { e.stopPropagation(); setShowGallery(true) } }}
                >
                  <img
                    src={toImageSrc(card.sel_img_url!, { width: 400, height: 600 })}
                    alt=""
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {completedImages.length > 1 && (
                    <div className="absolute bottom-2.5 right-2.5 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full">
                      {completedImages.length} 张
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors" />
                </div>
              ) : (
                <div
                  className="flex flex-col items-center justify-center h-full gap-2 cursor-pointer"
                >
                  <ImagePlus className="h-8 w-8 text-muted-foreground/40" />
                  <span className="text-xs text-muted-foreground text-center px-4">
                    暂无图片
                    {!batchMode && <><br />点击翻转编辑</>}
                  </span>
                </div>
              )}

              {!batchMode && (
                <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100">
                  {hasImage && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openImagePreview() }}
                          className="flex h-7 items-center justify-center rounded-lg bg-black/45 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/65 px-2"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </TooltipTrigger>
                        <TooltipContent side="left">查看图片</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setIsFlipped(true) }}
                        className="flex h-7 items-center justify-center rounded-lg bg-black/45 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/65 px-2"
                        aria-label="翻转卡片"
                      >
                        <FlipHorizontal className="h-3.5 w-3.5" />
                      </TooltipTrigger>
                      <TooltipContent side="left">翻转卡片</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}

              <div className="absolute bottom-2.5 left-2.5 flex gap-1">
                <span className="text-[10px] text-white/70 bg-black/35 px-2 py-0.5 rounded-full">#{card.card_index}</span>
              </div>
            </div>

            <div
              className={cn(
                "absolute inset-0 bg-background flex flex-col p-3 gap-2",
                batchMode && "cursor-pointer"
              )}
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
            >
              {/* 批量选择模式下的透明点击遮罩层，覆盖在 Textarea 上方，阻止编辑并响应选择 */}
              {batchMode && (
                <div className="absolute inset-0 z-10 cursor-pointer" onClick={handleCardClick} />
              )}
              <div className="flex items-center justify-between gap-2 shrink-0">
                <span className="text-[10px] text-muted-foreground font-medium">#{card.card_index} 提示词</span>
                {/* 生成失败：红色圆角矩形标签 */}
                {hasFailedImage && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border border-red-500 text-red-500 font-medium">
                    生成失败
                  </span>
                )}
                {/* 已生成X张：绿色圆角矩形标签（生成中时不显示） */}
                {!hasFailedImage && !hasGeneratingImage && completedImages.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border border-emerald-500 text-emerald-500 font-medium">
                    已生成{completedImages.length}张
                  </span>
                )}
              </div>

              <Textarea
                value={prompt}
                onChange={e => handlePromptChange(e.target.value)}
                onBlur={handlePromptBlur}
                className="flex-1 text-xs resize-none min-h-0 leading-relaxed"
                placeholder="提示词..."
                disabled={isLoading || batchMode}
              />

              {!batchMode && (
                <div className="flex justify-end gap-2 shrink-0">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        type="button"
                        onClick={() => setIsFlipped(false)}
                        className="flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[11px] text-black transition-colors hover:bg-white/90"
                      >
                        <FlipHorizontal className="h-3.5 w-3.5" />
                        翻转卡片
                      </TooltipTrigger>
                      <TooltipContent side="top">返回图片面</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        size="sm"
                        className="h-8 gap-1.5 rounded-lg bg-black px-3 text-[11px] text-white hover:bg-black/85"
                      >
                        <MoreHorizontal className="h-3.5 w-3.5" />
                        操作
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" sideOffset={6} className="relative z-[100] w-44">
                      <DropdownMenuItem onClick={handleRegeneratePrompt} disabled={isLoading || regeneratingPrompt}>
                        {regeneratingPrompt ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                        重新生成提示词
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleDeepen} disabled={isLoading || deepening}>
                        {deepening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
                        细化提示词
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleGenerateImage} disabled={isLoading || generatingImage}>
                        {generatingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                        {hasImage ? '重新生成图片' : '生成图片'}
                      </DropdownMenuItem>
                      <DropdownMenuItem variant="destructive" onClick={handleDelete} disabled={isLoading}>
                        <Trash2 className="h-4 w-4 text-red-600" />
                        删除卡片
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>
          </div>
        </div>
        </div>
      </div>

      <WorkspaceImageGalleryDialog
        open={showGallery}
        onClose={() => setShowGallery(false)}
        cardId={card.id}
        onImageSelected={handleImageSelected}
      />

      <ImagePreviewOverlay
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        imageUrl={card.sel_img_url}
        item={{
          prompt,
          model_name: selectedImageModel?.display_name || selectedImageModel?.name,
          image_size: card.sel_img_size || selectedSize || undefined,
          created_at: card.updated_at || card.created_at,
        }}
      />

      <ApiErrorDialog
        open={errorDialogOpen}
        onOpenChange={setErrorDialogOpen}
        errorMessage={failedImages[0]?.error_message || '生图失败'}
      />
    </>
  )
})
