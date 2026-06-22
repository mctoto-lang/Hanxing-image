import { useState, useEffect, useCallback, useMemo } from 'react'
import { apiFetch } from '@/lib/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { toImageSrc } from '@/lib/utils'
import { DataTable, type ColumnDef } from '@/components/ui/data-table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { ArrowUpDown, FileText, LogIn, MessageSquare, Eye, CircleAlert, Copy, Check, Trash2 } from 'lucide-react'

type LogType = 'tasks' | 'chat' | 'login'

interface TaskLog {
  id: number
  username: string
  prompt: string
  model_name: string
  status: string
  credits_charged: number
  credits_type: string
  source: string
  task_type: string
  retry_count: number
  error_message: string | null
  retry_errors: string[]
  image_size: string
  image_count: number
  result_images: string[]
  created_at: string
  started_at: string | null
  completed_at: string | null
  api_call_logs?: ApiCallLog[]
}

interface ApiCallLog {
  id: number
  task_id: number
  call_index: number
  status: string
  error_message: string | null
  request_params: string | null
  response_summary: string | null
  elapsed_ms: number | null
  created_at: string
}

interface LoginLog {
  id: number
  username: string
  ip_address: string
  user_agent: string
  login_at: string
}

interface ChatLog {
  id: number
  user_id: number | null
  username: string | null
  api_type: string
  api_config_name: string | null
  workspace_task_id: number | null
  card_id: number | null
  request_params: string | object | null
  response_status: string
  response_body: string | object | null
  duration_ms: number | null
  retry_count: number
  error_message: string | null
  created_at: string
}

interface ParsedError {
  errorType: string
  coreMessage: string
  rawResponse: string
  elapsed: string
  timestamp: string
  retryInfo: string
}

function parseErrorMessage(errorMessage: string): ParsedError {
  let errorType = '请求失败'
  let coreMessage = errorMessage
  let rawResponse = ''
  let elapsed = ''
  let timestamp = ''
  let retryInfo = ''

  const typeMatch = errorMessage.match(/^\[(请求超时|请求失败)\]/)
  if (typeMatch) {
    errorType = typeMatch[1]
    coreMessage = errorMessage.slice(typeMatch[0].length).trim()
  }

  const rawPrefix = '原始响应: '
  const rawIdx = coreMessage.indexOf(rawPrefix)
  if (rawIdx >= 0) {
    rawResponse = coreMessage.slice(rawIdx + rawPrefix.length)
    coreMessage = coreMessage.slice(0, rawIdx).trimEnd().replace(/ \|$/, '')
  }

  const elapsedMatch = coreMessage.match(/耗时: ([\d.]+)秒/)
  if (elapsedMatch) {
    elapsed = elapsedMatch[1] + '秒'
    coreMessage = coreMessage.replace(/ \| 耗时: [\d.]+秒/, '').trim()
  }

  const timeMatch = coreMessage.match(/时间: (.+?)(?:\s*\||$)/)
  if (timeMatch) {
    timestamp = timeMatch[1].trim()
    coreMessage = coreMessage.replace(/ \| 时间: .+?$/, '').trim()
  }

  const retryMatch = coreMessage.match(/已重试(\d+)次均失败/)
  if (retryMatch) {
    retryInfo = retryMatch[0]
    coreMessage = coreMessage.replace(/ \| 已重试\d+次均失败/, '').trim()
  }

  return { errorType, coreMessage, rawResponse, elapsed, timestamp, retryInfo }
}

