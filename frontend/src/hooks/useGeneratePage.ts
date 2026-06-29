import { useState, useEffect, useCallback, useMemo } from 'react'
import { apiFetch } from '@/lib/api'
import { uploadReferenceImages } from '@/lib/product-reference-upload'
import { toast } from 'sonner'

export interface Model {
  id: number
  name: string
  display_name: string
  cost_per_image: number
  icon_url: string | null
  supported_sizes: { ratios: { ratio: string; width: number; height: number }[] } | null
  supports_reference_image: boolean
  max_reference_images: number
}

export interface QueueStatus {
  queued: number
  processing: number
}

export interface ReferenceUploadState {
  uploadedCount: number
  totalCount: number
  percent: number
  currentFileName: string
}

export interface HistoryItem {
  id: number
  prompt: string
  status: string
  result_images: string[]
  created_at: string
  model_name: string
  image_size: string
  image_count: number
  credits_charged: number
  error_message: string | null
  retry_count: number
  started_at: string | null
  completed_at: string | null
}

export const defaultRatios = [
  { ratio: '1:1', width: 1024, height: 1024 },
  { ratio: '3:2', width: 1536, height: 1024 },
  { ratio: '2:3', width: 1024, height: 1536 },
  { ratio: '16:9', width: 2048, height: 1152 },
  { ratio: '9:16', width: 1156, height: 2048 },
]

export function getBriefError(msg: string | null): string {
  if (!msg) return '生成失败'
  const colonIdx = msg.indexOf(':')
  if (colonIdx > 0 && colonIdx < 30) {
    const afterColon = msg.slice(colonIdx + 1).trim()
    const dashIdx = afterColon.indexOf(' - ')
    if (dashIdx > 0) {
      return msg.slice(0, colonIdx + 1) + ' ' + afterColon.slice(0, dashIdx)
    }
    if (afterColon.length > 30) {
      return msg.slice(0, colonIdx + 1) + ' ' + afterColon.slice(0, 25) + '...'
    }
  }
  if (msg.length > 30) return msg.slice(0, 27) + '...'
  return msg
}

interface UseGeneratePageOptions {
  modelSource: 'generate' | 'canvas'
  taskSource: 'creative' | 'project'
  creditField: 'creative_credits' | 'project_credits'
  creditStorageKey: string
  promptCacheKey?: string
}

