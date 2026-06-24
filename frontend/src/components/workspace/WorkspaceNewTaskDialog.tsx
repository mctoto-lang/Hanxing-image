import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Combobox } from '@/components/ui/combobox'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { FileText, Sparkles } from 'lucide-react'
import Spinner from '@/components/Spinner'
import { apiFetch } from '@/lib/api'
import type { WorkspaceTask, Template, ImageModel } from '@/pages/WorkspacePage'

type CreateMode = 'smart' | 'extract'
type CreateStep = 'choose' | 'form'

interface CreateConfig {
  fissionTemplate: Template | null
  refineTemplate: Template | null
  imageModel: ImageModel | null
  size: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (task: WorkspaceTask, config: CreateConfig) => void
}

export default function WorkspaceNewTaskDialog({ open, onClose, onCreated }: Props) {
  const [step, setStep] = useState<CreateStep>('choose')
  const [mode, setMode] = useState<CreateMode>('smart')
  const [title, setTitle] = useState('')
  const [themePrompt, setThemePrompt] = useState('')
  const [fissionTemplateId, setFissionTemplateId] = useState('')
  const [extractTemplateId, setExtractTemplateId] = useState('')
  const [refineTemplateId, setRefineTemplateId] = useState('')
  const [fissionTemplates, setFissionTemplates] = useState<Template[]>([])
  const [extractTemplates, setExtractTemplates] = useState<Template[]>([])
  const [refineTemplates, setRefineTemplates] = useState<Template[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const fissionTemplateOptions = useMemo(() => fissionTemplates.map(t => ({
    value: String(t.id),
    label: `${t.name}${t.fission_count ? ` (${t.fission_count}条)` : ''}`,
    description: t.api_name || undefined,
  })), [fissionTemplates])
  const extractTemplateOptions = useMemo(() => extractTemplates.map(t => ({
    value: String(t.id),
    label: t.name,
    description: t.api_name || undefined,
  })), [extractTemplates])
  const refineTemplateOptions = useMemo(() => refineTemplates.map(t => ({
    value: String(t.id),
    label: t.name,
    description: t.api_name || undefined,
  })), [refineTemplates])

  useEffect(() => {
    if (open) fetchOptions()
  }, [open])

  const fetchOptions = async () => {
    setLoadingOptions(true)
    try {
      const [fissionRes, extractRes, refineRes] = await Promise.all([
        apiFetch('/api/admin/workspace/templates?type=fission'),
        apiFetch('/api/admin/workspace/templates?type=extract'),
        apiFetch('/api/admin/workspace/templates?type=deepen'),
      ])
      const [fissionData, extractData, refineData] = await Promise.all([
        fissionRes.json(), extractRes.json(), refineRes.json(),
      ])
      setFissionTemplates(fissionData.templates || [])
      setExtractTemplates(extractData.templates || [])
      setRefineTemplates(refineData.templates || [])
    } catch {
      toast.error('获取新建任务配置失败')
    } finally {
      setLoadingOptions(false)
    }
  }

  const resetForm = () => {
    setStep('choose')
    setMode('smart')
    setTitle('')
    setThemePrompt('')
    setFissionTemplateId('')
    setExtractTemplateId('')
    setRefineTemplateId('')
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleModeSelect = (nextMode: CreateMode) => {
    setMode(nextMode)
    setStep('form')
  }

  const handleSubmit = async () => {
    if (!title.trim()) { toast.error('请输入任务标题'); return }
    if (!themePrompt.trim()) { toast.error(mode === 'smart' ? '请输入主题提示词' : '请输入包含多个画面描述的长提示词'); return }
    if (mode === 'smart' && !fissionTemplateId) { toast.error('请选择裂变模板'); return }
    if (mode === 'extract' && !extractTemplateId) { toast.error('请选择提取提示词模板'); return }

    setSubmitting(true)
    try {
      const res = await apiFetch('/api/workspace/tasks', {
        method: 'POST',
        body: {
          title: title.trim(),
          theme_prompt: themePrompt.trim(),
          mode,
          template_id: mode === 'smart' ? parseInt(fissionTemplateId) : undefined,
          extract_template_id: mode === 'extract' ? parseInt(extractTemplateId) : undefined,
        },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '创建失败')
      toast.success(mode === 'smart' ? '任务已创建，正在智能裂变...' : '任务已创建，正在提取裂变...')
      onCreated(data.task, {
        fissionTemplate: fissionTemplates.find(t => String(t.id) === fissionTemplateId) || null,
        refineTemplate: refineTemplates.find(t => String(t.id) === refineTemplateId) || null,
        imageModel: null,
        size: null,
      })
      resetForm()
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && handleClose()}>
      <DialogContent className={step === 'choose' ? 'max-w-lg' : 'max-w-2xl'}>
        <DialogHeader>
          <DialogTitle>{step === 'choose' ? '选择新建任务方式' : '新建批量生图任务'}</DialogTitle>
        </DialogHeader>

        {step === 'choose' ? (
          <div className="grid grid-cols-1 gap-3">
            <button
              type="button"
              onClick={() => handleModeSelect('smart')}
              className="rounded-xl border border-blue-300 bg-blue-50 p-5 text-left text-blue-700 transition-all hover:border-blue-400 hover:bg-blue-100 dark:border-blue-900/70 dark:bg-blue-950/30 dark:text-blue-300 dark:hover:bg-blue-950/50"
            >
              <Sparkles className="mb-2 h-5 w-5" />
              <div className="font-medium">智能裂变</div>
              <div className="mt-1 text-xs opacity-80">输入主题提示词，AI 根据裂变模板生成多张卡片。</div>
            </button>
            <button
              type="button"
              onClick={() => handleModeSelect('extract')}
              className="rounded-xl border border-emerald-300 bg-emerald-50 p-5 text-left text-emerald-700 transition-all hover:border-emerald-400 hover:bg-emerald-100 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-300 dark:hover:bg-emerald-950/50"
            >
              <FileText className="mb-2 h-5 w-5" />
              <div className="font-medium">提取裂变</div>
              <div className="mt-1 text-xs opacity-80">输入已写好的长提示词，AI 提取拆分为编号画面描述。</div>
            </button>
          </div>
        ) : (
        <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pr-1">
          <div className={cn(
            'rounded-xl border px-3 py-2 text-sm',
            mode === 'smart'
              ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-blue-300'
              : 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300',
          )}>
            当前方式：{mode === 'smart' ? '智能裂变' : '提取裂变'}
          </div>

          <div className="space-y-1.5">
            <Label>任务标题 <span className="text-destructive">*</span></Label>
            <Input placeholder="给这批图起个名字..." value={title} onChange={e => setTitle(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label>{mode === 'smart' ? '主题提示词' : '长提示词'} <span className="text-destructive">*</span></Label>
            <Textarea
              placeholder={mode === 'smart' ? '输入主题，AI 将据此裂变出多条图片提示词...' : '粘贴一整段已经写好的多个画面描述，AI 将按编号列表拆解...'}
              value={themePrompt}
              onChange={e => setThemePrompt(e.target.value)}
              rows={mode === 'smart' ? 4 : 7}
            />
          </div>

          {loadingOptions ? (
            <div className="flex items-center gap-2 py-3 text-sm text-muted-foreground"><Spinner />加载配置...</div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              {mode === 'smart' ? (
                <div className="space-y-1.5">
                  <Label>裂变模板 <span className="text-destructive">*</span></Label>
                  <Combobox
                    value={fissionTemplateId}
                    onValueChange={setFissionTemplateId}
                    options={fissionTemplateOptions}
                    placeholder="选择裂变模板"
                    searchPlaceholder="搜索裂变模板..."
                    emptyText="暂无裂变模板"
                  />
                </div>
              ) : (
                <div className="space-y-1.5">
                  <Label>提取提示词模板 <span className="text-destructive">*</span></Label>
                  <Combobox
                    value={extractTemplateId}
                    onValueChange={setExtractTemplateId}
                    options={extractTemplateOptions}
                    placeholder="选择提取模板"
                    searchPlaceholder="搜索提取模板..."
                    emptyText="暂无提取模板"
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label>细化模板</Label>
                <Combobox
                  value={refineTemplateId}
                  onValueChange={setRefineTemplateId}
                  options={refineTemplateOptions}
                  placeholder="选择细化模板"
                  searchPlaceholder="搜索细化模板..."
                  emptyText="暂无细化模板"
                />
              </div>
            </div>
          )}
        </div>
        )}

        {step === 'form' && (
          <DialogFooter>
            <>
              <Button variant="outline" onClick={() => setStep('choose')} disabled={submitting}>上一步</Button>
              <Button onClick={handleSubmit} disabled={submitting}>{submitting ? <><Spinner />创建中...</> : '创建任务'}</Button>
            </>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
