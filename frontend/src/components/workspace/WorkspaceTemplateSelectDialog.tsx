import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { Check } from 'lucide-react'
import Spinner from '@/components/Spinner'
import { apiFetch } from '@/lib/api'
import type { Template } from '@/pages/WorkspacePage'

interface Props {
  open: boolean
  type: 'fission' | 'deepen' | 'regenerate' | 'extract'
  selected: Template | null
  onSelect: (t: Template) => void
  onClose: () => void
}

const typeLabels = { fission: '裂变模板', deepen: '细化模板', regenerate: '重生成模板', extract: '提取提示词模板' }

export default function WorkspaceTemplateSelectDialog({ open, type, selected, onSelect, onClose }: Props) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (open) fetchTemplates()
  }, [open, type])

  const fetchTemplates = async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/admin/workspace/templates?type=${type}`)
      const data = await res.json()
      setTemplates(data.templates || [])
    } catch {} finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>选择{typeLabels[type]}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5 max-h-80 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-6"><Spinner /></div>
          ) : templates.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">暂无模板，请先在管理后台创建</p>
          ) : (
            templates.map(t => (
              <button
                key={t.id}
                onClick={() => onSelect(t)}
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-left transition-colors',
                  selected?.id === t.id
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-border hover:bg-accent',
                )}
              >
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t.api_name || '未关联API'}
                    {t.fission_count ? ` · ${t.fission_count} 条` : ''}
                  </p>
                </div>
                {selected?.id === t.id && <Check className="h-4 w-4 shrink-0" />}
              </button>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
