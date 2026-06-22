import { useState, useEffect, useCallback, useRef } from 'react'
import { apiFetch } from '@/lib/api'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Users, Image, CheckCircle, XCircle, Activity, Clock, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts'

interface DashboardData {
  totalUsers: number
  totalTasks: number
  todayTasks: number
  queuedTasks: number
}

interface TrendData {
  trend: { date: string; count: number }[]
}

interface ModelTask {
  status: string
  created_at: string
  completed_at: string | null
  username: string
}

interface ModelStatus {
  id: number
  name: string
  display_name: string
  icon_url: string | null
  is_active: boolean
  status: 'normal' | 'queued' | 'error'
  recentTasks: ModelTask[]
}

interface ModelsStatusData {
  models: ModelStatus[]
}

const stats = [
  {
    key: 'totalUsers' as const,
    label: '用户总数',
    icon: Users,
    color: 'text-blue-500',
    bg: 'bg-blue-500/10',
  },
  {
    key: 'todayTasks' as const,
    label: '今日生图任务',
    icon: Image,
    color: 'text-purple-500',
    bg: 'bg-purple-500/10',
  },
  {
    key: 'totalTasks' as const,
    label: '总任务数',
    icon: CheckCircle,
    color: 'text-green-500',
    bg: 'bg-green-500/10',
  },
  {
    key: 'queuedTasks' as const,
    label: '排队中任务',
    icon: XCircle,
    color: 'text-orange-500',
    bg: 'bg-orange-500/10',
  },
]

const statusConfig = {
  normal: { label: '正常', color: 'text-green-500', bg: 'bg-green-500/10', icon: CheckCircle2 },
  queued: { label: '排队', color: 'text-yellow-500', bg: 'bg-yellow-500/10', icon: Clock },
  error: { label: '异常', color: 'text-red-500', bg: 'bg-red-500/10', icon: AlertTriangle },
}

const barColorMap: Record<string, string> = {
  completed: 'bg-green-500',
  processing: 'bg-yellow-500',
  queued: 'bg-yellow-500',
  failed: 'bg-red-500',
}

const statusLabelMap: Record<string, string> = {
  completed: '生成成功',
  processing: '正在生成',
  queued: '排队中',
  failed: '生成失败',
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainSeconds = seconds % 60
  return `${minutes}m${remainSeconds}s`
}

