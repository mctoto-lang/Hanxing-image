import { useState, useEffect, useRef, memo } from 'react'
import { Wand2, ImagePlus, RotateCcw, Loader2, FlipHorizontal, Eye, MoreHorizontal, AlertTriangle, Search, Check, Undo2, Languages, Images } from 'lucide-react'
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
import { getTranslationStatus, type PromptCard, type CardImage, type Template, type ImageModel } from '@/pages/WorkspacePage'
import WorkspaceImageGalleryDialog from './WorkspaceImageGalleryDialog'
import ImagePreviewOverlay from '@/components/ImagePreviewOverlay'
import ApiErrorDialog from '@/components/ApiErrorDialog'
import { AlertCircleIcon, HugeiconsIcon } from '@/components/icons'
import { normalizeReferenceImages } from '@/lib/workspace-reference-images'

interface FlipCardProps {
  card: PromptCard
  images: CardImage[]
  batchMode: boolean
  isSelected: boolean
  flipAllToImage: boolean
  selectedDeepenTemplate: Template | null
  selectedRegenTemplate: Template | null
  selectedTranslateTemplate: Template | null
  selectedImageModel: ImageModel | null
  selectedSize: string | null
  onToggleSelect: (id: number) => void
  onCardUpdated: (card: PromptCard) => void
  onCardGeneratingImage?: (id: number, generating: boolean) => void
  // 外部批量操作加载状态
  batchDeepening?: boolean
  batchRegenerating?: boolean
  batchGeneratingImage?: boolean
  batchTranslating?: boolean
}

export function shouldAutoFlipToImage({
  hasDisplayImage,
  displayImageChanged,
  isEditingPrompt,
  isManuallyFlippedToBack,
}: {
  hasDisplayImage: boolean
  displayImageChanged: boolean
  isEditingPrompt: boolean
  isManuallyFlippedToBack: boolean
}) {
  if (!hasDisplayImage || !displayImageChanged) return false
  if (isEditingPrompt || isManuallyFlippedToBack) return false
  return true
}

export function getGenerationPrompt({
  displayLanguage,
  prompt,
  translatedPrompt,
}: {
  displayLanguage: 'zh' | 'en'
  prompt: string
  translatedPrompt: string | null
}) {
  return displayLanguage === 'en' ? translatedPrompt || prompt : prompt
}

export function getFlipFaceInteractionProps(isFlipped: boolean) {
  return {
    imageFace: { pointerEvents: isFlipped ? 'none' : 'auto', ariaHidden: isFlipped },
    promptFace: { pointerEvents: isFlipped ? 'auto' : 'none', ariaHidden: !isFlipped },
  } as const
}

function normalizeCardReferenceImages(referenceImages: string | string[] | null | undefined) {
  if (typeof referenceImages !== 'string') return normalizeReferenceImages(referenceImages)
  try {
    return normalizeReferenceImages(JSON.parse(referenceImages))
  } catch {
    return []
  }
}

export function getReferenceImageIndicator(referenceImages: string | string[] | null | undefined) {
  const count = normalizeCardReferenceImages(referenceImages).length
  return count > 0 ? { count, label: `此卡片带有 ${count} 张参考图片` } : null
}

export const REFERENCE_IMAGE_INDICATOR_CLASSES = {
  image: 'flex h-5 w-5 cursor-default items-center justify-center rounded-full bg-black/35 text-white shadow-sm backdrop-blur-sm',
  prompt: 'flex h-5 min-w-5 cursor-default items-center justify-center rounded-md border border-violet-600 bg-transparent px-1.5 text-violet-600 transition-colors hover:bg-violet-50 dark:border-violet-400 dark:text-violet-400 dark:hover:bg-violet-500/10',
} as const

