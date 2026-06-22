import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, AlertTriangle, ExternalLink, FileText, Image } from 'lucide-react'
import { toast } from 'sonner'
import Spinner from '@/components/Spinner'
import { toImageSrc } from '@/lib/utils'
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

export default function WorkspaceExportDialog({ open, onClose, taskId, taskTitle, cards, selectedCardIds, batchMode }: Props) {
  const [step, setStep] = useState<ExportStep>('confirm')
  const [exportLinks, setExportLinks] = useState<{ index: number; url: string; filename: string }[]>([])

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

  const handleExportPng = async () => {
    if (!taskId || cardsWithImages.length === 0) return
    setStep('exporting')
    try {
      const body: { task_id: number; card_ids?: number[] } = { task_id: taskId }
      if (isPartialExport) {
        body.card_ids = cardsWithImages.map(c => c.id)
      }
      const res = await apiFetch('/api/workspace/export', {
        method: 'POST',
        body,
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '导出失败')
      setExportLinks(data.images || [])
      setStep('done')
    } catch (err) {
      toast.error((err as Error).message)
      setStep('confirm')
    }
  }

  const handleExportPdf = async () => {
    if (!taskId || cardsWithImages.length === 0) return
    setStep('exporting')
    try {
      const body: { task_id: number; card_ids?: number[] } = { task_id: taskId }
      if (isPartialExport) {
        body.card_ids = cardsWithImages.map(c => c.id)
      }
      const res = await apiFetch('/api/workspace/export-pdf', {
        method: 'POST',
        body,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: '导出失败' }))
        throw new Error(data.error || 'PDF 导出失败')
      }
      // 获取 PDF 二进制数据并触发下载
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${taskTitle || '批量生图'}_导出.pdf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success(`已导出 PDF，共 ${cardsWithImages.length} 张图片`)
      setStep('done')
    } catch (err) {
      toast.error((err as Error).message || 'PDF 导出失败')
      setStep('confirm')
    }
  }

  const handleDownloadAll = () => {
    exportLinks.forEach((item, i) => {
      setTimeout(() => {
        const a = document.createElement('a')
        a.href = toImageSrc(item.url)
        a.download = item.filename
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }, i * 300)
    })
    toast.success(`已触发 ${exportLinks.length} 张图片下载`)
  }

  const handleClose = () => {
    setStep('confirm')
    setExportLinks([])
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
                共 {cardsWithImages.length} 张首选图片，请选择导出格式
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-3">
              <button
                onClick={handleExportPdf}
                className="flex items-center gap-3 w-full p-3.5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
              >
                <div className="h-10 w-10 shrink-0 rounded-lg bg-red-100 dark:bg-red-950/30 flex items-center justify-center">
                  <FileText className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <span className="text-sm font-medium block">导出为 PDF</span>
                  <span className="text-[10px] text-muted-foreground">一页一张图片，按图片原始尺寸</span>
                </div>
              </button>
              <button
                onClick={handleExportPng}
                className="flex items-center gap-3 w-full p-3.5 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition-colors text-left"
              >
                <div className="h-10 w-10 shrink-0 rounded-lg bg-blue-100 dark:bg-blue-950/30 flex items-center justify-center">
                  <Image className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <span className="text-sm font-medium block">逐张下载 PNG</span>
                  <span className="text-[10px] text-muted-foreground">逐张下载原始图片文件</span>
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
            {exportLinks.length > 0 ? (
              <div className="space-y-2 py-2">
                <p className="text-sm text-muted-foreground">共 {exportLinks.length} 张图片已准备好，点击下方按钮批量下载，或逐张点击链接下载。</p>
                <div className="max-h-52 overflow-y-auto space-y-1 border rounded-lg p-2">
                  {exportLinks.map(item => (
                    <a
                      key={item.index}
                      href={toImageSrc(item.url)}
                      download={item.filename}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 text-xs text-primary hover:underline px-1 py-0.5"
                    >
                      <ExternalLink className="h-3 w-3 shrink-0" />
                      {item.filename}
                    </a>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">PDF 文件已开始下载</p>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>关闭</Button>
              {exportLinks.length > 0 && (
                <Button onClick={handleDownloadAll}>
                  <Download className="h-4 w-4 mr-1.5" />
                  批量下载全部
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
