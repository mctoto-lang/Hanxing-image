import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/api'
import { Settings, Save, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

interface SystemSettings {
  queue_green_threshold: number
  queue_yellow_threshold: number
}

export default function AdminSettings() {
  const [settings, setSettings] = useState<SystemSettings>({
    queue_green_threshold: 10,
    queue_yellow_threshold: 15,
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchSettings = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch('/api/admin/settings')
      if (res.ok) {
        const data = await res.json()
        setSettings({
          queue_green_threshold: data.queue_green_threshold ?? 10,
          queue_yellow_threshold: data.queue_yellow_threshold ?? 15,
        })
      }
    } catch {
      toast.error('获取设置失败')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchSettings()
  }, [fetchSettings])

  const handleSave = async () => {
    if (settings.queue_green_threshold >= settings.queue_yellow_threshold) {
      toast.error('绿色阈值必须小于黄色阈值')
      return
    }
    if (settings.queue_green_threshold < 1 || settings.queue_yellow_threshold < 1) {
      toast.error('阈值必须大于0')
      return
    }

    setSaving(true)
    try {
      const res = await apiFetch('/api/admin/settings', {
        method: 'PUT',
        body: settings,
      })
      if (res.ok) {
        toast.success('设置已保存')
      } else {
        const data = await res.json()
        toast.error(data.error || '保存失败')
      }
    } catch {
      toast.error('网络错误')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <Settings className="h-6 w-6 text-muted-foreground" />
        <h1 className="text-xl font-semibold">系统设置</h1>
      </div>

      <div className="space-y-6">
        <div className="rounded-xl border border-border bg-card p-6">
          <h2 className="text-base font-medium mb-4">队列状态阈值</h2>
          <p className="text-sm text-muted-foreground mb-6">
            设置生图队列状态的显示阈值。当排队任务数小于绿色阈值时显示绿色（服务畅通），
            大于等于绿色阈值且小于黄色阈值时显示黄色（服务排队），
            大于等于黄色阈值时显示红色（服务繁忙）。
          </p>

          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium">绿色阈值（服务畅通）</label>
              <Input
                type="number"
                min={1}
                value={settings.queue_green_threshold}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  queue_green_threshold: parseInt(e.target.value) || 1
                }))}
                className="h-9"
              />
              <p className="text-xs text-muted-foreground">
                排队任务 &lt; {settings.queue_green_threshold} 时显示绿色
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">黄色阈值（服务排队）</label>
              <Input
                type="number"
                min={1}
                value={settings.queue_yellow_threshold}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  queue_yellow_threshold: parseInt(e.target.value) || 1
                }))}
                className="h-9"
              />
              <p className="text-xs text-muted-foreground">
                排队任务 ≥ {settings.queue_yellow_threshold} 时显示红色
              </p>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-border flex justify-end">
            <Button onClick={handleSave} disabled={saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              保存设置
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