function ErrorDialog({ open, onOpenChange, errorMessage }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  errorMessage: string
}) {
  const [copied, setCopied] = useState(false)
  const parsed = parseErrorMessage(errorMessage)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(errorMessage)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {}
  }

  const isTimeout = parsed.errorType === '请求超时'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <CircleAlert className="h-5 w-5" />
            错误详情
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Badge variant={isTimeout ? 'secondary' : 'destructive'} className={isTimeout ? 'bg-orange-500 hover:bg-orange-600' : ''}>
              {parsed.errorType}
            </Badge>
            {parsed.retryInfo && (
              <Badge variant="outline" className="text-muted-foreground">
                {parsed.retryInfo}
              </Badge>
            )}
          </div>

          <div className="rounded-lg bg-muted p-4">
            <p className="text-xs text-muted-foreground mb-1.5 font-medium">错误信息</p>
            <p className="text-sm font-mono break-all leading-relaxed">{parsed.coreMessage}</p>
          </div>

          {(parsed.elapsed || parsed.timestamp) && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              {parsed.elapsed && <span>耗时: {parsed.elapsed}</span>}
              {parsed.timestamp && <span>时间: {parsed.timestamp}</span>}
            </div>
          )}

          {parsed.rawResponse && (
            <div className="rounded-lg bg-muted p-4">
              <p className="text-xs text-muted-foreground mb-1.5 font-medium">API 原始响应</p>
              <pre className="text-xs font-mono break-all leading-relaxed whitespace-pre-wrap max-h-60 overflow-y-auto">{parsed.rawResponse}</pre>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCopy}>
            {copied ? <Check className="mr-2 h-4 w-4" /> : <Copy className="mr-2 h-4 w-4" />}
            {copied ? '已复制' : '复制完整错误信息'}
          </Button>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            关闭
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default function AdminLogs() {
  const [logType, setLogType] = useState<LogType>('tasks')
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([])
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([])
  const [chatLogs, setChatLogs] = useState<ChatLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [selectedTask, setSelectedTask] = useState<TaskLog | null>(null)
  const [selectedChatLog, setSelectedChatLog] = useState<ChatLog | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [chatSheetOpen, setChatSheetOpen] = useState(false)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorDialogContent, setErrorDialogContent] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingTask, setDeletingTask] = useState<TaskLog | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)
  const pageSize = 15

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    try {
      const endpoint = logType === 'login' ? 'login' : logType === 'chat' ? 'chat' : 'tasks'
      const params = new URLSearchParams({ page: String(pageIndex + 1), limit: String(pageSize) })
      const res = await apiFetch(`/api/admin/logs/${endpoint}?${params}`)
      const data = await res.json()
      if (logType === 'login') setLoginLogs(data.logs || [])
      else if (logType === 'chat') setChatLogs(data.logs || [])
      else setTaskLogs(data.tasks || [])
      setTotal(data.total || 0)
    } catch {
    } finally {
      setLoading(false)
    }
  }, [logType, pageIndex])

  const handleLogTypeChange = (value: LogType | null) => {
    if (!value) return
    setLogType(value as LogType)
    setPageIndex(0)
  }

  useEffect(() => {
    fetchLogs()
  }, [fetchLogs])

  const getStatusBadge = (status: string, retryCount: number) => {
    switch (status) {
      case 'completed':
        return <Badge variant="default">已完成</Badge>
      case 'processing':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">生成中</Badge>
      case 'queued':
        return retryCount > 0
          ? <Badge className="bg-orange-500 hover:bg-orange-600">重试中({retryCount}/3)</Badge>
          : <Badge className="bg-blue-500 hover:bg-blue-600">排队中</Badge>
      case 'failed':
        return <Badge variant="destructive">失败</Badge>
      default:
        return <Badge variant="secondary">{status}</Badge>
    }
  }

  const getSourceBadge = (task: Pick<TaskLog, 'source' | 'task_type'>) => {
    if (task.task_type === 'workspace_batch' || task.task_type === 'workspace_single' || task.source === 'workspace') {
      return <Badge className="bg-purple-500 hover:bg-purple-600">批量生图</Badge>
    }
    if (task.source === 'project') {
      return <Badge variant="default">工作项目</Badge>
    }
    return <Badge variant="secondary">自由创作</Badge>
  }

  const openTaskDetail = async (task: TaskLog) => {
    setSelectedTask(task)
    setSheetOpen(true)
    // 获取完整任务详情（含 api_call_logs）
    try {
      const res = await apiFetch(`/api/admin/logs/tasks/${task.id}`)
      if (res.ok) {
        const data = await res.json()
        if (data.task?.api_call_logs) {
          setSelectedTask({ ...task, api_call_logs: data.task.api_call_logs })
        }
      }
    } catch {}
  }

  const openErrorDialog = (errorMsg: string) => {
    setErrorDialogContent(errorMsg || '未知错误')
    setErrorDialogOpen(true)
  }

  const openDeleteDialog = (task: TaskLog) => {
    setDeletingTask(task)
    setDeleteDialogOpen(true)
  }

  const handleDelete = async () => {
    if (!deletingTask) return
    setDeleting(true)
    try {
      const res = await apiFetch(`/api/admin/logs/tasks/${deletingTask.id}`, {
        method: 'DELETE',
      })
      if (res.ok) {
        setTaskLogs((prev) => prev.filter((log) => log.id !== deletingTask.id))
        setTotal((prev) => Math.max(prev - 1, 0))
        setDeleteDialogOpen(false)
        setDeletingTask(null)
      }
    } catch {} finally {
      setDeleting(false)
    }
  }

  const getSelectedTaskLoginLog = () => {
    if (!selectedTask) return null
    return loginLogs.find((log) => log.username === selectedTask.username) || null
  }

  const toolbar = (
    <Select value={logType} onValueChange={handleLogTypeChange}>
      <SelectTrigger className="w-36 h-8 text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="tasks">
          <span className="flex items-center gap-2"><FileText className="h-3.5 w-3.5" />生图日志</span>
        </SelectItem>
        <SelectItem value="chat">
          <span className="flex items-center gap-2"><MessageSquare className="h-3.5 w-3.5" />对话日志</span>
        </SelectItem>
        <SelectItem value="login">
          <span className="flex items-center gap-2"><LogIn className="h-3.5 w-3.5" />登录日志</span>
        </SelectItem>
      </SelectContent>
    </Select>
  )

  const taskColumns: ColumnDef<TaskLog, unknown>[] = useMemo(() => [
    {
      accessorKey: 'username',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          用户
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    {
      accessorKey: 'status',
      header: '状态',
      cell: ({ row }) => getStatusBadge(row.original.status, row.original.retry_count || 0),
    },
    {
      accessorKey: 'retry_count',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          重试次数
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    {
      accessorKey: 'credits_charged',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          积分
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    {
      accessorKey: 'source',
      header: '类型',
      cell: ({ row }) => getSourceBadge(row.original),
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          时间
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => new Date(row.original.created_at).toLocaleString('zh-CN'),
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openTaskDetail(row.original)}
            className="h-8 px-2"
          >
            <Eye className="h-3.5 w-3.5 mr-1" />
            详情
          </Button>
          {row.original.status === 'failed' && row.original.error_message && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openErrorDialog(row.original.error_message!)}
              className="h-8 px-2 text-destructive hover:text-destructive"
            >
              <CircleAlert className="h-3.5 w-3.5 mr-1" />
              错误
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => openDeleteDialog(row.original)}
            className="h-8 px-2 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ], [])

  const chatColumns: ColumnDef<ChatLog, unknown>[] = useMemo(() => [
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
          时间
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => new Date(row.original.created_at).toLocaleString('zh-CN'),
    },
    {
      accessorKey: 'username',
      header: '用户',
      cell: ({ row }) => row.original.username || '-',
    },
    {
      accessorKey: 'api_type',
      header: '类型',
      cell: ({ row }) => <Badge variant="secondary">{row.original.api_type === 'chat' ? '对话' : row.original.api_type}</Badge>,
    },
    {
      accessorKey: 'api_config_name',
      header: '接口',
      cell: ({ row }) => row.original.api_config_name || '-',
    },
    {
      accessorKey: 'response_status',
      header: '状态',
      cell: ({ row }) => (
        <Badge variant={row.original.response_status === 'success' ? 'default' : 'destructive'}>
          {row.original.response_status === 'success' ? '成功' : '失败'}
        </Badge>
      ),
    },
    {
      accessorKey: 'duration_ms',
      header: '耗时',
      cell: ({ row }) => row.original.duration_ms != null ? `${row.original.duration_ms}ms` : '-',
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => (
        <Button variant="ghost" size="sm" onClick={() => {
          setSelectedChatLog(row.original)
          setChatSheetOpen(true)
        }} className="h-8 px-2">
          <Eye className="h-3.5 w-3.5 mr-1" />
          详情
        </Button>
      ),
    },
  ], [])

  const loginColumns: ColumnDef<LoginLog, unknown>[] = useMemo(() => [
    {
      accessorKey: 'username',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          用户
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    {
      accessorKey: 'ip_address',
      header: 'IP 地址',
    },
    {
      accessorKey: 'login_at',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          登录时间
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => new Date(row.original.login_at).toLocaleString('zh-CN'),
    },
  ], [])

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">日志查看</CardTitle>
        </CardHeader>
        <CardContent>
          {logType === 'tasks' && (
            <DataTable
              columns={taskColumns}
              data={taskLogs}
              searchPlaceholder="搜索用户名..."
              searchColumn="username"
              showColumnToggle={false}
              pageSize={pageSize}
              pageIndex={pageIndex}
              onPageChange={setPageIndex}
              toolbar={toolbar}
              manualPagination
              pageCount={Math.max(Math.ceil(total / pageSize), 1)}
              totalCount={total}
            />
          )}
          {logType === 'chat' && (
            <DataTable
              columns={chatColumns}
              data={chatLogs}
              searchPlaceholder="搜索用户名..."
              searchColumn="username"
              showColumnToggle={false}
              pageSize={pageSize}
              pageIndex={pageIndex}
              onPageChange={setPageIndex}
              toolbar={toolbar}
              manualPagination
              pageCount={Math.max(Math.ceil(total / pageSize), 1)}
              totalCount={total}
            />
          )}
          {logType === 'login' && (
            <DataTable
              columns={loginColumns}
              data={loginLogs}
              searchPlaceholder="搜索用户名..."
              searchColumn="username"
              showColumnToggle={false}
              pageSize={pageSize}
              pageIndex={pageIndex}
              onPageChange={setPageIndex}
              toolbar={toolbar}
              manualPagination
              pageCount={Math.max(Math.ceil(total / pageSize), 1)}
              totalCount={total}
            />
          )}
          {loading && <p className="mt-2 text-xs text-muted-foreground">正在刷新日志...</p>}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader className="px-1 pb-4 border-b border-border text-left">
            <div className="flex items-start gap-3 pr-10">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <FileText className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <SheetTitle className="text-xl font-semibold tracking-tight">任务详情</SheetTitle>
                <SheetDescription className="leading-6">
                  查看本次生图任务的基础信息、执行状态和 API 调用记录
                </SheetDescription>
              </div>
            </div>
            {selectedTask && (
              <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">任务 ID</p>
                    <p className="mt-1 truncate font-mono text-sm text-foreground">{selectedTask.id}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    {getSourceBadge(selectedTask)}
                    {getStatusBadge(selectedTask.status, selectedTask.retry_count || 0)}
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <div className="min-w-0">
                    <span className="block font-medium text-foreground">{selectedTask.username}</span>
                    <span>提交用户</span>
                  </div>
                  <div className="min-w-0 text-right">
                    <span className="block font-medium text-foreground">{new Date(selectedTask.created_at).toLocaleString('zh-CN')}</span>
                    <span>创建时间</span>
                  </div>
                </div>
              </div>
            )}
          </SheetHeader>
          {selectedTask && (
            <div className="mt-5 space-y-6 px-1">
              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">任务ID</Label>
                <p className="text-sm text-muted-foreground pl-1">{selectedTask.id}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">用户</Label>
                <p className="text-sm text-muted-foreground pl-1">{selectedTask.username}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">提示词</Label>
                <p className="text-sm text-muted-foreground break-all pl-1 bg-muted/50 rounded-md p-3">{selectedTask.prompt}</p>
              </div>

              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">模型</Label>
                <p className="text-sm text-muted-foreground pl-1">{selectedTask.model_name}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">图片尺寸</Label>
                  <p className="text-sm text-muted-foreground pl-1">{selectedTask.image_size}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">图片数量</Label>
                  <p className="text-sm text-muted-foreground pl-1">{selectedTask.image_count}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">状态</Label>
                  <div className="pl-1">{getStatusBadge(selectedTask.status, selectedTask.retry_count || 0)}</div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">类型</Label>
                  <div className="pl-1">{getSourceBadge(selectedTask)}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">积分消耗</Label>
                  <p className="text-sm text-muted-foreground pl-1">
                    {selectedTask.credits_charged} {selectedTask.credits_type === 'project' ? '项目积分' : '创作积分'}
                  </p>
                </div>
                {(selectedTask.retry_count ?? 0) > 0 && (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">重试次数</Label>
                    <p className="text-sm text-muted-foreground pl-1">{selectedTask.retry_count}</p>
                  </div>
                )}
              </div>

              {/* API 调用记录 */}
              {(() => {
                const callLogs = selectedTask.api_call_logs
                if (!callLogs || callLogs.length === 0) {
                  // 兼容旧数据：使用 retry_errors 展示
                  const retryErrors: string[] = Array.isArray(selectedTask.retry_errors) ? selectedTask.retry_errors : []
                  if (retryErrors.length === 0 && !selectedTask.error_message) return null
                  return (
                    <div className="space-y-2">
                      <Label className="text-sm font-medium text-foreground">错误信息</Label>
                      <div className="space-y-2">
                        {retryErrors.map((err, idx) => {
                          const parsed = parseErrorMessage(err)
                          const isTimeout = parsed.errorType === '请求超时'
                          return (
                            <div key={idx} className="rounded-lg border border-destructive/20 overflow-hidden">
                              <div className="px-3 py-1.5 bg-destructive/5 border-b border-destructive/10 flex items-center gap-2">
                                <Badge variant={isTimeout ? 'secondary' : 'destructive'} className={isTimeout ? 'bg-orange-500 hover:bg-orange-600 text-[10px] px-1.5 py-0' : 'text-[10px] px-1.5 py-0'}>
                                  {parsed.errorType}
                                </Badge>
                                <span className="text-[10px] text-muted-foreground font-medium">
                                  {retryErrors.length > 1 ? `第${idx + 1}次` : '错误信息'}
                                </span>
                              </div>
                              <div className="p-3 bg-destructive/10 space-y-1.5">
                                <p className="text-xs font-mono break-all text-destructive">{parsed.coreMessage}</p>
                                {(parsed.elapsed || parsed.timestamp) && (
                                  <div className="flex gap-3 text-[10px] text-muted-foreground pt-1 border-t border-destructive/10">
                                    {parsed.elapsed && <span>耗时: {parsed.elapsed}</span>}
                                    {parsed.timestamp && <span>时间: {parsed.timestamp}</span>}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                }

                // 使用 api_call_logs 展示
                return (
                  <div className="space-y-2">
                    <Label className="text-sm font-medium text-foreground">
                      API 调用记录
                      <span className="text-muted-foreground font-normal ml-1.5">({callLogs.length}次)</span>
                    </Label>
                    <div className="space-y-2">
                      {callLogs.map((log) => {
                        const isSuccess = log.status === 'success'
                        const isPending = log.status === 'pending'
                        let requestParams: any = null
                        try { requestParams = log.request_params ? JSON.parse(log.request_params) : null } catch {}

                        return (
                          <div key={log.id} className={`rounded-lg border overflow-hidden ${isSuccess ? 'border-green-200' : isPending ? 'border-yellow-200' : 'border-destructive/20'}`}>
                            <div className={`px-3 py-1.5 border-b flex items-center gap-2 ${isSuccess ? 'bg-green-50 border-green-200' : isPending ? 'bg-yellow-50 border-yellow-200' : 'bg-destructive/5 border-destructive/10'}`}>
                              <Badge className={`text-[10px] px-1.5 py-0 ${isSuccess ? 'bg-green-500 hover:bg-green-600' : isPending ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-red-500 hover:bg-red-600'}`}>
                                {isSuccess ? '成功' : isPending ? '等待中' : '失败'}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground font-medium">
                                第{log.call_index}次调用
                              </span>
                              {log.elapsed_ms != null && (
                                <span className="text-[10px] text-muted-foreground ml-auto">
                                  耗时: {(log.elapsed_ms / 1000).toFixed(1)}秒
                                </span>
                              )}
                            </div>
                            <div className={`p-3 space-y-1.5 ${isSuccess ? 'bg-green-50/50' : isPending ? 'bg-yellow-50/50' : 'bg-destructive/10'}`}>
                              {requestParams && (
                                <div className="flex gap-2 text-[10px] text-muted-foreground flex-wrap">
                                  {requestParams.model && <span>模型: {requestParams.model}</span>}
                                  {requestParams.format && <span>格式: {requestParams.format}</span>}
                                  {requestParams.size && <span>尺寸: {requestParams.size}</span>}
                                </div>
                              )}
                              {isSuccess && log.response_summary && (() => {
                                try {
                                  const summary = JSON.parse(log.response_summary)
                                  return <p className="text-xs text-green-700">生成 {summary.imageCount} 张图片</p>
                                } catch { return null }
                              })()}
                              {log.error_message && (
                                <p className="text-xs font-mono break-all text-destructive">{log.error_message}</p>
                              )}
                              <div className="text-[10px] text-muted-foreground pt-1 border-t border-current/10">
                                {new Date(log.created_at).toLocaleString('zh-CN')}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">时间信息</Label>
                <div className="space-y-1 text-sm text-muted-foreground pl-1">
                  <p>创建时间: {new Date(selectedTask.created_at).toLocaleString('zh-CN')}</p>
                  {selectedTask.started_at && (
                    <p>开始时间: {new Date(selectedTask.started_at).toLocaleString('zh-CN')}</p>
                  )}
                  {selectedTask.completed_at && (
                    <p>完成时间: {new Date(selectedTask.completed_at).toLocaleString('zh-CN')}</p>
                  )}
                </div>
              </div>

              {selectedTask.result_images && selectedTask.result_images.length > 0 && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">生成结果</Label>
                  <div className="grid grid-cols-2 gap-2 pl-1">
                    {selectedTask.result_images.map((img, idx) => (
                      <div key={idx} className="aspect-square rounded-lg overflow-hidden bg-muted">
                        <img src={toImageSrc(img, { width: 200, height: 200 })} alt="" className="w-full h-full object-cover" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {getSelectedTaskLoginLog() && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">最近登录信息</Label>
                  <div className="p-3 bg-muted rounded-lg space-y-1 text-sm pl-1">
                    <p>IP 地址: {getSelectedTaskLoginLog()?.ip_address || '未知'}</p>
                    <p>登录时间: {getSelectedTaskLoginLog()?.login_at ? new Date(getSelectedTaskLoginLog()!.login_at).toLocaleString('zh-CN') : '未知'}</p>
                  </div>
                </div>
              )}
            </div>
          )}
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setSheetOpen(false)}>
              关闭
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <ErrorDialog
        open={errorDialogOpen}
        onOpenChange={setErrorDialogOpen}
        errorMessage={errorDialogContent}
      />

      <Sheet open={chatSheetOpen} onOpenChange={(open) => {
        setChatSheetOpen(open)
        if (!open) setSelectedChatLog(null)
      }}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader className="px-1 pb-4 border-b border-border text-left">
            <div className="flex items-start gap-3 pr-10">
              <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <MessageSquare className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <SheetTitle className="text-xl font-semibold tracking-tight">对话日志详情</SheetTitle>
                <SheetDescription className="leading-6">
                  查看本次对话请求的详细信息和响应内容
                </SheetDescription>
              </div>
            </div>
            {selectedChatLog && (
              <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-muted-foreground">日志 ID</p>
                    <p className="mt-1 truncate font-mono text-sm text-foreground">{selectedChatLog.id}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Badge variant="secondary">{selectedChatLog.api_type === 'chat' ? '对话' : selectedChatLog.api_type}</Badge>
                    <Badge variant={selectedChatLog.response_status === 'success' ? 'default' : 'destructive'}>
                      {selectedChatLog.response_status === 'success' ? '成功' : '失败'}
                    </Badge>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                  <div className="min-w-0">
                    <span className="block font-medium text-foreground">{selectedChatLog.username || '-'}</span>
                    <span>提交用户</span>
                  </div>
                  <div className="min-w-0 text-right">
                    <span className="block font-medium text-foreground">{new Date(selectedChatLog.created_at).toLocaleString('zh-CN')}</span>
                    <span>请求时间</span>
                  </div>
                </div>
              </div>
            )}
          </SheetHeader>
          {selectedChatLog && (
            <div className="mt-5 space-y-6 px-1">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">接口</Label>
                  <p className="text-sm text-muted-foreground pl-1">{selectedChatLog.api_config_name || '-'}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">耗时</Label>
                  <p className="text-sm text-muted-foreground pl-1">{selectedChatLog.duration_ms != null ? `${selectedChatLog.duration_ms}ms` : '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">任务ID</Label>
                  <p className="text-sm text-muted-foreground pl-1">{selectedChatLog.workspace_task_id || '-'}</p>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">卡片ID</Label>
                  <p className="text-sm text-muted-foreground pl-1">{selectedChatLog.card_id || '-'}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">状态</Label>
                  <div className="pl-1">
                    <Badge variant={selectedChatLog.response_status === 'success' ? 'default' : 'destructive'}>
                      {selectedChatLog.response_status === 'success' ? '成功' : '失败'}
                    </Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">重试次数</Label>
                  <p className="text-sm text-muted-foreground pl-1">{selectedChatLog.retry_count}</p>
                </div>
              </div>

              {selectedChatLog.error_message && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">错误信息</Label>
                  <div className="rounded-lg border border-destructive/20 overflow-hidden">
                    <div className="px-3 py-1.5 bg-destructive/5 border-b border-destructive/10 flex items-center gap-2">
                      <Badge variant="destructive" className="text-[10px] px-1.5 py-0">失败</Badge>
                    </div>
                    <div className="p-3 bg-destructive/10">
                      <p className="text-xs font-mono break-all text-destructive">{selectedChatLog.error_message}</p>
                    </div>
                  </div>
                </div>
              )}

              {selectedChatLog.request_params && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">请求参数</Label>
                  <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto max-h-60 font-mono whitespace-pre-wrap break-all">{(() => {
                    const params = selectedChatLog.request_params
                    if (typeof params === 'string') {
                      try { return JSON.stringify(JSON.parse(params), null, 2) } catch { return params }
                    }
                    return JSON.stringify(params, null, 2)
                  })()}</pre>
                </div>
              )}

              {selectedChatLog.response_body && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">响应内容</Label>
                  <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto max-h-60 font-mono whitespace-pre-wrap break-all">{(() => {
                    const body = selectedChatLog.response_body
                    if (typeof body === 'string') {
                      try { return JSON.stringify(JSON.parse(body), null, 2) } catch { return body }
                    }
                    return JSON.stringify(body, null, 2)
                  })()}</pre>
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-sm font-medium text-foreground">时间信息</Label>
                <div className="space-y-1 text-sm text-muted-foreground pl-1">
                  <p>请求时间: {new Date(selectedChatLog.created_at).toLocaleString('zh-CN')}</p>
                </div>
              </div>
            </div>
          )}
          <SheetFooter className="mt-6">
            <Button variant="outline" onClick={() => setChatSheetOpen(false)}>
              关闭
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <Trash2 className="h-5 w-5" />
              确认删除
            </DialogTitle>
          </DialogHeader>
          <div className="py-3">
            <p className="text-sm text-muted-foreground">
              确定要删除这条日志记录吗？此操作不可撤销。
            </p>
            {deletingTask && (
              <div className="mt-3 p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground">任务ID: {deletingTask.id}</p>
                <p className="text-xs text-muted-foreground">用户: {deletingTask.username}</p>
                <div className="mt-1">{getSourceBadge(deletingTask)}</div>
                <p className="text-xs text-muted-foreground">时间: {new Date(deletingTask.created_at).toLocaleString('zh-CN')}</p>
              </div>
            )}
            {deletingTask && (deletingTask.source === 'workspace' || deletingTask.task_type?.startsWith('workspace')) && (
              <p className="mt-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
                该任务来自工作台，删除可能影响卡片图片关联，请确认已经了解风险后再继续。
              </p>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? '删除中...' : '确认删除'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
