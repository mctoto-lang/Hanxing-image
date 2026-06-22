import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { AlertTriangle } from 'lucide-react'

interface Props {
  open: boolean
  action: string
  count: number
  onConfirm: () => void
  onClose: () => void
}

export default function WorkspaceBatchConfirmDialog({ open, action, count, onConfirm, onClose }: Props) {
  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            确认操作
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground py-2">
          确认对 <span className="text-foreground font-medium">{count}</span> 张卡片执行「{action}」操作？
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={onConfirm}>确认</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
