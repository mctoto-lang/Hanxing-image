import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Combobox } from '@/components/ui/combobox'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { FileText, ImagePlus, LayoutGrid, Sparkles, X } from 'lucide-react'
import Spinner from '@/components/Spinner'
import { apiFetch } from '@/lib/api'
import type { WorkspaceTask, Template, ImageModel } from '@/pages/WorkspacePage'
import { uploadReferenceImages } from '@/lib/product-reference-upload'
import { getReferenceImageLimit } from '@/lib/workspace-reference-images'

type CreateMode = 'smart' | 'extract' | 'custom'
type CreateStep = 'choose' | 'form'

interface CreateConfig {
  fissionTemplate: Template | null
  refineTemplate: Template | null
  regenTemplate: Template | null
  imageModel: ImageModel | null
  size: string | null
}

interface Props {
  open: boolean
  onClose: () => void
  onCreated: (task: WorkspaceTask, config: CreateConfig) => void
  selectedImageModel: ImageModel | null
}

export default function WorkspaceNewTaskDialog({ open, onClose, onCreated, selectedImageModel }: Props) {
  const [step, setStep] = useState<CreateStep>('choose')
  const [mode, setMode] = useState<CreateMode>('smart')
  const [title, setTitle] = useState('')
  const [themePrompt, setThemePrompt] = useState('')
  const [fissionTemplateId, setFissionTemplateId] = useState('')
  const [extractTemplateId, setExtractTemplateId] = useState('')
  const [refineTemplateId, setRefineTemplateId] = useState('')
  const [cardCount, setCardCount] = useState(1)
  const [referenceFiles, setReferenceFiles] = useState<File[]>([])
  const [fissionTemplates, setFissionTemplates] = useState<Template[]>([])
  const [extractTemplates, setExtractTemplates] = useState<Template[]>([])
  const [refineTemplates, setRefineTemplates] = useState<Template[]>([])
  const [loadingOptions, setLoadingOptions] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const referenceLimit = getReferenceImageLimit(selectedImageModel)

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
    setCardCount(1)
    setReferenceFiles([])
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
    if (mode === 'custom' && (!Number.isInteger(cardCount) || cardCount < 1 || cardCount > 100)) { toast.error('创建卡片数量必须为 1 到 100 的整数'); return }
    if (mode === 'custom' && referenceFiles.length && (!selectedImageModel || referenceLimit === 0)) { toast.error('请先在生成配置中选择支持参考图的图片模型'); return }
    if (mode === 'custom' && referenceFiles.length > referenceLimit) { toast.error(`当前模型最多支持 ${referenceLimit} 张参考图`); return }

    setSubmitting(true)
    try {
      const uploadResult = mode === 'custom' && referenceFiles.length ? await uploadReferenceImages(referenceFiles) : { uploads: [], errors: [] }
      uploadResult.errors.forEach(message => toast.error(message))
      if (uploadResult.errors.length) throw new Error('部分参考图片上传失败，请调整后重试')
      const res = await apiFetch('/api/workspace/tasks', {
        method: 'POST',
        body: {
          title: title.trim(),
          theme_prompt: themePrompt.trim(),
          mode,
          template_id: mode === 'smart' ? parseInt(fissionTemplateId) : undefined,
          extract_template_id: mode === 'extract' ? parseInt(extractTemplateId) : undefined,
          card_count: mode === 'custom' ? cardCount : undefined,
          reference_image_urls: mode === 'custom' ? uploadResult.uploads.map(item => item.url) : undefined,
          api_id: mode === 'custom' && referenceFiles.length ? selectedImageModel?.id : undefined,
        },
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || '创建失败')
      toast.success(mode === 'smart' ? '任务已创建，正在智能裂变...' : mode === 'extract' ? '任务已创建，正在提取裂变...' : `任务已创建，共 ${cardCount} 张卡片`)
      onCreated(data.task, {
        fissionTemplate: fissionTemplates.find(t => String(t.id) === fissionTemplateId) || null,
        refineTemplate: refineTemplates.find(t => String(t.id) === refineTemplateId) || null,
        regenTemplate: null,
        imageModel: mode === 'custom' ? selectedImageModel : null,
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
              onClick={() => handleModeSelect('custom')}
              className="rounded-xl border border-violet-300 bg-violet-50 p-5 text-left text-violet-700 transition-all hover:border-violet-400 hover:bg-violet-100 dark:border-violet-900/70 dark:bg-violet-950/30 dark:text-violet-300 dark:hover:bg-violet-950/50"
            >
              <LayoutGrid className="mb-2 h-5 w-5" />
              <div className="font-medium">自定义创建</div>
              <div className="mt-1 text-xs opacity-80">使用同一长提示词创建指定数量的卡片，并可上传默认参考图片。</div>
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
              : mode === 'extract' ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300' : 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/20 dark:text-violet-300',
          )}>
            当前方式：{mode === 'smart' ? '智能裂变' : mode === 'extract' ? '提取裂变' : '自定义创建'}
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

          {mode === 'custom' && <>
            <div className="space-y-1.5">
              <Label>创建卡片数量 <span className="text-destructive">*</span></Label>
              <Input type="number" min={1} max={100} value={cardCount} onChange={event => setCardCount(Number(event.target.value))} />
            </div>
            <div className="space-y-2">
              <Label>上传参考图片</Label>
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed p-4 text-sm text-muted-foreground hover:border-violet-400 hover:text-violet-600">
                <ImagePlus className="h-4 w-4" />选择图片
                <input type="file" accept="image/png,image/jpeg" multiple className="hidden" onChange={event => { setReferenceFiles(previous => [...previous, ...Array.from(event.target.files || [])]); event.target.value = '' }} />
              </label>
              {referenceFiles.length > 0 && <div className="space-y-1 rounded-lg border p-2">{referenceFiles.map((file, index) => <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 text-xs"><span className="truncate">{file.name}</span><Button type="button" variant="ghost" size="icon" className="h-6 w-6" onClick={() => setReferenceFiles(files => files.filter((_, itemIndex) => itemIndex !== index))}><X className="h-3.5 w-3.5" /></Button></div>)}</div>}
              <p className="text-xs text-muted-foreground">上传图片会加入本次所有卡片的图片库，并默认选为参考图片。{selectedImageModel ? `当前模型最多支持 ${referenceLimit} 张。` : '请先在生成配置中选择图片模型。'}</p>
            </div>
          </>}

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
              ) : mode === 'extract' ? (
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
              ) : <div />}

              {mode !== 'custom' && <div className="space-y-1.5">
                <Label>细化模板</Label>
                <Combobox
                  value={refineTemplateId}
                  onValueChange={setRefineTemplateId}
                  options={refineTemplateOptions}
                  placeholder="选择细化模板"
                  searchPlaceholder="搜索细化模板..."
                  emptyText="暂无细化模板"
                />
              </div>}
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
