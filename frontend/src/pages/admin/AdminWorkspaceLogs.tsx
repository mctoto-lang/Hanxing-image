import { useState, useEffect } from 'react'
import { apiFetch } from '@/lib/api'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Spinner from '@/components/Spinner'

interface WorkspaceLog {
  id: number
  user_id: number
  username: string | null
  api_type: string
  api_config_name: string | null
  workspace_task_id: number | null
  card_id: number | null
  request_params: string | null
  response_status: string
  response_body: string | null
  duration_ms: number | null
  retry_count: number
  error_message: string | null
  created_at: string
}

export default function AdminWorkspaceLogs() {
  const [logs, setLogs] = useState<WorkspaceLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [page, setPage] = useState(1)
  const [typeFilter, setTypeFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [detailLog, setDetailLog] = useState<WorkspaceLog | null>(null)

  const pageSize = 30

  useEffect(() => { fetchLogs() }, [page, typeFilter, statusFilter])

  const fetchLogs = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(page), page_size: String(pageSize) })
      if (typeFilter !== 'all') params.set('api_type', typeFilter)
      if (statusFilter !== 'all') params.set('status', statusFilter)
      const res = await apiFetch(`/api/admin/workspace/workspace-logs?${params}`)
      const data = await res.json()
      setLogs(data.logs || [])
      setTotal(data.total || 0)
    } catch {} finally { setLoading(false) }
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-semibold">工作台调用日志</h2>
        <p className="text-sm text-muted-foreground mt-0.5">批量生图工作台的 AI 接口调用记录</p>
      </div>

      <div className="flex items-center gap-3">
        <Select value={typeFilter} onValueChange={v => { if (v) { setTypeFilter(v); setPage(1) } }}>
          <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部类型</SelectItem>
            <SelectItem value="chat">对话</SelectItem>
            <SelectItem value="image">绘图</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={v => { if (v) { setStatusFilter(v); setPage(1) } }}>
          <SelectTrigger className="w-32 h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            <SelectItem value="success">成功</SelectItem>
            <SelectItem value="failure">失败</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-auto">共 {total} 条</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Spinner /></div>
      ) : logs.length === 0 ? (
        <div className="text-center text-muted-foreground py-12">暂无日志</div>
      ) : (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {['时间', '类型', '接口', '用户', '状态', '耗时', '操作'].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left font-medium text-xs text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logs.map((log, i) => (
                <tr key={log.id} className={cn('border-t', i % 2 === 0 ? 'bg-background' : 'bg-muted/20')}>
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant={log.api_type === 'image' ? 'default' : 'secondary'} className="text-[10px]">
                      {log.api_type === 'image' ? '绘图' : '对话'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs max-w-[120px] truncate">{log.api_config_name || '-'}</td>
                  <td className="px-3 py-2 text-xs">{log.username || '-'}</td>
                  <td className="px-3 py-2">
                    <Badge variant={log.response_status === 'success' ? 'default' : 'destructive'} className="text-[10px]">
                      {log.response_status === 'success' ? '成功' : '失败'}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {log.duration_ms ? `${log.duration_ms}ms` : '-'}
                  </td>
                  <td className="px-3 py-2">
                    <button onClick={() => setDetailLog(log)} className="text-xs text-primary hover:underline">详情</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}

      <Dialog open={!!detailLog} onOpenChange={v => !v && setDetailLog(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>日志详情</DialogTitle></DialogHeader>
          {detailLog && (
            <div className="space-y-3 text-sm">
              {[
                ['时间', new Date(detailLog.created_at).toLocaleString('zh-CN')],
                ['类型', detailLog.api_type === 'image' ? '绘图' : '对话'],
                ['接口', detailLog.api_config_name || '-'],
                ['用户', detailLog.username || '-'],
                ['状态', detailLog.response_status],
                ['耗时', detailLog.duration_ms ? `${detailLog.duration_ms}ms` : '-'],
                ['任务ID', detailLog.workspace_task_id || '-'],
                ['卡片ID', detailLog.card_id || '-'],
              ].map(([label, value]) => (
                <div key={String(label)} className="flex gap-3">
                  <span className="text-muted-foreground w-16 shrink-0">{label}</span>
                  <span>{String(value)}</span>
                </div>
              ))}
              {detailLog.error_message && (
                <div>
                  <p className="text-muted-foreground mb-1">错误信息</p>
                  <p className="text-destructive text-xs bg-destructive/10 rounded p-2">{detailLog.error_message}</p>
                </div>
              )}
              {detailLog.request_params && (
                <div>
                  <p className="text-muted-foreground mb-1">请求参数</p>
                  <pre className="text-xs bg-muted rounded p-2 overflow-x-auto max-h-32">{detailLog.request_params}</pre>
                </div>
              )}
              {detailLog.response_body && (
                <div>
                  <p className="text-muted-foreground mb-1">响应内容</p>
                  <pre className="text-xs bg-muted rounded p-2 overflow-x-auto max-h-32">{detailLog.response_body}</pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
