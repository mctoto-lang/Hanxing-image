import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Clock, Image as ImageIcon, MessageSquare } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { cn } from '@/lib/utils'

interface ImageTask {
  id: number
  user_id: number
  model_id: number
  prompt: string
  status: 'queued' | 'processing'
  priority: number
  task_type: string
  source: string
  retry_count: number
  created_at: string
  started_at: string | null
  username: string
  model_name: string
  model_key: string
}

interface ChatTask {
  id: number
  user_id: number
  chat_api_id: number
  task_type: string
  original_prompt: string
  status: 'queued' | 'processing'
  retry_count: number
  created_at: string
  started_at: string | null
  username: string
  api_name: string
}

interface ModelStat {
  id: number
  name: string
  display_name: string
  max_concurrent: number
  is_active: number
  active_count: number
  queued_count: number
}

interface ChatApiStat {
  id: number
  name: string
  max_concurrent: number
  status: string
  active_count: number
  queued_count: number
}

interface QueueData {
  image_tasks: ImageTask[]
  chat_tasks: ChatTask[]
  model_stats: ModelStat[]
  chat_api_stats: ChatApiStat[]
  timestamp: string
}

export default function AdminQueue() {
  const [data, setData] = useState<QueueData | null>(null)
  const [loading, setLoading] = useState(false)
  const [now, setNow] = useState(Date.now())

  const fetchQueueStatus = useCallback(async () => {
    if (loading) return
    setLoading(true)
    try {
      const res = await apiFetch('/api/admin/queue/status')
      if (res.ok) {
        const result = await res.json()
        setData(result)
      }
    } catch (error) {
      console.error('获取队列状态失败:', error)
    } finally {
      setLoading(false)
    }
  }, [loading])

  useEffect(() => {
    fetchQueueStatus()
  }, [])

  // 每秒更新时间戳用于实时计算耗时
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const getElapsedSeconds = (createdAt: string) => {
    return Math.floor((now - new Date(createdAt).getTime()) / 1000)
  }

  const handleCancelTask = async (taskId: number, taskType: 'image' | 'chat') => {
    if (!confirm('确定要取消这个任务吗？任务将被标记为失败。')) return
    
    try {
      const endpoint = taskType === 'image' 
        ? `/api/admin/queue/cancel-image/${taskId}`
        : `/api/admin/queue/cancel-chat/${taskId}`
      
      const res = await apiFetch(endpoint, { method: 'POST' })
      if (res.ok) {
        fetchQueueStatus()
      } else {
        const data = await res.json()
        alert(data.error || '取消任务失败')
      }
    } catch (error) {
      console.error('取消任务失败:', error)
      alert('取消任务失败')
    }
  }

  const getTaskTypeLabel = (taskType: string, _source?: string) => {
    const typeMap: Record<string, string> = {
      normal: '常规生图',
      workspace_single: '工作台单图',
      workspace_batch: '工作台批量',
      deepen: '提示词深化',
      extract: '提示词提取',
      refine: '提示词优化',
    }
    return typeMap[taskType] || taskType
  }

  const totalImageQueued = data?.image_tasks.filter(t => t.status === 'queued').length || 0
  const totalImageProcessing = data?.image_tasks.filter(t => t.status === 'processing').length || 0
  const totalChatQueued = data?.chat_tasks.filter(t => t.status === 'queued').length || 0
  const totalChatProcessing = data?.chat_tasks.filter(t => t.status === 'processing').length || 0

  return (
    <div className="flex flex-col gap-6">
      {/* 头部控制区 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">服务队列监控</h1>
          <p className="text-sm text-muted-foreground mt-1">
            实时查看生图和对话任务队列状态
            {data && <span className="ml-2">· 更新于 {new Date(data.timestamp).toLocaleTimeString('zh-CN')}</span>}
          </p>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-blue-100">
                  <ImageIcon className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">生图任务</div>
                  <div className="text-xs text-muted-foreground mt-0.5">排队 {totalImageQueued} · 处理中 {totalImageProcessing}</div>
                </div>
              </div>
              <div className="text-2xl font-bold">{totalImageQueued + totalImageProcessing}</div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-100">
                  <MessageSquare className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">对话任务</div>
                  <div className="text-xs text-muted-foreground mt-0.5">排队 {totalChatQueued} · 处理中 {totalChatProcessing}</div>
                </div>
              </div>
              <div className="text-2xl font-bold">{totalChatQueued + totalChatProcessing}</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 模型并发状态 */}
      {data && data.model_stats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">生图模型并发状态</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.model_stats.map(model => {
                const usage = model.active_count / model.max_concurrent
                const isFull = model.active_count >= model.max_concurrent
                return (
                  <div key={model.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{model.display_name || model.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        排队 {model.queued_count} · 并发 {model.active_count}/{model.max_concurrent}
                      </div>
                    </div>
                    <Badge variant={isFull ? 'destructive' : usage > 0.7 ? 'default' : 'secondary'} className="ml-2">
                      {isFull ? '满载' : usage > 0.7 ? '繁忙' : '空闲'}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 对话API并发状态 */}
      {data && data.chat_api_stats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">对话API并发状态</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.chat_api_stats.map(api => {
                const usage = api.active_count / api.max_concurrent
                const isFull = api.active_count >= api.max_concurrent
                return (
                  <div key={api.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm truncate">{api.name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        排队 {api.queued_count} · 并发 {api.active_count}/{api.max_concurrent}
                      </div>
                    </div>
                    <Badge variant={isFull ? 'destructive' : usage > 0.7 ? 'default' : 'secondary'} className="ml-2">
                      {isFull ? '满载' : usage > 0.7 ? '繁忙' : '空闲'}
                    </Badge>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 生图任务队列 */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <ImageIcon className="h-5 w-5" />
          生图任务队列 ({data?.image_tasks?.length || 0})
        </h2>
      </div>

      {!data || data.image_tasks.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 border rounded-xl">
          {loading ? '加载中...' : '暂无任务'}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground w-16">序号</th>
                <th className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground w-24">状态</th>
                <th className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground w-32">类型</th>
                <th className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground">提示词</th>
                <th className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground w-32">模型</th>
                <th className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground w-24">优先级</th>
                <th className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground w-24">耗时</th>
                <th className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground w-24">用户</th>
                <th className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground w-20">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.image_tasks.map((task, index) => {
                const elapsed = getElapsedSeconds(task.created_at)
                return (
                  <tr key={task.id} className={cn('border-t', index % 2 === 0 ? 'bg-background' : 'bg-muted/20')}>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{index + 1}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant={task.status === 'processing' ? 'default' : 'secondary'} className="text-[10px]">
                        {task.status === 'processing' ? '处理中' : '排队中'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className="text-[10px]">
                        {getTaskTypeLabel(task.task_type, task.source)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 max-w-[300px]">
                      <div className="truncate text-xs" title={task.prompt}>
                        {task.prompt}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs truncate">{task.model_name}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant={task.priority > 0 ? 'default' : 'outline'} className="text-[10px]">
                        {task.priority}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {elapsed}s
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{task.username}</td>
                    <td className="px-3 py-2.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelTask(task.id, 'image')}
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive rounded-lg"
                      >
                        取消
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 对话任务队列 */}
      <div className="flex items-center gap-3 mt-8">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          对话任务队列 ({data?.chat_tasks?.length || 0})
        </h2>
      </div>

      {!data || data.chat_tasks.length === 0 ? (
        <div className="text-center text-muted-foreground py-12 border rounded-xl">
          {loading ? '加载中...' : '暂无任务'}
        </div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground w-16">序号</th>
                <th className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground w-24">状态</th>
                <th className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground w-32">类型</th>
                <th className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground">提示词</th>
                <th className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground w-32">API</th>
                <th className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground w-24">耗时</th>
                <th className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground w-24">用户</th>
                <th className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground w-20">操作</th>
              </tr>
            </thead>
            <tbody>
              {data.chat_tasks.map((task, index) => {
                const elapsed = getElapsedSeconds(task.created_at)
                return (
                  <tr key={task.id} className={cn('border-t', index % 2 === 0 ? 'bg-background' : 'bg-muted/20')}>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{index + 1}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant={task.status === 'processing' ? 'default' : 'secondary'} className="text-[10px]">
                        {task.status === 'processing' ? '处理中' : '排队中'}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant="outline" className="text-[10px]">
                        {getTaskTypeLabel(task.task_type)}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 max-w-[300px]">
                      <div className="truncate text-xs" title={task.original_prompt}>
                        {task.original_prompt}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs truncate">{task.api_name}</td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {elapsed}s
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{task.username}</td>
                    <td className="px-3 py-2.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCancelTask(task.id, 'chat')}
                        className="h-7 px-2 text-xs text-destructive hover:text-destructive rounded-lg"
                      >
                        取消
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
