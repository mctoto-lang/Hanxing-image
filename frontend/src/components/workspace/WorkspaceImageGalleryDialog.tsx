import { useState, useEffect, useCallback, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn, toImageSrc } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import { Check, GripHorizontal, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import Spinner from '@/components/Spinner'
import type { CardImage } from '@/pages/WorkspacePage'

interface Props {
  open: boolean
  onClose: () => void
  cardId: number
  onImageSelected: (image: CardImage) => void
}

export default function WorkspaceImageGalleryDialog({ open, onClose, cardId, onImageSelected }: Props) {
  const [images, setImages] = useState<CardImage[]>([])
  const [loading, setLoading] = useState(false)
  const [selecting, setSelecting] = useState<number | null>(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const dragStateRef = useRef({
    pointerId: -1,
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  })

  const fetchImages = useCallback(async () => {
    setLoading(true)
    try {
      const data = await apiFetch(`/api/workspace/cards/${cardId}/images`).then(r => r.json())
      setImages(data.images || [])
    } catch {} finally {
      setLoading(false)
    }
  }, [cardId])

  useEffect(() => {
    if (open) fetchImages()
  }, [open, fetchImages])

  useEffect(() => {
    if (open) {
      setPosition({ x: 0, y: 0 })
    }
  }, [open, cardId])

  const handleSelect = async (image: CardImage) => {
    if (image.is_selected) return
    setSelecting(image.id)
    try {
      const res = await apiFetch(`/api/workspace/images/${image.id}/select`, { method: 'PATCH' })
      if (!res.ok) throw new Error()
      setImages(prev => prev.map(i => ({ ...i, is_selected: i.id === image.id ? 1 : 0 })))
      onImageSelected({ ...image, is_selected: 1 })
      toast.success('已选定图片')
    } catch {
      toast.error('选定图片失败')
    } finally {
      setSelecting(null)
    }
  }

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    dragStateRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current.pointerId !== event.pointerId) return
    const deltaX = event.clientX - dragStateRef.current.startX
    const deltaY = event.clientY - dragStateRef.current.startY
    setPosition({
      x: dragStateRef.current.originX + deltaX,
      y: dragStateRef.current.originY + deltaY,
    })
  }

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current.pointerId !== event.pointerId) return
    dragStateRef.current.pointerId = -1
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const completedImages = images.filter(i => i.status === 'completed')

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent
        className="max-w-2xl"
        style={{
          transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px))`,
        }}
      >
        <DialogHeader
          className="cursor-move select-none pr-8"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <DialogTitle>图片库 ({completedImages.length} 张)</DialogTitle>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <GripHorizontal className="h-3.5 w-3.5" />
            <span>按住标题栏可移动弹框</span>
          </div>
        </DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-12"><Spinner /></div>
        ) : completedImages.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-8">暂无已完成的图片</p>
        ) : (
          <div className="grid grid-cols-3 gap-3 max-h-[60vh] overflow-y-auto">
            {completedImages.map(img => (
              <div
                key={img.id}
                onClick={() => handleSelect(img)}
                className={cn(
                  'relative aspect-square rounded-lg overflow-hidden cursor-pointer border-2 transition-all',
                  img.is_selected ? 'border-primary ring-2 ring-primary/30' : 'border-transparent hover:border-primary/50',
                )}
              >
                <img src={toImageSrc(img.image_url, { width: 200, height: 200 })} alt="" className="w-full h-full object-cover" loading="lazy" />
                {img.is_selected && (
                  <div className="absolute top-2 right-2 bg-primary text-primary-foreground rounded-full p-0.5">
                    <Check className="h-3 w-3" />
                  </div>
                )}
                {selecting === img.id && (
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-white" />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                  <p className="text-[10px] text-white/80">{img.size || '未知尺寸'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
