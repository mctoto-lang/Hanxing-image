import { useState, useEffect, useCallback, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { DataTable, type ColumnDef } from '@/components/ui/data-table'
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
import { ArrowUpDown, FileText, LogIn, Eye, CircleAlert, Copy, Check, Trash2 } from 'lucide-react'

interface TaskLog {
  id: number
  username: string
  prompt: string
  model_name: string
  status: string
  credits_charged: number
  credits_type: string
  source: string
  retry_count: number
  error_message: string | null
  retry_errors: string[]
  image_size: string
  image_count: number
  result_images: string[]
  created_at: string
  started_at: string | null
  completed_at: string | null
}

interface LoginLog {
  id: number
  username: string
  ip_address: string
  user_agent: string
  login_at: string
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
  const [tab, setTab] = useState('tasks')
  const [loginLogs, setLoginLogs] = useState<LoginLog[]>([])
  const [taskLogs, setTaskLogs] = useState<TaskLog[]>([])
  const [selectedTask, setSelectedTask] = useState<TaskLog | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [errorDialogOpen, setErrorDialogOpen] = useState(false)
  const [errorDialogContent, setErrorDialogContent] = useState('')
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingTask, setDeletingTask] = useState<TaskLog | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [pageIndex, setPageIndex] = useState(0)

  const fetchLoginLogs = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/admin/logs/login?limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setLoginLogs(data.logs || [])
    } catch {}
  }, [])

  const fetchTaskLogs = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/admin/logs/tasks?limit=100', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setTaskLogs(data.logs || [])
    } catch {}
  }, [])

  const handleTabChange = (value: string) => {
    setTab(value)
  }

  useEffect(() => {
    fetchTaskLogs()
    fetchLoginLogs()
  }, [fetchTaskLogs, fetchLoginLogs])

  useEffect(() => {
    const interval = setInterval(() => {
      if (tab === 'login') fetchLoginLogs()
      else fetchTaskLogs()
    }, 5000)
    return () => clearInterval(interval)
  }, [tab, fetchLoginLogs, fetchTaskLogs])

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

  const getSourceBadge = (source: string) => {
    if (source === 'project') {
      return <Badge variant="default">工作项目</Badge>
    }
    return <Badge variant="secondary">自由创作</Badge>
  }

  const openTaskDetail = (task: TaskLog) => {
    setSelectedTask(task)
    setSheetOpen(true)
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
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/admin/logs/tasks/${deletingTask.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        setTaskLogs((prev) => prev.filter((log) => log.id !== deletingTask.id))
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
      cell: ({ row }) => getSourceBadge(row.original.source),
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
          {tab === 'tasks' ? (
            <DataTable
              columns={taskColumns}
              data={taskLogs}
              searchPlaceholder="搜索用户名..."
              searchColumn="username"
              showColumnToggle={false}
              pageSize={15}
              pageIndex={pageIndex}
              onPageChange={setPageIndex}
              toolbar={
                <div className="flex items-center gap-1 border rounded-md p-0.5">
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleTabChange('tasks')}
                    className="h-8"
                  >
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    生图日志
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTabChange('login')}
                    className="h-8"
                  >
                    <LogIn className="mr-1.5 h-3.5 w-3.5" />
                    登录日志
                  </Button>
                </div>
              }
            />
          ) : (
            <DataTable
              columns={loginColumns}
              data={loginLogs}
              searchPlaceholder="搜索用户名..."
              searchColumn="username"
              showColumnToggle={false}
              pageSize={15}
              pageIndex={pageIndex}
              onPageChange={setPageIndex}
              toolbar={
                <div className="flex items-center gap-1 border rounded-md p-0.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleTabChange('tasks')}
                    className="h-8"
                  >
                    <FileText className="mr-1.5 h-3.5 w-3.5" />
                    生图日志
                  </Button>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => handleTabChange('login')}
                    className="h-8"
                  >
                    <LogIn className="mr-1.5 h-3.5 w-3.5" />
                    登录日志
                  </Button>
                </div>
              }
            />
          )}
        </CardContent>
      </Card>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader className="px-1">
            <SheetTitle>任务详情</SheetTitle>
            <SheetDescription>
              查看任务的详细信息
            </SheetDescription>
          </SheetHeader>
          {selectedTask && (
            <div className="mt-6 space-y-6 px-1">
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
                  <div className="pl-1">{getSourceBadge(selectedTask.source)}</div>
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

              {(() => {
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
                              {parsed.rawResponse && (
                                <div className="pt-1.5 border-t border-destructive/10">
                                  <p className="text-[10px] text-muted-foreground mb-0.5">API 原始响应</p>
                                  <pre className="text-[10px] font-mono break-all text-destructive/80 whitespace-pre-wrap max-h-24 overflow-y-auto">{parsed.rawResponse}</pre>
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {!selectedTask.error_message && retryErrors.length === 0 && null}
                    </div>
                  </div>
                )
              })()}

              {selectedTask.error_message && !Array.isArray(selectedTask.retry_errors) && (
                <div className="space-y-2">
                  <Label className="text-sm font-medium text-foreground">错误信息</Label>
                  <div className="rounded-lg border border-destructive/20 overflow-hidden">
                    <div className="p-3 bg-destructive/10">
                      {(() => {
                        const parsed = parseErrorMessage(selectedTask.error_message)
                        const isTimeout = parsed.errorType === '请求超时'
                        return (
                          <div className="space-y-2">
                            <div className="flex items-center gap-2">
                              <Badge variant={isTimeout ? 'secondary' : 'destructive'} className={isTimeout ? 'bg-orange-500 hover:bg-orange-600 text-xs' : 'text-xs'}>
                                {parsed.errorType}
                              </Badge>
                              {parsed.retryInfo && (
                                <Badge variant="outline" className="text-muted-foreground text-xs">
                                  {parsed.retryInfo}
                                </Badge>
                              )}
                            </div>
                            <p className="text-xs font-mono break-all text-destructive">{parsed.coreMessage}</p>
                            {(parsed.elapsed || parsed.timestamp) && (
                              <div className="flex gap-3 text-xs text-muted-foreground pt-1 border-t border-destructive/10">
                                {parsed.elapsed && <span>耗时: {parsed.elapsed}</span>}
                                {parsed.timestamp && <span>时间: {parsed.timestamp}</span>}
                              </div>
                            )}
                            {parsed.rawResponse && (
                              <div className="pt-2 border-t border-destructive/10">
                                <p className="text-xs text-muted-foreground mb-1">API 原始响应</p>
                                <pre className="text-xs font-mono break-all text-destructive/80 whitespace-pre-wrap max-h-32 overflow-y-auto">{parsed.rawResponse}</pre>
                              </div>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                </div>
              )}

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
                        <img src={img} alt="" className="w-full h-full object-cover" />
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
                <p className="text-xs text-muted-foreground">时间: {new Date(deletingTask.created_at).toLocaleString('zh-CN')}</p>
              </div>
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