export default memo(function WorkspaceFlipCard({
  card,
  images,
  batchMode,
  isSelected,
  flipAllToImage,
  selectedDeepenTemplate,
  selectedRegenTemplate,
  selectedTranslateTemplate,
  selectedImageModel,
  selectedSize,
  onToggleSelect,
  onCardUpdated,
  onCardGeneratingImage,
  batchDeepening = false,
  batchRegenerating = false,
  batchGeneratingImage = false,
  batchTranslating = false,
}: FlipCardProps) {
  const [isFlipped, setIsFlipped] = useState(!card.sel_img_url)
  const [prompt, setPrompt] = useState(card.prompt)
  const [displayLanguage, setDisplayLanguage] = useState<'zh' | 'en'>(card.display_language === 'en' && card.translated_prompt ? 'en' : 'zh')
  const [generatingImage, setGeneratingImage] = useState(false)
  const [deepening, setDeepening] = useState(false)
  const [regeneratingPrompt, setRegeneratingPrompt] = useState(false)
  const [translating, setTranslating] = useState(false)
  const [showGallery, setShowGallery] = useState(false)
  const [galleryInitialMode, setGalleryInitialMode] = useState<'selected' | 'reference'>('selected')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [previousPrompt, setPreviousPrompt] = useState<string | null>(null)
  const [referenceImages, setReferenceImages] = useState(() => normalizeCardReferenceImages(card.reference_images))

  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cardRef = useRef(card)
  const onCardUpdatedRef = useRef(onCardUpdated)
  const previousDisplayImageUrlRef = useRef<string | null>(null)
  const isEditingPromptRef = useRef(false)
  const manuallyFlippedToBackRef = useRef(!card.sel_img_url)

  const completedImages = images.filter(i => i.status === 'completed')
  const failedImages = images.filter(i => i.status === 'failed')
  const pendingImageCount = images.filter(i => i.status === 'pending' || i.status === 'generating').length
  const fallbackImage = images.find(i => i.id === card.selected_image_id && i.image_url) || images.find(i => i.is_selected && i.image_url) || completedImages.find(i => i.image_url)
  const displayImageUrl = card.sel_img_url || fallbackImage?.image_url || null
  const displayImage = images.find(image => image.id === card.selected_image_id && image.image_url)
    || images.find(image => image.is_selected && image.image_url)
    || completedImages.find(image => image.image_url)
  const failedImageCount = failedImages.length
  const failedImageTooltip = failedImageCount > 0
    ? `${failedImageCount}张图片生成失败${failedImages[0]?.error_message ? `：${failedImages[0].error_message}` : ''}`
    : '生图失败'
  const faceInteraction = getFlipFaceInteractionProps(isFlipped)
  const referenceImageIndicator = getReferenceImageIndicator(referenceImages)

  useEffect(() => { cardRef.current = card }, [card])
  useEffect(() => { onCardUpdatedRef.current = onCardUpdated }, [onCardUpdated])

  useEffect(() => {
    setReferenceImages(normalizeCardReferenceImages(card.reference_images))
  }, [card.reference_images])

  const handleReferenceImagesChanged = (nextReferenceImages: string[]) => {
    const normalized = normalizeReferenceImages(nextReferenceImages)
    setReferenceImages(normalized)
    const updatedCard = { ...cardRef.current, reference_images: JSON.stringify(normalized) }
    cardRef.current = updatedCard
    onCardUpdatedRef.current(updatedCard)
  }

  useEffect(() => {
    // 用户正在编辑时不重置本地 prompt，避免轮询打断输入
    if (isEditingPromptRef.current) return
    setPrompt(card.prompt)
  }, [card.prompt])

  useEffect(() => {
    if (!card.translated_prompt && displayLanguage === 'en') setDisplayLanguage('zh')
  }, [card.translated_prompt, displayLanguage])

  useEffect(() => {
    if (flipAllToImage && displayImageUrl && isFlipped) {
      manuallyFlippedToBackRef.current = false
      setIsFlipped(false)
    }
  }, [flipAllToImage, displayImageUrl, isFlipped])

  useEffect(() => {
    const previousDisplayImageUrl = previousDisplayImageUrlRef.current
    previousDisplayImageUrlRef.current = displayImageUrl

    if (shouldAutoFlipToImage({
      hasDisplayImage: !!displayImageUrl,
      displayImageChanged: !!displayImageUrl && displayImageUrl !== previousDisplayImageUrl,
      isEditingPrompt: isEditingPromptRef.current,
      isManuallyFlippedToBack: manuallyFlippedToBackRef.current,
    })) {
      manuallyFlippedToBackRef.current = false
      setIsFlipped(false)
    }
  }, [displayImageUrl])

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    }
  }, [])

  const handlePromptChange = (val: string) => {
    isEditingPromptRef.current = true
    setPrompt(val)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => savePrompt(val), 800)
  }

  const handlePromptBlur = () => {
    isEditingPromptRef.current = false
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

  const updatePrompt = (nextPrompt: string) => {
    setPrompt(nextPrompt)
    onCardUpdated({ ...card, prompt: nextPrompt })
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
      setPreviousPrompt(prompt)
      updatePrompt(data.new_prompt)
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
      setPreviousPrompt(prompt)
      updatePrompt(data.new_prompt)
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
        body: {
          prompt: getGenerationPrompt({
            displayLanguage,
            prompt,
            translatedPrompt: card.translated_prompt ?? null,
          }),
          api_id: selectedImageModel.id,
          size: selectedSize,
        },
      })
      if (!res.ok) throw new Error()
      toast.success('已提交生图任务')
      manuallyFlippedToBackRef.current = false
      setIsFlipped(false)
    } catch {
      toast.error('提交生图失败')
      setGeneratingImage(false)
      onCardGeneratingImage?.(card.id, false)
    }
  }

  const handleTranslate = async () => {
    if (!selectedTranslateTemplate) { toast.error('请先在生成配置中选择翻译模板'); return }
    setTranslating(true)
    try {
      const res = await apiFetch(`/api/workspace/cards/${card.id}/translate-prompt`, {
        method: 'POST',
        body: { template_id: selectedTranslateTemplate.id },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '翻译失败')
      onCardUpdated({ ...card, translated_prompt: data.translated_prompt, translation_source_prompt: data.translation_source_prompt, translation_status: 'synced' })
      setDisplayLanguage('en')
      toast.success('提示词已翻译为英文')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setTranslating(false)
    }
  }

  const handleLanguageChange = async (language: 'zh' | 'en') => {
    if (language === displayLanguage) return
    setDisplayLanguage(language)
    try {
      const res = await apiFetch(`/api/workspace/cards/${card.id}`, {
        method: 'PATCH',
        body: { display_language: language },
      })
      if (!res.ok) throw new Error()
      onCardUpdated({ ...card, display_language: language })
    } catch {
      setDisplayLanguage(displayLanguage)
      toast.error('切换显示语言失败')
    }
  }

  const handleUndoPrompt = async () => {
    if (!previousPrompt) return
    try {
      const res = await apiFetch(`/api/workspace/cards/${card.id}`, {
        method: 'PATCH',
        body: { prompt: previousPrompt },
      })
      if (!res.ok) throw new Error()
      updatePrompt(previousPrompt)
      setPreviousPrompt(null)
      toast.success('已撤回到上一次提示词')
    } catch {
      toast.error('撤回失败')
    }
  }

  const handleImageSelected = (image: CardImage) => {
    onCardUpdated({
      ...card,
      sel_img_url: image.image_url,
      sel_img_id: image.id,
      selected_image_id: image.id,
      sel_img_model_name: image.model_name || null,
      sel_img_size: image.size,
      sel_img_started_at: image.generation_started_at || null,
      sel_img_completed_at: image.generation_completed_at || null,
      sel_img_created_at: image.created_at,
    })
  }

  const openImagePreview = () => {
    if (!displayImageUrl) return
    setPreviewOpen(true)
  }

  const openImageInNewTab = () => {
    if (!displayImageUrl) return
    const imageUrl = toImageSrc(displayImageUrl)
    const escapedImageUrl = imageUrl
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')

    const previewHtml = `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>图片预览</title>
    <style>
      * { box-sizing: border-box; }
      html, body {
        margin: 0;
        min-height: 100%;
        background: #0a0a0a;
      }
      body {
        display: flex;
        align-items: flex-start;
        justify-content: center;
        padding: 24px;
      }
      img {
        display: block;
        max-width: none;
        width: auto;
        height: auto;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
      }
    </style>
  </head>
  <body>
    <img src="${escapedImageUrl}" alt="图片预览" />
  </body>
</html>`

    const blob = new Blob([previewHtml], { type: 'text/html;charset=utf-8' })
    const previewUrl = URL.createObjectURL(blob)
    const opened = window.open(previewUrl, '_blank')

    if (!opened) {
      URL.revokeObjectURL(previewUrl)
      toast.error('无法打开新标签页，请检查浏览器拦截设置')
      return
    }

    window.setTimeout(() => URL.revokeObjectURL(previewUrl), 60_000)
  }

  const openErrorDialog = () => {
    if (failedImageCount === 0) return
    setErrorDialogOpen(true)
  }

  const handleCardClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (batchMode) {
      onToggleSelect(card.id)
    }
  }

  const hasImage = !!displayImageUrl
  const hasFailedImage = !hasImage && pendingImageCount === 0 && failedImages.length > 0
  const hasGeneratingImage = generatingImage || pendingImageCount > 0 || batchGeneratingImage
  const isLoading = deepening || regeneratingPrompt || translating || generatingImage || pendingImageCount > 0 || batchDeepening || batchRegenerating || batchTranslating || batchGeneratingImage
  const translationStatus = getTranslationStatus(card)
  const displayedPrompt = displayLanguage === 'en' ? card.translated_prompt || '' : prompt

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
            isSelected && batchMode ? 'ring-2 ring-blue-600 border-blue-600 bg-blue-50/20' : 'border-border bg-card',
          )}
        >
        {batchMode && isSelected && (
          <div className="absolute right-2.5 top-2.5 z-20 flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm">
            <Check className="h-4 w-4" />
          </div>
        )}
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
              style={{ backfaceVisibility: 'hidden', pointerEvents: faceInteraction.imageFace.pointerEvents }}
              aria-hidden={faceInteraction.imageFace.ariaHidden}
            >
              {hasGeneratingImage ? (
                <div className="flex h-full items-center justify-center">
                  <span className="animate-shimmer-text bg-[linear-gradient(110deg,hsl(var(--muted-foreground))_30%,hsl(var(--foreground))_45%,hsl(var(--muted-foreground))_60%)] bg-[length:320%_100%] bg-clip-text text-sm font-medium text-transparent [will-change:background-position]">
                    生成中
                  </span>
                </div>
              ) : hasFailedImage ? (
                <div
                  className="flex flex-col items-center justify-center h-full gap-3 cursor-pointer px-4 text-center"
                >
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        className="flex h-16 w-16 items-center justify-center bg-destructive/12 text-destructive shadow-sm"
                        style={{ clipPath: 'polygon(50% 8%, 95% 92%, 5% 92%)' }}
                      >
                        <AlertTriangle className="h-6 w-6" />
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {failedImageTooltip}
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
                        图片生成失败
                      </button>
                    )}
                    {batchMode && <span className="font-medium">图片生成失败</span>}
                    {!batchMode && <><br />点击翻转编辑或重试</>}
                  </span>
                </div>
              ) : hasImage ? (
                <div
                  className="relative w-full h-full cursor-pointer group"
                  onClick={(e) => { if (!batchMode) { e.stopPropagation(); setGalleryInitialMode('selected'); setShowGallery(true) } }}
                >
                  <img
                    src={toImageSrc(displayImageUrl!, { width: 400, height: 600 })}
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

              {!batchMode && !hasGeneratingImage && (
                <div className="absolute top-2.5 right-2.5 z-10 flex items-center gap-1.5 opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-100">
                  {hasImage && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleGenerateImage() }}
                          disabled={isLoading}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/45 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/65 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {generatingImage ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                        </TooltipTrigger>
                        <TooltipContent side="left">重新生成图片</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {hasImage && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger
                          type="button"
                          onClick={(e) => { e.stopPropagation(); openImageInNewTab() }}
                          className="flex h-7 w-7 items-center justify-center rounded-lg bg-black/45 text-white shadow-sm backdrop-blur-sm transition-colors hover:bg-black/65"
                        >
                          <Search className="h-3.5 w-3.5" />
                        </TooltipTrigger>
                        <TooltipContent side="left">新标签页查看原图</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
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
                          onClick={(e) => {
                            e.stopPropagation()
                            manuallyFlippedToBackRef.current = true
                            setIsFlipped(true)
                          }}
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

              <div className="absolute bottom-2.5 left-2.5 flex items-center gap-1">
                <span className="text-[10px] text-white/70 bg-black/35 px-2 py-0.5 rounded-full">#{card.card_index}</span>
                {referenceImageIndicator && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger className={REFERENCE_IMAGE_INDICATOR_CLASSES.image} aria-label={referenceImageIndicator.label}>
                        <Images className="h-3 w-3" />
                      </TooltipTrigger>
                      <TooltipContent side="top">{referenceImageIndicator.label}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>

            <div
              className={cn(
                "absolute inset-0 bg-background flex flex-col p-3 gap-2",
                batchMode && "cursor-pointer"
              )}
              style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)', pointerEvents: faceInteraction.promptFace.pointerEvents }}
              aria-hidden={faceInteraction.promptFace.ariaHidden}
            >
              {/* 批量选择模式下的透明点击遮罩层，覆盖在 Textarea 上方，阻止编辑并响应选择 */}
              {batchMode && (
                <div className="absolute inset-0 z-10 cursor-pointer" onClick={handleCardClick} />
              )}
              <div className="flex items-start justify-between gap-2 shrink-0">
                <span className="text-[10px] text-muted-foreground font-medium pt-1">#{card.card_index} 提示词</span>
                <div className="flex items-center gap-1.5">
                  {hasFailedImage && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border border-red-500 text-red-500 font-medium">
                      图片生成失败
                    </span>
                  )}
                  {!hasFailedImage && !hasGeneratingImage && completedImages.length > 0 && (
                    <>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger
                            type="button"
                            onClick={handleGenerateImage}
                            disabled={isLoading}
                            className="flex h-5 w-5 items-center justify-center rounded-md border border-blue-500 text-blue-600 transition-colors hover:bg-blue-50 disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label="重新生成图片"
                          >
                            {generatingImage ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
                          </TooltipTrigger>
                          <TooltipContent side="top">重新生成图片</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {referenceImageIndicator && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger type="button" onClick={() => { setGalleryInitialMode('reference'); setShowGallery(true) }} className={REFERENCE_IMAGE_INDICATOR_CLASSES.prompt} aria-label={`${referenceImageIndicator.label}，打开参考图片库`}>
                              <Images className="h-3 w-3" />
                            </TooltipTrigger>
                            <TooltipContent side="top">{referenceImageIndicator.label}</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md border border-emerald-500 text-emerald-500 font-medium">
                        已生成{completedImages.length}张
                      </span>
                    </>
                  )}
                  {referenceImageIndicator && (hasFailedImage || hasGeneratingImage || completedImages.length === 0) && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger type="button" onClick={() => { setGalleryInitialMode('reference'); setShowGallery(true) }} className={REFERENCE_IMAGE_INDICATOR_CLASSES.prompt} aria-label={`${referenceImageIndicator.label}，打开参考图片库`}>
                          <Images className="h-3 w-3" />
                        </TooltipTrigger>
                        <TooltipContent side="top">{referenceImageIndicator.label}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {!batchMode && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger
                          type="button"
                          onClick={() => {
                            manuallyFlippedToBackRef.current = false
                            isEditingPromptRef.current = false
                            setIsFlipped(false)
                          }}
                          className="flex h-5 w-5 items-center justify-center rounded-md border border-black bg-transparent text-black transition-colors hover:bg-black/10"
                          aria-label="返回图片面"
                        >
                          <FlipHorizontal className="h-3 w-3" />
                        </TooltipTrigger>
                        <TooltipContent side="left">返回图片面</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                </div>
              </div>

              <Textarea
                value={displayedPrompt}
                onChange={e => handlePromptChange(e.target.value)}
                onBlur={handlePromptBlur}
                className="flex-1 text-xs resize-none min-h-0 leading-relaxed"
                placeholder="提示词..."
                disabled={isLoading || batchMode || displayLanguage === 'en'}
              />

              {!batchMode && (
                <div className="flex justify-end gap-2 shrink-0">
                  {card.translated_prompt && (
                    <div className="flex items-center gap-1.5">
                      {translationStatus === 'outdated' && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger
                              type="button"
                              className="flex h-6 w-6 items-center justify-center text-amber-600 transition-colors hover:text-amber-700"
                              aria-label="中文已修改，英文译文未同步"
                            >
                              <HugeiconsIcon icon={AlertCircleIcon} size={16} strokeWidth={1.8} />
                            </TooltipTrigger>
                            <TooltipContent side="top">中文已修改，英文译文未同步</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <div className="flex items-center rounded-lg border p-0.5 text-[11px]">
                        <Button variant={displayLanguage === 'zh' ? 'secondary' : 'ghost'} size="sm" className="h-6 px-2" onClick={() => handleLanguageChange('zh')}>中文</Button>
                        <Button variant={displayLanguage === 'en' ? 'secondary' : 'ghost'} size="sm" className="h-6 px-2" onClick={() => handleLanguageChange('en')}>English</Button>
                      </div>
                    </div>
                  )}
                  {previousPrompt && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 gap-1.5 rounded-lg px-3 text-[11px]"
                      onClick={handleUndoPrompt}
                      disabled={isLoading}
                    >
                      <Undo2 className="h-3.5 w-3.5" />
                      撤回
                    </Button>
                  )}
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
                      <DropdownMenuItem onClick={handleTranslate} disabled={isLoading || translating}>
                        {translating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Languages className="h-4 w-4" />}
                        翻译提示词
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={handleGenerateImage} disabled={isLoading || generatingImage}>
                        {generatingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}
                        {hasImage ? '重新生成图片' : '生成图片'}
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
        selectedImageModel={selectedImageModel}
        initialMode={galleryInitialMode}
        onImageSelected={handleImageSelected}
        onReferenceImagesChanged={handleReferenceImagesChanged}
      />

      <ImagePreviewOverlay
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        imageUrl={displayImageUrl}
        item={{
          prompt: displayImage?.generation_prompt || prompt,
          model_name: displayImage?.model_name || card.sel_img_model_name || undefined,
          image_size: displayImage?.size || card.sel_img_size || selectedSize || undefined,
          source: displayImage?.source,
          started_at: displayImage?.generation_started_at || card.sel_img_started_at || null,
          completed_at: displayImage?.generation_completed_at || card.sel_img_completed_at || null,
          created_at: displayImage?.created_at || card.sel_img_created_at || card.updated_at || card.created_at,
        }}
      />

      <ApiErrorDialog
        open={errorDialogOpen}
        onOpenChange={setErrorDialogOpen}
        errorMessage={failedImageTooltip}
      />
    </>
  )
})
