import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from '@/lib/api'
import { Database, Save, TestTube2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface StorageSettings {
  storage_provider: 'local' | 'cos'
  cos_secret_id: string
  cos_secret_key: string
  cos_bucket: string
  cos_region: string
  cos_base_url: string
  cos_image_prefix: string
  local_image_prefix: string
}

const defaultSettings: StorageSettings = {
  storage_provider: 'local',
  cos_secret_id: '',
  cos_secret_key: '',
  cos_bucket: '',
  cos_region: '',
  cos_base_url: '',
  cos_image_prefix: 'image/',
  local_image_prefix: 'image/',
}

export default function AdminStorageSettings() {
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')
  const [storage, setStorage] = useState<StorageSettings>(defaultSettings)

  const fetchStorage = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/settings/storage')
      const data = await res.json()
      if (data.settings) {
        setStorage(data.settings)
      }
    } catch {
      setMessage('加载存储设置失败')
    }
  }, [])

  useEffect(() => {
    fetchStorage()
  }, [fetchStorage])

  const handleSaveStorage = async () => {
    try {
      setSaving(true)
      setMessage('')
      const res = await apiFetch('/api/admin/settings/storage', {
        method: 'PUT',
        body: storage,
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error || '保存存储设置失败')
        return
      }
      if (data.settings) {
        setStorage(data.settings)
      }
      setMessage('存储设置已保存')
    } catch {
      setMessage('保存存储设置失败')
    } finally {
      setSaving(false)
    }
  }

  const handleTestCos = async () => {
    try {
      setTesting(true)
      setMessage('')
      const res = await apiFetch('/api/admin/settings/storage/test-cos', {
        method: 'POST',
        body: storage,
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage(data.error || 'COS 测试失败')
        return
      }
      setMessage(data.url ? `${data.message}，路径前缀：${data.url}` : data.message || 'COS 测试成功')
    } catch {
      setMessage('COS 测试失败')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">存储设置</h1>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            存储配置
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="storage-provider">存储方式</Label>
            <Select
              value={storage.storage_provider}
              onValueChange={(value: string | null) =>
                setStorage((prev) => ({
                  ...prev,
                  storage_provider: value === 'cos' ? 'cos' : 'local',
                }))
              }
            >
              <SelectTrigger id="storage-provider" className="w-full">
                <SelectValue placeholder="选择存储方式" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="local">本地存储</SelectItem>
                <SelectItem value="cos">腾讯云 COS</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="local-image-prefix">本地存储目录前缀</Label>
            <Input
              id="local-image-prefix"
              value={storage.local_image_prefix}
              onChange={(e) => setStorage((prev) => ({ ...prev, local_image_prefix: e.target.value }))}
              placeholder="image/"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cos-secret-id">COS SecretId</Label>
            <Input
              id="cos-secret-id"
              value={storage.cos_secret_id}
              onChange={(e) => setStorage((prev) => ({ ...prev, cos_secret_id: e.target.value }))}
              placeholder="请输入 SecretId"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cos-secret-key">COS SecretKey</Label>
            <Input
              id="cos-secret-key"
              type="password"
              value={storage.cos_secret_key}
              onChange={(e) => setStorage((prev) => ({ ...prev, cos_secret_key: e.target.value }))}
              placeholder="请输入 SecretKey"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cos-bucket">Bucket 名称</Label>
            <Input
              id="cos-bucket"
              value={storage.cos_bucket}
              onChange={(e) => setStorage((prev) => ({ ...prev, cos_bucket: e.target.value }))}
              placeholder="example-1250000000"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="cos-region">地域</Label>
            <Input
              id="cos-region"
              value={storage.cos_region}
              onChange={(e) => setStorage((prev) => ({ ...prev, cos_region: e.target.value }))}
              placeholder="ap-guangzhou"
            />
          </div>

          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="cos-base-url">访问域名 / Base URL</Label>
            <Input
              id="cos-base-url"
              value={storage.cos_base_url}
              onChange={(e) => setStorage((prev) => ({ ...prev, cos_base_url: e.target.value }))}
              placeholder="https://bucket.cos.ap-guangzhou.myqcloud.com"
            />
          </div>

          <div className="grid gap-2 md:col-span-2">
            <Label htmlFor="cos-image-prefix">COS 图片目录前缀</Label>
            <Input
              id="cos-image-prefix"
              value={storage.cos_image_prefix}
              onChange={(e) => setStorage((prev) => ({ ...prev, cos_image_prefix: e.target.value }))}
              placeholder="image/"
            />
          </div>

          {message && (
            <div className="rounded-md border bg-muted px-3 py-2 text-sm md:col-span-2">
              {message}
            </div>
          )}

          <div className="flex justify-end gap-2 md:col-span-2">
            <Button variant="outline" onClick={handleTestCos} disabled={testing || storage.storage_provider !== 'cos'}>
              <TestTube2 className="mr-2 h-4 w-4" />
              {testing ? '测试中...' : '测试 COS'}
            </Button>
            <Button onClick={handleSaveStorage} disabled={saving}>
              <Save className="mr-2 h-4 w-4" />
              {saving ? '保存中...' : '保存存储设置'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
