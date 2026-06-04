import { X, Download, Copy, Check } from 'lucide-react'
import { useState } from 'react'
import { toImageSrc } from '@/lib/utils'
import { Button } from '@/components/ui/button'

interface PreviewItem {
  prompt?: string
  model_name?: string
  image_size?: string
  started_at?: string | null
  completed_at?: string | null
  created_at?: string
}

function formatDuration(start: string | null | undefined, end: string | null | undefined): string {
  if (!start || !end) return '-'
  const ms = new Date(end).getTime() - new Date(start).getTime()
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  return `${Math.floor(ms / 60000)}m${Math.round((ms % 60000) / 1000)}s`
}

function formatDateTime(dateStr: string | undefined): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

async function handleDownload(imageUrl: string, filename?: string) {
  try {
    const src = toImageSrc(imageUrl)
    // base64 数据直接下载
    if (src.startsWith('data:')) {
      const a = document.createElement('a')
      a.href = src
      a.download = filename || `hanxing-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      return
    }
    const isSameOrigin = src.startsWith('/') || src.startsWith(window.location.origin)
    if (isSameOrigin) {
      const response = await fetch(src)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename || `hanxing-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } else {
      // 外部URL：尝试fetch+blob下载，失败则用<a>标签打开新标签页
      try {
        const response = await fetch(src, { mode: 'cors' })
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename || `hanxing-${Date.now()}.png`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)
      } catch {
        // CORS阻止时，用<a>标签在新标签页打开（不会被弹窗拦截器阻止）
        const a = document.createElement('a')
        a.href = src
        a.target = '_blank'
        a.rel = 'noopener noreferrer'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }
    }
  } catch {
    // 最终降级：用<a>标签打开
    const a = document.createElement('a')
    a.href = toImageSrc(imageUrl)
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
}

export default function ImagePreviewOverlay({ open, onOpenChange, imageUrl, item }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  imageUrl: string | null
  item?: PreviewItem | null
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    if (!item?.prompt) return
    try {
      await navigator.clipboard.writeText(item.prompt)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  if (!open || !imageUrl) return null

  const src = toImageSrc(imageUrl)

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col items-center justify-center"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="absolute inset-0 bg-background/80 backdrop-blur-xl"
        style={{
          backgroundImage: `url(${src})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: 'blur(40px) brightness(0.5)',
          transform: 'scale(1.2)',
        }}
      />
      <div className="absolute inset-0 bg-background/40 backdrop-blur-sm" />

      <Button
        variant="ghost"
        size="icon-lg"
        onClick={(e) => { e.stopPropagation(); onOpenChange(false) }}
        className="fixed top-6 right-6 z-10 rounded-full bg-foreground/10 backdrop-blur-md text-foreground/80 hover:bg-foreground/20 hover:text-foreground border border-foreground/10"
      >
        <X className="h-5 w-5" />
      </Button>

      <div
        className="relative z-10 flex flex-col items-center gap-6 max-w-[90vw] max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={src}
          alt=""
          className="max-h-[70vh] max-w-[85vw] object-contain rounded-2xl shadow-2xl"
        />

        <div className="flex flex-col items-center gap-3">
          {item && (
            <div className="flex flex-col items-center gap-2 text-sm text-foreground/70">
              <div className="flex items-center gap-3 text-foreground/50">
                {item.image_size && (
                  <span className="px-2.5 py-1 rounded-lg bg-foreground/5 backdrop-blur-sm text-xs">{item.image_size}</span>
                )}
                {item.model_name && <span>{item.model_name}</span>}
                <span className="px-2.5 py-1 rounded-lg bg-foreground/5 backdrop-blur-sm text-xs">{formatDuration(item.started_at, item.completed_at)}</span>
              </div>
              {item.prompt && (
                <div className="flex items-center gap-2">
                  <p className="text-xs text-foreground/40 max-w-lg text-center line-clamp-2">{item.prompt}</p>
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="shrink-0 p-1.5 rounded-lg bg-foreground/10 backdrop-blur-md text-foreground/60 hover:bg-foreground/20 hover:text-foreground/80 transition-colors"
                    title="复制提示词"
                  >
                    {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            {item?.created_at && (
              <span className="text-xs text-foreground/50">
                创建时间：{formatDateTime(item.created_at)}
              </span>
            )}
          </div>

          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => { e.stopPropagation(); handleDownload(imageUrl) }}
            className="gap-1.5 rounded-lg bg-foreground/10 backdrop-blur-md text-foreground/80 hover:bg-foreground/20 hover:text-foreground border border-foreground/10 text-xs px-4 py-2"
          >
            <Download className="h-3.5 w-3.5" />
            下载
          </Button>
        </div>
      </div>
    </div>
  )
}
