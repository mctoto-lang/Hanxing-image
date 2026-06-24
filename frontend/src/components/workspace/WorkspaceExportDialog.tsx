import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, AlertTriangle, Image } from 'lucide-react'
import { toast } from 'sonner'
import Spinner from '@/components/Spinner'
import { apiFetch } from '@/lib/api'
import type { PromptCard } from '@/pages/WorkspacePage'

interface Props {
  open: boolean
  onClose: () => void
  taskId: number | null
  taskTitle: string
  cards: PromptCard[]
  selectedCardIds: Set<number>
  batchMode: boolean
}

type ExportStep = 'confirm' | 'format' | 'exporting' | 'done'
type ExportImageFormat = 'jpg' | 'png'

function sanitizeFilenamePart(value: string) {
  return value
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
}

export default function WorkspaceExportDialog({ open, onClose, taskId, taskTitle, cards, selectedCardIds, batchMode }: Props) {
  const [step, setStep] = useState<ExportStep>('confirm')
  const [doneMessage, setDoneMessage] = useState('')
  const [imageFormat, setImageFormat] = useState<ExportImageFormat>('jpg')

  // 根据是否有选中卡片，决定导出范围
  const targetCards = batchMode && selectedCardIds.size > 0
    ? cards.filter(c => selectedCardIds.has(c.id))
    : cards

  const cardsWithImages = targetCards.filter(c => c.sel_img_url)
  const cardsWithoutImages = targetCards.filter(c => !c.sel_img_url)
  const isPartialExport = batchMode && selectedCardIds.size > 0

  const handleConfirm = () => {
    if (cardsWithImages.length === 0) return
    setStep('format')
  }

  const handleExportZip = async () => {
    if (!taskId || cardsWithImages.length === 0) return
    setStep('exporting')
    try {
      const body: { task_id: number; card_ids?: number[]; format: ExportImageFormat } = { task_id: taskId, format: imageFormat }
      if (isPartialExport) {
        body.card_ids = cardsWithImages.map(c => c.id)
      }
      const res = await apiFetch('/api/workspace/export-ticket', {
        method: 'POST',
        body,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '导出失败' }))
        throw new Error(data.error || '导出失败')
      }

      const data = await res.json() as { download_url?: string; error?: string }
      if (!data.download_url) {
        throw new Error(data.error || '导出失败')
      }

      const a = document.createElement('a')
      a.href = data.download_url
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      toast.success(`已导出图片压缩包，共 ${cardsWithImages.length} 张 ${imageFormat.toUpperCase()} 图片`)
      setDoneMessage(`图片压缩包已开始下载，文件内为按卡片序号命名的 ${imageFormat.toUpperCase()} 图片`)
      setStep('done')
    } catch (err) {
      toast.error((err as Error).message)
      setStep('confirm')
    }
  }

  const handleExportImages = async () => {
    if (cardsWithImages.length === 0) return
    setStep('exporting')
    try {
      const taskName = sanitizeFilenamePart(taskTitle || '批量生图') || '批量生图'
      for (let index = 0; index < cardsWithImages.length; index += 1) {
        const card = cardsWithImages[index]
        if (!card.sel_img_url) continue
        const proxyUrl = `/api/image/proxy?url=${encodeURIComponent(card.sel_img_url)}&format=${imageFormat}`
        const response = await apiFetch(proxyUrl)
        if (!response.ok) {
          const data = await response.json().catch(() => ({ error: '图片下载失败' }))
          throw new Error(data.error || `第 ${card.card_index} 张图片下载失败`)
        }
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${taskName}-${String(card.card_index).padStart(2, '0')}.${imageFormat}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        if (index < cardsWithImages.length - 1) {
          await new Promise(resolve => window.setTimeout(resolve, 180))
        }
      }
      toast.success(`已逐张导出 ${cardsWithImages.length} 张 ${imageFormat.toUpperCase()} 图片`)
      setDoneMessage(`图片已开始逐张下载，文件名为按卡片序号命名的 ${imageFormat.toUpperCase()} 图片`)
      setStep('done')
    } catch (err) {
      toast.error((err as Error).message)
      setStep('confirm')
    }
  }

  const handleClose = () => {
    setStep('confirm')
    setDoneMessage('')
    setImageFormat('jpg')
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className="max-w-sm">
        {/* 步骤1：确认导出范围 */}
        {step === 'confirm' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                导出图片
              </DialogTitle>
              <DialogDescription>
                {isPartialExport
                  ? `将导出已选中的 ${targetCards.length} 张卡片中的首选图片`
                  : '将导出当前任务内所有有图片的卡片的首选图片'}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">可导出图片</span>
                <span className="font-medium text-emerald-600">{cardsWithImages.length} 张</span>
              </div>
              {cardsWithoutImages.length > 0 && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
                  <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700 dark:text-amber-400">
                    {cardsWithoutImages.length} 张卡片尚未生成图片，将跳过
                  </p>
                </div>
              )}
              {cardsWithImages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-2">
                  暂无可导出的图片，请先生成图片
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>取消</Button>
              <Button onClick={handleConfirm} disabled={cardsWithImages.length === 0}>
                下一步
              </Button>
            </DialogFooter>
          </>
        )}

        {/* 步骤2：选择导出格式 */}
        {step === 'format' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                选择导出方式
              </DialogTitle>
              <DialogDescription>
                共 {cardsWithImages.length} 张首选图片，请选择导出方式
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">图片格式</div>
                <div className="flex gap-2">
                  <Button variant={imageFormat === 'jpg' ? 'default' : 'outline'} size="sm" onClick={() => setImageFormat('jpg')}>
                    JPG
                  </Button>
                  <Button variant={imageFormat === 'png' ? 'default' : 'outline'} size="sm" onClick={() => setImageFormat('png')}>
                    PNG
                  </Button>
                </div>
              </div>
              <button
                onClick={handleExportZip}
                className="flex items-center gap-3 w-full p-3.5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
              >
                <div className="h-10 w-10 shrink-0 rounded-lg bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center">
                  <Image className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <span className="text-sm font-medium block">导出为图片压缩包</span>
                  <span className="text-[10px] text-muted-foreground">文件命名为 任务名称-卡片序号.{imageFormat}</span>
                </div>
              </button>
              <button
                onClick={handleExportImages}
                className="flex items-center gap-3 w-full p-3.5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
              >
                <div className="h-10 w-10 shrink-0 rounded-lg bg-emerald-100 dark:bg-emerald-950/30 flex items-center justify-center">
                  <Image className="h-5 w-5 text-emerald-600" />
                </div>
                <div>
                  <span className="text-sm font-medium block">导出为图片（逐张导出）</span>
                  <span className="text-[10px] text-muted-foreground">逐张下载 {imageFormat.toUpperCase()} 图片，命名同样使用任务名称和卡片序号</span>
                </div>
              </button>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setStep('confirm')}>返回</Button>
            </DialogFooter>
          </>
        )}

        {/* 步骤3：导出中 */}
        {step === 'exporting' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                导出中
              </DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-3 py-6">
              <Spinner />
              <p className="text-sm text-muted-foreground">正在生成文件，请稍候...</p>
            </div>
          </>
        )}

        {/* 步骤4：导出完成 */}
        {step === 'done' && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Download className="h-4 w-4" />
                导出完成
              </DialogTitle>
            </DialogHeader>
            <p className="text-sm text-muted-foreground text-center py-4">{doneMessage || '文件已开始下载'}</p>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>关闭</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
