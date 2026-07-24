import { useEffect, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import Spinner from '@/components/Spinner'
import { apiFetch } from '@/lib/api'
import { uploadReferenceImages } from '@/lib/product-reference-upload'
import type { CardImage } from '@/pages/WorkspacePage'

interface Props {
  open: boolean
  cardIds: number[]
  onClose: () => void
  onCompleted: (imagesByCard: Record<number, CardImage[]>) => void
}

export default function WorkspaceBatchImageUploadDialog({ open, cardIds, onClose, onCompleted }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) setFiles([])
  }, [open])

  const handleSubmit = async () => {
    if (!files.length) { toast.error('请先选择图片'); return }
    setSubmitting(true)
    try {
      const uploaded = await uploadReferenceImages(files)
      uploaded.errors.forEach(message => toast.error(message))
      if (!uploaded.uploads.length) throw new Error('没有可确认的上传图片')
      const response = await apiFetch('/api/workspace/cards/batch-attach-uploaded-images', {
        method: 'POST',
        body: { card_ids: cardIds, image_urls: uploaded.uploads.map(item => item.url) },
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || '批量保存图片失败')
      onCompleted(data.images_by_card || {})
      toast.success(`已将 ${uploaded.uploads.length} 张图片同步到 ${cardIds.length} 张卡片`)
      onClose()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '批量上传失败')
    } finally {
      setSubmitting(false)
    }
  }

  return <Dialog open={open} onOpenChange={value => !value && !submitting && onClose()}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>批量上传图片</DialogTitle></DialogHeader>
      <div className="space-y-3 py-2">
        <p className="text-sm text-muted-foreground">上传完成并确认后，图片会同步到已选中的 {cardIds.length} 张卡片图片库中。</p>
        <Button type="button" variant="outline" className="w-full gap-2 border-dashed" onClick={() => inputRef.current?.click()} disabled={submitting}><ImagePlus className="h-4 w-4" />选择图片</Button>
        <input ref={inputRef} type="file" accept="image/png,image/jpeg" multiple className="hidden" onChange={event => { setFiles(previous => [...previous, ...Array.from(event.target.files || [])]); event.target.value = '' }} />
        {files.length > 0 && <div className="max-h-56 space-y-1 overflow-y-auto rounded-lg border p-2">{files.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm"><span className="truncate">{file.name}</span><Button type="button" variant="ghost" size="icon" className="h-7 w-7" disabled={submitting} onClick={() => setFiles(items => items.filter((_, itemIndex) => itemIndex !== index))}><X className="h-4 w-4" /></Button></div>)}</div>}
      </div>
      <DialogFooter><Button variant="outline" onClick={onClose} disabled={submitting}>取消</Button><Button onClick={handleSubmit} disabled={submitting || !files.length}>{submitting ? <><Spinner />上传并同步中...</> : '确认上传'}</Button></DialogFooter>
    </DialogContent>
  </Dialog>
}
