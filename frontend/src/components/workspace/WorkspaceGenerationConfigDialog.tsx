import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Combobox } from '@/components/ui/combobox'
import { apiFetch } from '@/lib/api'
import { toast } from 'sonner'
import Spinner from '@/components/Spinner'
import { toImageSrc } from '@/lib/utils'
import type { Template, ImageModel } from '@/pages/WorkspacePage'

interface Props {
  open: boolean
  selectedFissionTemplate: Template | null
  selectedRefineTemplate: Template | null
  selectedRegenTemplate: Template | null
  selectedExtractTemplate: Template | null
  selectedTranslateTemplate: Template | null
  selectedImageModel: ImageModel | null
  selectedSize: string | null
  onApply: (config: {
    fissionTemplate: Template | null
    refineTemplate: Template | null
    regenTemplate: Template | null
    extractTemplate: Template | null
    translateTemplate: Template | null
    imageModel: ImageModel | null
    size: string | null
  }) => void
  onClose: () => void
}

const DEFAULT_SIZES = [
  { label: '1:1 正方形', value: '1024x1024' },
  { label: '2:3 竖版', value: '1024x1792' },
  { label: '3:2 横版', value: '1792x1024' },
  { label: '9:16 手机竖屏', value: '1080x1920' },
  { label: '16:9 横屏', value: '1920x1080' },
]

function getModelSizes(model: ImageModel | null) {
  return model?.supported_sizes?.ratios?.map(r => ({
    label: `${r.ratio} (${r.width}×${r.height})`,
    value: `${r.width}x${r.height}`,
  })) || DEFAULT_SIZES
}

