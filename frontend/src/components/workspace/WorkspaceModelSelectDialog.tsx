import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn, toImageSrc } from '@/lib/utils'
import { Check, Cpu } from 'lucide-react'
import Spinner from '@/components/Spinner'
import { apiFetch } from '@/lib/api'
import type { ImageModel } from '@/pages/WorkspacePage'

interface Props {
  open: boolean
  selected: ImageModel | null
  onSelect: (m: ImageModel) => void
  onClose: () => void
}

export default function WorkspaceModelSelectDialog({ open, selected, onSelect, onClose }: Props) {
  const [models, setModels] = useState<ImageModel[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) fetchModels()
  }, [open])

  const fetchModels = async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/models?source=generate')
      const data = await res.json()
      setModels(data.models || [])
    } catch {} finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>选择图片模型</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-6"><Spinner /></div>
          ) : models.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">暂无可用模型</p>
          ) : (
            models.map(m => (
              <button
                key={m.id}
                onClick={() => onSelect(m)}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors',
                  selected?.id === m.id
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-accent',
                )}
              >
                {m.icon_url ? (
                  <img src={toImageSrc(m.icon_url)} alt="" className="h-8 w-8 rounded object-cover shrink-0" />
                ) : (
                  <div className="h-8 w-8 rounded bg-muted flex items-center justify-center shrink-0">
                    <Cpu className="h-4 w-4 text-muted-foreground" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{m.display_name || m.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{m.name}</p>
                </div>
                {selected?.id === m.id && <Check className="h-4 w-4 text-primary shrink-0" />}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
