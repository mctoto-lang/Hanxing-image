import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, ImagePlus, Loader2, MoreHorizontal, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn, toImageSrc } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import { uploadReferenceImages } from '@/lib/product-reference-upload'
import { getReferenceImageLimit, normalizeReferenceImages } from '@/lib/workspace-reference-images'
import { toast } from 'sonner'
import Spinner from '@/components/Spinner'
import type { CardImage, ImageModel } from '@/pages/WorkspacePage'
import { getInitialGalleryMode } from '@/lib/workspace-batch-upload'

interface Props {
  open: boolean
  onClose: () => void
  cardId: number
  selectedImageModel: ImageModel | null
  initialMode?: GalleryMode
  onImageSelected: (image: CardImage) => void
  onReferenceImagesChanged?: (referenceImages: string[]) => void
}

const PAGE_SIZE = 15

export type GalleryPageItem = number | 'ellipsis-start' | 'ellipsis-end'
export type GalleryMode = 'selected' | 'reference'

const galleryModeLabels: Record<GalleryMode, string> = {
  selected: '图片选择',
  reference: '参考图片',
}

export function getGalleryPageItems({ currentPage, totalPages }: { currentPage: number; totalPages: number }): GalleryPageItem[] {
  if (totalPages <= 5) return Array.from({ length: totalPages }, (_, index) => index + 1)
  if (currentPage <= 3) return [1, 2, 3, 'ellipsis-end', totalPages]
  if (currentPage >= totalPages - 2) return [1, 'ellipsis-start', totalPages - 2, totalPages - 1, totalPages]
  return [1, 'ellipsis-start', currentPage - 1, currentPage, currentPage + 1, 'ellipsis-end', totalPages]
}

export function getGalleryModeOptions(referenceLimit: number): { value: GalleryMode; label: string }[] {
  return referenceLimit > 0
    ? [{ value: 'selected', label: galleryModeLabels.selected }, { value: 'reference', label: galleryModeLabels.reference }]
    : [{ value: 'selected', label: galleryModeLabels.selected }]
}

export function getGalleryModeLabel(mode: GalleryMode): string {
  return galleryModeLabels[mode]
}

export function shouldShowReferenceFooter(referenceLimit: number): boolean {
  return referenceLimit > 0
}

export const galleryModeSelectPosition = { side: 'bottom', sideOffset: 6, align: 'start', alignItemWithTrigger: false } as const
export const referenceImageCountBadgeClassName = 'flex h-7 items-center rounded-md bg-violet-100 px-2.5 text-xs font-medium text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'

