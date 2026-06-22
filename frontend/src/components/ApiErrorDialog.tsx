import { useState } from 'react'
import { CircleAlert, Copy, Check } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

interface ApiErrorDialogProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  errorMessage: string
}

export default function ApiErrorDialog({ open, onOpenChange, errorMessage }: ApiErrorDialogProps) {
  const [copied, setCopied] = useState(false)

  const rawPrefix = '原始响应: '
  const rawIdx = errorMessage.indexOf(rawPrefix)
  const briefError = rawIdx >= 0 ? errorMessage.slice(0, rawIdx).trimEnd().replace(/ \|$/, '') : errorMessage
  const rawResponse = rawIdx >= 0 ? errorMessage.slice(rawIdx + rawPrefix.length) : ''

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(errorMessage)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <CircleAlert className="h-5 w-5" />
            错误详情
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg bg-muted p-4">
            <p className="mb-1.5 text-xs font-medium text-muted-foreground">错误信息</p>
            <p className="break-all font-mono text-sm leading-relaxed">{briefError}</p>
          </div>
          {rawResponse && (
            <div className="rounded-lg bg-muted p-4">
              <p className="mb-1.5 text-xs font-medium text-muted-foreground">API 原始响应</p>
              <pre className="max-h-60 overflow-y-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed">{rawResponse}</pre>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCopy}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? '已复制' : '复制完整错误信息'}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