export function useGeneratePage(options: UseGeneratePageOptions) {
  const { modelSource, taskSource, creditField, creditStorageKey, promptCacheKey } = options

  const loadPromptDraft = (): string => {
    if (!promptCacheKey) return ''
    if (typeof window === 'undefined') return ''
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined
    if (navigation?.type === 'reload') {
      sessionStorage.removeItem(promptCacheKey)
      return ''
    }
    return sessionStorage.getItem(promptCacheKey) || ''
  }

  const [prompt, setPrompt] = useState(() => loadPromptDraft())
  const [models, setModels] = useState<Model[]>([])
  const [selectedModel, setSelectedModel] = useState<string>('')
  const [imageSize, setImageSize] = useState('1024x1024')
  const [customWidth, setCustomWidth] = useState('1024')
  const [customHeight, setCustomHeight] = useState('1024')
  const [credits, setCredits] = useState(0)
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({ queued: 0, processing: 0 })
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [historyLoading, setHistoryLoading] = useState(true)
  const [showHistory, setShowHistory] = useState(true)
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorDialogContent, setErrorDialogContent] = useState('')
  const [previewOpen, setPreviewOpen] = useState(false)
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null)
  const [previewItem, setPreviewItem] = useState<HistoryItem | null>(null)
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set())
  const [referenceImages, setReferenceImages] = useState<string[]>([])
  const [refDialogOpen, setRefDialogOpen] = useState(false)
  const [refUploading, setRefUploading] = useState(false)
  const [refUploadState, setRefUploadState] = useState<ReferenceUploadState>({ uploadedCount: 0, totalCount: 0, percent: 0, currentFileName: '' })
  const [refDragOver, setRefDragOver] = useState(false)

  const selectedModelData = useMemo(() => models.find((m) => String(m.id) === selectedModel), [models, selectedModel])

  // Prompt 缓存
  useEffect(() => {
    if (!promptCacheKey) return
    if (prompt) sessionStorage.setItem(promptCacheKey, prompt)
    else sessionStorage.removeItem(promptCacheKey)
  }, [prompt, promptCacheKey])

  const fetchPinnedIds = useCallback(async () => {
    try {
      const data = await apiFetch('/api/tasks/pinned').then(r => r.json())
      setPinnedIds(new Set(data.pinned_ids || []))
    } catch {}
  }, [])

  const handlePin = useCallback(async (taskId: number) => {
    try {
      const isPinned = pinnedIds.has(taskId)
      const res = await apiFetch(`/api/tasks/${taskId}/pin`, {
        method: isPinned ? 'DELETE' : 'POST',
      })
      if (res.ok) {
        setPinnedIds(prev => {
          const next = new Set(prev)
          if (isPinned) next.delete(taskId)
          else next.add(taskId)
          return next
        })
      }
    } catch {}
  }, [pinnedIds])

  const fetchModels = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/models?source=${modelSource}`).then(r => r.json())
      setModels(data.models || [])
      setSelectedModel((prev) => {
        if (prev) return prev
        if (data.models?.length > 0) return String(data.models[0].id)
        return prev
      })
    } catch {}
  }, [modelSource])

  const fetchQueueStatus = useCallback(async () => {
    try {
      const data = await apiFetch('/api/tasks/queue').then(r => r.json())
      setQueueStatus(data)
    } catch {}
  }, [])

  const fetchHistory = useCallback(async () => {
    try {
      const data = await apiFetch(`/api/tasks/history?limit=20&source=${taskSource}`).then(r => r.json())
      setHistory(data.tasks || [])
    } catch {} finally {
      setHistoryLoading(false)
    }
  }, [taskSource])

  const fetchUserInfo = useCallback(async () => {
    try {
      const data = await apiFetch('/api/auth/me').then(r => r.json())
      if (data.user) {
        setCredits(data.user[creditField] || 0)
        localStorage.setItem(creditStorageKey, String(data.user[creditField] || 0))
      }
    } catch {}
  }, [creditField, creditStorageKey])

  const handleRefUpload = useCallback(async (files: FileList | File[]) => {
    const maxRef = selectedModelData?.max_reference_images || 1
    const remaining = maxRef - referenceImages.length
    if (remaining <= 0) return

    const filesToUpload = Array.from(files).slice(0, remaining)
    setRefUploading(true)
    setRefUploadState({ uploadedCount: 0, totalCount: filesToUpload.length, percent: 0, currentFileName: '' })
    try {
      const uploadedUrls = await uploadReferenceImages(filesToUpload, {
        onProgress: (progress) => {
          setRefUploadState(progress)
        },
      })
      setReferenceImages(prev => [...prev, ...uploadedUrls])
      toast.success(`已上传 ${uploadedUrls.length} 张参考图`)
    } catch (error: any) {
      toast.error(error?.message || '参考图上传失败')
    } finally {
      setRefUploading(false)
      setRefUploadState({ uploadedCount: 0, totalCount: 0, percent: 0, currentFileName: '' })
    }
  }, [selectedModelData, referenceImages.length])

  useEffect(() => {
    fetchModels()
    fetchQueueStatus()
    fetchUserInfo()
    fetchHistory()
    fetchPinnedIds()
    const interval = setInterval(() => {
      fetchQueueStatus()
      fetchHistory()
    }, 5000)
    return () => clearInterval(interval)
  }, [fetchModels, fetchQueueStatus, fetchUserInfo, fetchHistory, fetchPinnedIds])

  const handleRetry = useCallback(async (taskId: number) => {
    try {
      const res = await apiFetch(`/api/tasks/${taskId}/retry`, { method: 'POST' })
      const data = await res.json()
      if (res.ok) {
        fetchHistory()
        fetchUserInfo()
        fetchQueueStatus()
      } else {
        toast.error(data.error || '重试失败')
      }
    } catch {
      toast.error('网络错误')
    }
  }, [fetchHistory, fetchUserInfo, fetchQueueStatus])

  const openErrorDialog = useCallback((errorMsg: string) => {
    setErrorDialogContent(errorMsg || '生成失败')
    setErrorDialogOpen(true)
  }, [])

  const openImagePreview = useCallback((imageUrl: string, item: HistoryItem) => {
    setPreviewImageUrl(imageUrl)
    setPreviewItem(item)
    setPreviewOpen(true)
  }, [])

  const handleSubmit = useCallback(async (text: string) => {
    if (!text.trim() || !selectedModel || loading) return
    setLoading(true)
    setMessage('')
    try {
      const res = await apiFetch('/api/tasks/generate', {
        method: 'POST',
        body: {
          prompt: text,
          model_id: parseInt(selectedModel),
          image_size: imageSize,
          source: taskSource,
          reference_images: referenceImages.length > 0 ? referenceImages : undefined,
        },
      })
      const data = await res.json()
      if (res.ok) {
        setMessage('任务已提交，正在排队生成...')
        setPrompt('')
        if (promptCacheKey) sessionStorage.removeItem(promptCacheKey)
        setReferenceImages([])
        fetchUserInfo()
        fetchQueueStatus()
        if (data.task?.id) {
          const modelObj = models.find((m) => String(m.id) === selectedModel)
          const newTask: HistoryItem = {
            id: data.task.id,
            prompt: text,
            status: 'queued',
            result_images: [],
            created_at: new Date().toISOString(),
            model_name: modelObj?.display_name || '',
            image_size: imageSize,
            image_count: 1,
            credits_charged: modelObj?.cost_per_image || 0,
            error_message: null,
            retry_count: 0,
            started_at: null,
            completed_at: null,
          }
          setHistory((prev) => [newTask, ...prev])
          setSelectedTaskId(data.task.id)
        }
        fetchHistory()
      } else {
        setMessage(data.error || '提交失败')
      }
    } catch {
      setMessage('网络错误')
    } finally {
      setLoading(false)
    }
  }, [selectedModel, imageSize, loading, fetchUserInfo, fetchQueueStatus, fetchHistory, models, taskSource, referenceImages, promptCacheKey])

  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(''), 3000)
    return () => clearTimeout(timer)
  }, [message])

  const totalCost = selectedModelData?.cost_per_image || 0
  const isError = message.includes('失败') || message.includes('错误')
  const isWarning = !isError && (message.includes('不足') || message.includes('已达到') || message.includes('网络错误'))
  const selectedTask = useMemo(() => history.find((h) => h.id === selectedTaskId) || null, [history, selectedTaskId])
  const sortedHistory = useMemo(() => [...history].sort((a, b) => {
    const aPinned = pinnedIds.has(a.id) ? 1 : 0
    const bPinned = pinnedIds.has(b.id) ? 1 : 0
    return bPinned - aPinned
  }), [history, pinnedIds])

  return {
    // Prompt
    prompt, setPrompt,
    // Model & size
    models, selectedModel, setSelectedModel,
    imageSize, setImageSize,
    customWidth, setCustomWidth,
    customHeight, setCustomHeight,
    selectedModelData,
    // Credits & queue
    credits, queueStatus,
    // Task state
    loading, message,
    history, historyLoading,
    showHistory, setShowHistory,
    selectedTaskId, setSelectedTaskId,
    // Error dialog
    errorDialogOpen, setErrorDialogOpen,
    errorDialogContent,
    // Preview
    previewOpen, setPreviewOpen,
    previewImageUrl, previewItem,
    // Pin
    pinnedIds, handlePin,
    // Reference images
    referenceImages, setReferenceImages,
    refDialogOpen, setRefDialogOpen,
    refUploading, refUploadState, refDragOver, setRefDragOver,
    // Computed
    totalCost, isError, isWarning,
    selectedTask, sortedHistory,
    // Actions
    handleRetry, openErrorDialog, openImagePreview,
    handleSubmit, handleRefUpload,
  }
}