export default function WorkspaceGenerationConfigDialog({
  open,
  selectedFissionTemplate,
  selectedRefineTemplate,
  selectedRegenTemplate,
  selectedExtractTemplate,
  selectedTranslateTemplate,
  selectedImageModel,
  selectedSize,
  onApply,
  onClose,
}: Props) {
  const [fissionTemplates, setFissionTemplates] = useState<Template[]>([])
  const [refineTemplates, setRefineTemplates] = useState<Template[]>([])
  const [regenTemplates, setRegenTemplates] = useState<Template[]>([])
  const [extractTemplates, setExtractTemplates] = useState<Template[]>([])
  const [translateTemplates, setTranslateTemplates] = useState<Template[]>([])
  const [models, setModels] = useState<ImageModel[]>([])
  const [fissionTemplateId, setFissionTemplateId] = useState('')
  const [refineTemplateId, setRefineTemplateId] = useState('')
  const [regenTemplateId, setRegenTemplateId] = useState('')
  const [extractTemplateId, setExtractTemplateId] = useState('')
  const [translateTemplateId, setTranslateTemplateId] = useState('')
  const [imageModelId, setImageModelId] = useState('')
  const [size, setSize] = useState('')
  const [loading, setLoading] = useState(false)

  const selectedModel = useMemo(() => models.find(m => String(m.id) === imageModelId) || null, [models, imageModelId])
  const sizes = useMemo(() => getModelSizes(selectedModel), [selectedModel])
  const fissionTemplateOptions = useMemo(() => fissionTemplates.map(t => ({
    value: String(t.id),
    label: t.name,
    description: t.api_name || undefined,
  })), [fissionTemplates])
  const refineTemplateOptions = useMemo(() => refineTemplates.map(t => ({
    value: String(t.id),
    label: t.name,
    description: t.api_name || undefined,
  })), [refineTemplates])
  const regenTemplateOptions = useMemo(() => regenTemplates.map(t => ({
    value: String(t.id),
    label: t.name,
    description: t.api_name || undefined,
  })), [regenTemplates])
  const extractTemplateOptions = useMemo(() => extractTemplates.map(t => ({
    value: String(t.id),
    label: t.name,
    description: t.api_name || undefined,
  })), [extractTemplates])
  const translateTemplateOptions = useMemo(() => translateTemplates.map(t => ({
    value: String(t.id),
    label: t.name,
    description: t.api_name || undefined,
  })), [translateTemplates])
  const modelOptions = useMemo(() => models.map(m => ({
    value: String(m.id),
    label: m.display_name || m.name,
    description: m.name,
    icon: m.icon_url ? toImageSrc(m.icon_url) : undefined,
  })), [models])
  const sizeOptions = useMemo(() => sizes.map(s => ({
    value: s.value,
    label: s.label,
    description: s.value,
  })), [sizes])

  useEffect(() => {
    if (!open) return
    setFissionTemplateId(selectedFissionTemplate ? String(selectedFissionTemplate.id) : '')
    setRefineTemplateId(selectedRefineTemplate ? String(selectedRefineTemplate.id) : '')
    setRegenTemplateId(selectedRegenTemplate ? String(selectedRegenTemplate.id) : '')
    setExtractTemplateId(selectedExtractTemplate ? String(selectedExtractTemplate.id) : '')
    setTranslateTemplateId(selectedTranslateTemplate ? String(selectedTranslateTemplate.id) : '')
    setImageModelId(selectedImageModel ? String(selectedImageModel.id) : '')
    setSize(selectedSize || '')
    fetchOptions()
  }, [open])

  useEffect(() => {
    if (!open) return
    if (selectedImageModel && String(selectedImageModel.id) === imageModelId) return
    setSize('')
  }, [imageModelId])

  const fetchOptions = async () => {
    setLoading(true)
    try {
      const [fissionRes, refineRes, regenRes, extractRes, translateRes, modelsRes] = await Promise.all([
        apiFetch('/api/workspace/templates?type=fission'),
        apiFetch('/api/workspace/templates?type=deepen'),
        apiFetch('/api/workspace/templates?type=regenerate'),
        apiFetch('/api/workspace/templates?type=extract'),
        apiFetch('/api/workspace/templates?type=translate'),
        apiFetch('/api/models?source=workspace'),
      ])
      const [fissionData, refineData, regenData, extractData, translateData, modelsData] = await Promise.all([fissionRes.json(), refineRes.json(), regenRes.json(), extractRes.json(), translateRes.json(), modelsRes.json()])
      setFissionTemplates(fissionData.templates || [])
      setRefineTemplates(refineData.templates || [])
      setRegenTemplates(regenData.templates || [])
      setExtractTemplates(extractData.templates || [])
      setTranslateTemplates(translateData.templates || [])
      setModels(modelsData.models || [])
    } catch {
      toast.error('获取生成配置失败')
    } finally {
      setLoading(false)
    }
  }

  const handleApply = () => {
    onApply({
      fissionTemplate: fissionTemplates.find(t => String(t.id) === fissionTemplateId) || null,
      refineTemplate: refineTemplates.find(t => String(t.id) === refineTemplateId) || null,
      regenTemplate: regenTemplates.find(t => String(t.id) === regenTemplateId) || null,
      extractTemplate: extractTemplates.find(t => String(t.id) === extractTemplateId) || null,
      translateTemplate: translateTemplates.find(t => String(t.id) === translateTemplateId) || null,
      imageModel: selectedModel,
      size: size || null,
    })
    onClose()
  }

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader><DialogTitle>生成配置</DialogTitle></DialogHeader>
        {loading ? (
          <div className="flex items-center justify-center py-10"><Spinner /></div>
        ) : (
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>裂变模板</Label>
              <Combobox
                value={fissionTemplateId}
                onValueChange={setFissionTemplateId}
                options={fissionTemplateOptions}
                placeholder="选择裂变模板"
                searchPlaceholder="搜索裂变模板..."
                emptyText="暂无裂变模板"
                className="h-10"
                contentClassName="min-w-[360px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>细化模板</Label>
              <Combobox
                value={refineTemplateId}
                onValueChange={setRefineTemplateId}
                options={refineTemplateOptions}
                placeholder="选择细化模板"
                searchPlaceholder="搜索细化模板..."
                emptyText="暂无细化模板"
                className="h-10"
                contentClassName="min-w-[360px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>重新生成模板</Label>
              <Combobox
                value={regenTemplateId}
                onValueChange={setRegenTemplateId}
                options={regenTemplateOptions}
                placeholder="选择重新生成模板"
                searchPlaceholder="搜索重新生成模板..."
                emptyText="暂无重新生成模板"
                className="h-10"
                contentClassName="min-w-[360px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>提取提示词模板</Label>
              <Combobox
                value={extractTemplateId}
                onValueChange={setExtractTemplateId}
                options={extractTemplateOptions}
                placeholder="选择提取提示词模板"
                searchPlaceholder="搜索提取提示词模板..."
                emptyText="暂无提取提示词模板"
                className="h-10"
                contentClassName="min-w-[360px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>提示词翻译模板</Label>
              <Combobox
                value={translateTemplateId}
                onValueChange={setTranslateTemplateId}
                options={translateTemplateOptions}
                placeholder="选择翻译模板"
                searchPlaceholder="搜索翻译模板..."
                emptyText="暂无提示词翻译模板"
                className="h-10"
                contentClassName="min-w-[360px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>图片模型</Label>
              <Combobox
                value={imageModelId}
                onValueChange={setImageModelId}
                options={modelOptions}
                placeholder="选择图片模型"
                searchPlaceholder="搜索图片模型..."
                emptyText="暂无图片模型"
                className="h-10"
                contentClassName="min-w-[360px]"
              />
            </div>
            <div className="space-y-1.5">
              <Label>尺寸</Label>
              <Combobox
                value={size}
                onValueChange={setSize}
                options={sizeOptions}
                placeholder={selectedModel ? '选择尺寸' : '请先选择图片模型'}
                searchPlaceholder="搜索尺寸..."
                emptyText="暂无尺寸"
                disabled={!selectedModel}
                className="h-10"
                contentClassName="min-w-[360px]"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>取消</Button>
          <Button onClick={handleApply}>应用配置</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