export default function WorkspaceImageGalleryDialog({ open, onClose, cardId, selectedImageModel, initialMode = 'selected', onImageSelected, onReferenceImagesChanged }: Props) {
  const [images, setImages] = useState<CardImage[]>([])
  const [referenceImages, setReferenceImages] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [selecting, setSelecting] = useState<number | null>(null)
  const [mode, setMode] = useState<GalleryMode>('selected')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const referenceLimit = getReferenceImageLimit(selectedImageModel)

  const fetchImages = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch(`/api/workspace/cards/${cardId}/images`)
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '获取图片列表失败')
      setImages(data.images || [])
      const savedReferenceImages = normalizeReferenceImages(data.reference_images)
      setReferenceImages(savedReferenceImages)
      onReferenceImagesChanged?.(savedReferenceImages)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '获取图片列表失败')
    } finally {
      setLoading(false)
    }
  }, [cardId])

  useEffect(() => {
    if (open) {
      setMode(getInitialGalleryMode(initialMode, referenceLimit))
      void fetchImages()
    }
  }, [open, fetchImages, initialMode, referenceLimit])

  useEffect(() => {
    setPage(1)
  }, [search, mode, open])

  useEffect(() => {
    if (referenceLimit === 0 && mode === 'reference') setMode('selected')
  }, [mode, referenceLimit])

  const completedImages = useMemo(() => images.filter(image => image.status === 'completed' && image.image_url), [images])
  const filteredImages = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    if (!keyword) return completedImages
    return completedImages.filter(image => image.generation_prompt?.toLowerCase().includes(keyword))
  }, [completedImages, search])
  const totalPages = Math.max(1, Math.ceil(filteredImages.length / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const pageImages = filteredImages.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
  const pageItems = useMemo(() => getGalleryPageItems({ currentPage, totalPages }), [currentPage, totalPages])
  const modeOptions = useMemo(() => getGalleryModeOptions(referenceLimit), [referenceLimit])
  const showReferenceFooter = shouldShowReferenceFooter(referenceLimit)

  const handleSelect = async (image: CardImage) => {
    if (image.is_selected) return
    setSelecting(image.id)
    try {
      const response = await apiFetch(`/api/workspace/images/${image.id}/select`, { method: 'PATCH' })
      if (!response.ok) throw new Error()
      setImages(previous => previous.map(item => ({ ...item, is_selected: item.id === image.id ? 1 : 0 })))
      onImageSelected({ ...image, is_selected: 1 })
      toast.success('已设为选中图片')
    } catch {
      toast.error('选定图片失败')
    } finally {
      setSelecting(null)
    }
  }

  const saveReferenceImages = async (nextImages: string[]): Promise<boolean> => {
    if (!selectedImageModel || referenceLimit === 0) {
      toast.error('当前模型不支持参考图')
      return false
    }
    const normalized = normalizeReferenceImages(nextImages)
    if (normalized.length > referenceLimit) {
      toast.error(`当前模型最多支持 ${referenceLimit} 张参考图`)
      return false
    }
    setSelecting(-1)
    try {
      const response = await apiFetch(`/api/workspace/cards/${cardId}/reference-images`, {
        method: 'PUT',
        body: { api_id: selectedImageModel.id, reference_images: normalized },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '保存参考图失败')
      const savedReferenceImages = normalizeReferenceImages(data.reference_images)
      setReferenceImages(savedReferenceImages)
      onReferenceImagesChanged?.(savedReferenceImages)
      return true
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '保存参考图失败')
      return false
    } finally {
      setSelecting(null)
    }
  }

  const handleReferenceSelect = (image: CardImage) => {
    const selected = referenceImages.includes(image.image_url)
    void saveReferenceImages(selected ? referenceImages.filter(url => url !== image.image_url) : [...referenceImages, image.image_url])
  }

  const handleClearReferenceImages = async () => {
    if (!referenceImages.length) return
    if (await saveReferenceImages([])) toast.success('已清除参考图片')
  }

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return
    setUploading(true)
    try {
      const result = await uploadReferenceImages(files)
      result.errors.forEach(message => toast.error(message))
      const uploadedImages: CardImage[] = []
      for (const upload of result.uploads) {
        const response = await apiFetch(`/api/workspace/cards/${cardId}/images/uploaded`, { method: 'POST', body: { image_url: upload.url } })
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || '保存上传图片失败')
        uploadedImages.push(data.image)
      }
      if (uploadedImages.length) {
        setImages(previous => [...uploadedImages, ...previous])
        toast.success(`已上传 ${uploadedImages.length} 张图片，请选择用途`)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '图片上传失败')
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={value => !value && onClose()}>
      <DialogContent className="flex h-[min(52vh,492px)] w-[min(90vw,768px)] max-w-none flex-col gap-2 overflow-hidden sm:max-w-[min(90vw,768px)]">
        <DialogHeader className="pr-8">
          <DialogTitle>图片库 <span className="text-muted-foreground">({completedImages.length} 张)</span></DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={event => setSearch(event.target.value)} placeholder="搜索图片生成提示词" className="pl-9" /></div>
            <Select value={mode} onValueChange={value => setMode(value as GalleryMode)}>
              <SelectTrigger className="w-28"><SelectValue>{getGalleryModeLabel(mode)}</SelectValue></SelectTrigger>
              <SelectContent {...galleryModeSelectPosition}>
                {modeOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button size="sm" className="gap-1.5" onClick={() => inputRef.current?.click()} disabled={uploading}>
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />}上传图片
            </Button>
            <input ref={inputRef} type="file" accept="image/png,image/jpeg" multiple className="hidden" onChange={handleUpload} />
          </div>
          {loading ? <div className="flex h-[285px] items-center justify-center"><Spinner /></div> : pageImages.length === 0 ? <p className="flex h-[285px] items-center justify-center text-sm text-muted-foreground">{search ? '未找到匹配提示词的图片' : '暂无已完成的图片'}</p> : (
            <div className="h-[285px] overflow-y-auto pr-1">
              <div className="grid grid-cols-5 gap-4">
              {pageImages.map(image => {
                const isReference = referenceImages.includes(image.image_url)
                const isSelected = mode === 'reference' ? isReference : Boolean(image.is_selected)
                const disabled = mode === 'reference' && !isReference && referenceImages.length >= referenceLimit
                return <button key={image.id} type="button" disabled={disabled || selecting !== null} onClick={() => mode === 'reference' ? handleReferenceSelect(image) : void handleSelect(image)} className={cn('group relative aspect-square overflow-hidden rounded-xl border-2 text-left shadow-sm transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-45', mode === 'reference' ? (isSelected ? 'border-violet-600 ring-2 ring-violet-500/30' : 'border-transparent hover:border-violet-400/60') : (isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-primary/50'))}>
                  <img src={toImageSrc(image.image_url, { width: 360, height: 360 })} alt="" className="h-full w-full object-cover" loading="lazy" />
                  {isSelected && <span className={cn('absolute right-2 top-2 rounded-full p-1 text-white', mode === 'reference' ? 'bg-violet-600' : 'bg-primary')}><Check className="h-3.5 w-3.5" /></span>}
                  {selecting === image.id && <span className="absolute inset-0 flex items-center justify-center bg-black/40"><Loader2 className="h-6 w-6 animate-spin text-white" /></span>}
                  <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-7 text-[10px] text-white/85">{image.source === 'uploaded' ? '上传图片' : image.size || '未知尺寸'}</span>
                </button>
              })}
              </div>
            </div>
          )}
        </div>
        {(showReferenceFooter || totalPages > 1) && <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t pt-3">
          {showReferenceFooter ? <div className="flex items-center gap-2"><span className={referenceImageCountBadgeClassName}>已选择 {referenceImages.length} 张参考图片</span><Button variant="outline" size="sm" disabled={!referenceImages.length || selecting !== null} onClick={() => void handleClearReferenceImages()}>清除参考图片</Button></div> : <span />}
          {totalPages > 1 && <nav aria-label="图片库分页" className="flex flex-wrap items-center justify-center gap-1.5">
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="上一页" disabled={currentPage <= 1} onClick={() => setPage(current => current - 1)}><ChevronLeft className="h-4 w-4" /></Button>
            {pageItems.map(item => typeof item === 'number' ? <Button key={item} variant={item === currentPage ? 'default' : 'outline'} size="sm" className="h-8 min-w-8 px-2" aria-current={item === currentPage ? 'page' : undefined} onClick={() => setPage(item)}>{item}</Button> : <span key={item} className="flex h-8 w-6 items-center justify-center text-muted-foreground" aria-hidden="true"><MoreHorizontal className="h-4 w-4" /></span>)}
            <Button variant="outline" size="icon" className="h-8 w-8" aria-label="下一页" disabled={currentPage >= totalPages} onClick={() => setPage(current => current + 1)}><ChevronRight className="h-4 w-4" /></Button>
          </nav>}
        </div>}
      </DialogContent>
    </Dialog>
  )
}