function formatTime(iso: string | null): string {
  if (!iso) return '-'
  const d = new Date(iso + (iso.includes('Z') || iso.includes('+') ? '' : 'Z'))
  if (isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function BarTooltip({ task, visible, position }: { task: ModelTask | null; visible: boolean; position: { x: number; y: number } }) {
  if (!task || !visible) return null
  return (
    <div
      className="fixed z-50 rounded-lg border bg-card px-3 py-2 text-xs shadow-lg"
      style={{ left: position.x, top: position.y - 8, transform: 'translate(-50%, -100%)' }}
    >
      <div className="flex flex-col gap-1">
        <div>
          <span className="text-muted-foreground">状态: </span>
          <span className="font-medium">{statusLabelMap[task.status] || task.status}</span>
        </div>
        <div>
          <span className="text-muted-foreground">时间: </span>
          <span className="font-medium">{formatTime(task.created_at)}</span>
        </div>
        <div>
          <span className="text-muted-foreground">用户: </span>
          <span className="font-medium">{task.username}</span>
        </div>
        <div>
          <span className="text-muted-foreground">响应耗时: </span>
          <span className="font-medium">
            {task.status === 'completed' && task.completed_at && task.created_at
              ? formatDuration(
                  new Date(task.completed_at).getTime() -
                    new Date(task.created_at).getTime()
                )
              : '-'}
          </span>
        </div>
      </div>
    </div>
  )
}

function TaskBar({ task }: { task: ModelTask | null }) {
  const [hovered, setHovered] = useState(false)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const ref = useRef<HTMLDivElement>(null)

  const handleMouseEnter = (_e: React.MouseEvent) => {
    if (!task) return
    const rect = ref.current?.getBoundingClientRect()
    if (rect) {
      setPos({ x: rect.left + rect.width / 2, y: rect.top })
    }
    setHovered(true)
  }

  return (
    <>
      <div
        ref={ref}
        className={cn(
          'flex-1 min-w-[4px] rounded-sm transition-colors',
          task ? barColorMap[task.status] || 'bg-muted' : 'bg-muted',
          task ? 'cursor-pointer' : 'cursor-default'
        )}
        style={{ height: '100%' }}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={() => setHovered(false)}
      />
      <BarTooltip task={task} visible={hovered} position={pos} />
    </>
  )
}

export default function AdminDashboard() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [trendData, setTrendData] = useState<TrendData | null>(null)
  const [modelsData, setModelsData] = useState<ModelsStatusData | null>(null)
  const [trendDays, setTrendDays] = useState<7 | 15 | 30>(7)

  const fetchDashboard = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/dashboard')
      if (!res.ok) return
      const d = await res.json()
      if (d && typeof d.totalUsers === 'number') {
        setData(d)
      }
    } catch {}
  }, [])

  const fetchTrend = useCallback(async (days: number) => {
    try {
      const res = await apiFetch(`/api/admin/dashboard/trend?days=${days}`)
      if (!res.ok) return
      const d = await res.json()
      setTrendData(d)
    } catch {}
  }, [])

  const fetchModelsStatus = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/dashboard/models-status')
      if (!res.ok) return
      const d = await res.json()
      setModelsData(d)
    } catch {}
  }, [])

  useEffect(() => {
    fetchDashboard()
  }, [fetchDashboard])

  useEffect(() => {
    fetchTrend(trendDays)
  }, [fetchTrend, trendDays])

  useEffect(() => {
    fetchModelsStatus()
  }, [fetchModelsStatus])

  if (!data) return <p className="text-muted-foreground">加载中...</p>

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">管理概览</h1>

      {/* 指标卡片 */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map(({ key, label, icon: Icon, color, bg }) => (
          <Card key={key}>
            <CardContent className="flex items-center gap-4 p-6">
              <div
                className={cn(
                  'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
                  bg,
                  color
                )}
              >
                <Icon className="h-6 w-6" />
              </div>
              <div className="flex flex-col">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="text-3xl font-bold tracking-tight">{data[key] ?? 0}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 生图数量走势图 */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-5 w-5 text-muted-foreground" />
              <h2 className="text-lg font-semibold">生图数量走势</h2>
            </div>
            <div className="flex gap-1 rounded-lg bg-muted p-1">
              {([7, 15, 30] as const).map((d) => (
                <Button
                  key={d}
                  variant="ghost"
                  size="sm"
                  onClick={() => setTrendDays(d)}
                  className={cn(
                    trendDays === d
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground'
                  )}
                >
                  {d}天
                </Button>
              ))}
            </div>
          </div>
          {trendData ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trendData.trend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(v: string) => v.slice(5)}
                  tick={{ fontSize: 12 }}
                />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <RechartsTooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    fontSize: '13px',
                  }}
                  labelFormatter={(label) => `日期: ${label}`}
                  formatter={(value) => [`${value} 次`, '生图数量']}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[280px] items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* 模型/API 状态卡片 */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Activity className="h-5 w-5 text-muted-foreground" />
          <h2 className="text-lg font-semibold">模型/API 队列状态</h2>
        </div>
        {modelsData ? (
          <div className="grid grid-cols-1 gap-4">
            {modelsData.models.map((model) => {
              const cfg = statusConfig[model.status]
              const StatusIcon = cfg.icon
              const tasks = model.recentTasks
              const bars: (ModelTask | null)[] = [
                ...Array(Math.max(0, 24 - tasks.length)).fill(null),
                ...tasks,
              ]

              return (
                <Card key={model.id}>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-6">
                      {/* 左侧状态 */}
                      <div className="flex flex-col items-center gap-1.5 shrink-0 w-16">
                        <div className={cn('flex h-10 w-10 items-center justify-center rounded-xl', cfg.bg)}>
                          <StatusIcon className={cn('h-5 w-5', cfg.color)} />
                        </div>
                        <span className={cn('text-xs font-medium', cfg.color)}>{cfg.label}</span>
                      </div>

                      {/* 右侧模型信息 + 竖柱 */}
                      <div className="flex flex-col gap-2 flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          {model.icon_url && (
                            <img src={model.icon_url} alt="" className="h-5 w-5 rounded" />
                          )}
                          <span className="font-medium text-sm truncate">
                            {model.display_name || model.name}
                          </span>
                          {!model.is_active && (
                            <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                              已禁用
                            </span>
                          )}
                        </div>
                        <div className="flex items-end gap-1 h-10">
                          {bars.map((task, i) => (
                            <TaskBar key={i} task={task} />
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        ) : (
          <div className="flex h-24 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    </div>
  )
}
