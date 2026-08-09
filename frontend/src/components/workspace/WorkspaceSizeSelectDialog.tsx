import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
import type { ImageModel } from '@/pages/WorkspacePage'

interface Props {
  open: boolean
  model: ImageModel | null
  selected: string | null
  onSelect: (size: string) => void
  onClose: () => void
}

const DEFAULT_SIZES = [
  { label: '1:1 正方形', value: '1024x1024' },
  { label: '2:3 竖版', value: '1024x1536' },
  { label: '3:2 横版', value: '1536x1024' },
  { label: '9:16 手机竖屏', value: '1080x1920' },
  { label: '16:9 横屏', value: '1920x1080' },
]

export default function WorkspaceSizeSelectDialog({ open, model, selected, onSelect, onClose }: Props) {
  const sizes = model?.supported_sizes?.ratios?.map(r => ({
    label: `${r.ratio} (${r.width}×${r.height})`,
    value: `${r.width}x${r.height}`,
  })) || DEFAULT_SIZES

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>选择出图尺寸</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {sizes.map(s => (
            <button
              key={s.value}
              onClick={() => onSelect(s.value)}
              className={cn(
                'w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors',
                selected === s.value
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border hover:bg-accent',
              )}
            >
              <div>
                <p className="text-sm font-medium">{s.label}</p>
                <p className="text-xs text-muted-foreground">{s.value}</p>
              </div>
              {selected === s.value && <Check className="h-4 w-4 shrink-0" />}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
