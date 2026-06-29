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
  const isDeleteAction = action === '批量删除'

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className={isDeleteAction ? 'h-4 w-4 text-destructive' : 'h-4 w-4 text-amber-500'} />
            {isDeleteAction ? '确认删除' : '确认操作'}
          </DialogTitle>
        </DialogHeader>
        {isDeleteAction ? (
          <div className="space-y-2 py-2 text-sm text-muted-foreground">
            <p>
              将永久删除选中的 <span className="text-foreground font-medium">{count}</span> 张卡片，此操作无法恢复。
            </p>
            <p>请确认是否继续删除。</p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-2">
            确认对 <span className="text-foreground font-medium">{count}</span> 张卡片执行「{action}」操作？
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button variant={isDeleteAction ? 'destructive' : 'default'} onClick={onConfirm}>
            {isDeleteAction ? '确认删除' : '确认'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
