import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, LogOut, Coins, User, Shield } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import AdminPanel from '@/components/AdminPanel'
import { Suspense, useState, useEffect, useRef } from 'react'
import type { FC } from 'react'
import Spinner from '@/components/Spinner'

const NAV_WIDTH = 72

const LogoIcon: FC = () => (
  <img src="/logo.svg" alt="寒星" className="h-7 w-7" />
)

const GenerateIcon: FC = () => (
  <svg viewBox="47.2 47.2 929.6 929.6" className="h-5 w-5" fill="currentColor">
    <path d="M512 51.2l146.56 314.24L972.8 512l-314.24 146.56L512 972.8l-146.56-314.24L51.2 512l314.24-146.56L512 51.2z" />
  </svg>
)

const AssetsIcon: FC = () => (
  <svg viewBox="-8 34.8 1040 912" className="h-5 w-5" fill="currentColor">
    <path d="M938.7 298.7v-85.3c0-47.1-38.2-85.3-85.3-85.3H512c0-47.1-38.2-85.3-85.3-85.3h-256c-47.1 0-85.3 38.2-85.3 85.3v170.7C38.2 298.7 0 336.9 0 384v469.3c0 47.1 38.2 85.3 85.3 85.3h853.3c47.1 0 85.3-38.2 85.3-85.3V384c0.1-47.1-38.1-85.3-85.2-85.3zM149.3 128c0-11.8 9.6-21.3 21.3-21.3h256c11.8 0 21.3 9.6 21.3 21.3v64h405.3c11.8 0 21.3 9.6 21.3 21.3v85.3H149.3V128zM960 853.3c0 11.8-9.6 21.3-21.3 21.3H85.3c-11.8 0-21.3-9.6-21.3-21.3V384c0-11.8 9.6-21.3 21.3-21.3h853.3c11.8 0 21.3 9.6 21.3 21.3v469.3z" />
  </svg>
)

const CanvasIcon: FC = () => (
  <svg viewBox="160.3 93.9 740.6 807.2" className="h-5 w-5" fill="currentColor">
    <path d="M808.1 142.3h-99.9v-37c0-4.1-3.3-7.4-7.4-7.4H649c-4.1 0-7.4 3.3-7.4 7.4v37H501v-37c0-4.1-3.3-7.4-7.4-7.4h-51.8c-4.1 0-7.4 3.3-7.4 7.4v37h-99.9c-16.4 0-29.6 13.2-29.6 29.6v111h-88.8c-16.4 0-29.6 13.2-29.6 29.6v584.6c0 16.4 13.2 29.6 29.6 29.6h473.6c16.4 0 29.6-13.2 29.6-29.6v-88.8h88.8c16.4 0 29.6-13.2 29.6-29.6V171.9c0-16.3-13.2-29.6-29.6-29.6zM652.7 860.1H253.1V349.5h201.6v160.9c0 20.4 16.6 37 37 37h160.9v312.7z m0-371.8H513.9V349.5h0.2l138.6 138.6v0.2z m118.4 253.4h-51.8V460.5L541.7 282.9H371.5v-74h62.9v29.6c0 4.1 3.3 7.4 7.4 7.4h51.8c4.1 0 7.4-3.3 7.4-7.4v-29.6h140.6v29.6c0 4.1 3.3 7.4 7.4 7.4h51.8c4.1 0 7.4-3.3 7.4-7.4v-29.6h62.9v532.8z m0 0" />
  </svg>
)

const AdminIcon: FC = () => (
  <svg viewBox="0 0 1024 1024" className="h-5 w-5" fill="currentColor">
    <path d="M617.376 929.968c-8 17.648-25.152 29.136-44.096 29.136L451.2 960a48.336 48.336 0 0 1-44.16-28.576L370.72 854.4a331.568 331.568 0 0 1-42.992-21.76l-77.776 18.944a47.872 47.872 0 0 1-50.048-17.472L123.84 736.848c-11.68-15.44-14.032-36-5.696-53.2l37.28-76.752a471.776 471.776 0 0 1-9.392-43.792l-63.424-50.368a51.088 51.088 0 0 1-17.376-50.56l26.8-121.328c4.256-19.168 18.72-33.952 37.152-37.632l81.568-18.192a421.488 421.488 0 0 1 26.832-33.856l-1.28-81.92c-0.512-19.2 10.192-36.8 27.552-46.048l109.296-54.048a48.688 48.688 0 0 1 52.64 5.84l65.008 53.28a339.488 339.488 0 0 1 45.824 0.416l61.984-51.92a48.688 48.688 0 0 1 52.56-6.336l109.856 53.664a50.72 50.72 0 0 1 27.952 45.408l-0.416 85.6c9.168 10.528 18.048 22.08 26.048 33.84l78.24 16.432c18.688 3.728 33.552 18.608 37.76 37.584l28.128 120.96c4.208 19.008-2.24 38.48-16.976 50.608l-65.6 53.376c-2.832 16.624-5.6 29.472-9.28 41.728l36.752 72.704c8.448 17.44 6.704 37.984-4.8 53.168l-74.24 98.496c-11.728 15.44-30.928 22.752-49.424 18.512l-81.488-18.16a329.28 329.28 0 0 1-42.976 21.328l-33.312 74.288zM312.32 745.296c4-1.152 8.08-1.728 12.144-1.728a51.52 51.52 0 0 1 28.48 8.4 286.48 286.48 0 0 0 63.488 31.808c12.64 4.4 23.312 14.192 29.6 26.816l33.648 71.28 63.424-0.8 30.528-68.528c6.144-13.44 16.864-23.408 30.128-27.84a284.784 284.784 0 0 0 63.472-31.296 51.2 51.2 0 0 1 39.248-7.296l74.992 17.024 38.88-51.728-34.032-67.232a52 52 0 0 1-2.832-41.68c7.44-21.888 12.32-43.68 14.56-65.616 1.6-13.808 8.368-26.496 18.96-35.488l60.784-49.04-14.848-63.456-72.16-15.248a50.944 50.944 0 0 1-33.584-23.936c-12.4-20.064-26.08-38.016-40.992-53.344a54.336 54.336 0 0 1-14.912-37.184l0.448-78.832-57.536-28-57.12 48.032c-11.504 9.632-25.424 14.752-39.84 14.752a85.44 85.44 0 0 1-8.208-0.4 286.272 286.272 0 0 0-68.512-0.624 53.04 53.04 0 0 1-40.032-14.064l-60.032-49.216-57.12 28.384 1.216 75.344a54.128 54.128 0 0 1-15.2 38.576 282.464 282.464 0 0 0-39.888 50.272 51.088 51.088 0 0 1-32.96 23.648l-75.264 16.8-14.128 63.776 58.624 46.544a51.2 51.2 0 0 1 18.336 47.408 294.976 294.976 0 0 0 0.384 70.256 51.456 51.456 0 0 1-18.56 47.808l-34.448 28.224 32.256 43.424 71.84-17.408zM512 672a160 160 0 1 1 0-320 160 160 0 0 1 0 320z m0-64a96 96 0 1 0 0-192 96 96 0 0 0 0 192z" />
  </svg>
)

const WorkspaceIcon: FC = () => (
  <svg viewBox="60.5 88.4 903.4 845.9" className="h-5 w-5" fill="currentColor">
    <path d="M864 92.4H258c-52.9 0-95.9 43-95.9 95.9v70.5h-1.7c-52.9 0-95.9 43-95.9 95.9v479.7c0 52.9 43 95.9 95.9 95.9h479.7c32.1 0 60.5-15.9 77.9-40.2h146c52.9 0 95.9-43 95.9-95.9v-606c0-52.8-43-95.8-95.9-95.8zM664.5 834.5c0 13.5-10.9 24.4-24.4 24.4H160.4c-13.5 0-24.4-10.9-24.4-24.4V354.8c0-13.5 10.9-24.4 24.4-24.4h479.7c13.5 0 24.4 10.9 24.4 24.4v479.7z m223.9-40.1c0 13.5-10.9 24.4-24.4 24.4H736v-464c0-52.9-43-95.9-95.9-95.9H233.6v-70.5c0-13.5 10.9-24.4 24.4-24.4h606c13.5 0 24.4 10.9 24.4 24.4v606z" />
    <path d="M511.6 557.5H431v-80.6c0-19.8-16-35.8-35.8-35.8s-35.8 16-35.8 35.8v80.6h-80.6c-19.8 0-35.8 16-35.8 35.8 0 19.8 16 35.8 35.8 35.8h80.6v80.6c0 19.8 16 35.8 35.8 35.8s35.8-16 35.8-35.8V629h80.6c19.8 0 35.8-16 35.8-35.8 0-19.7-16-35.7-35.8-35.7z" />
  </svg>
)

const navItems = [
  { key: 'generate', to: '/', icon: GenerateIcon, label: '自由创作' },
  { key: 'canvas', to: '/canvas', icon: CanvasIcon, label: '项目创作' },
  { key: 'history', to: '/history', icon: AssetsIcon, label: '资产管理' },
  { key: 'workspace', to: '/workspace', icon: WorkspaceIcon, label: '批量生图' },
]

const allPageKeys = navItems.map(item => item.key)

interface CreditLog {
  id: number
  credits_charged: number
  credits_type: string
  prompt: string
  status: string
  created_at: string
}

export default function MainLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const token = localStorage.getItem('token')
  const username = localStorage.getItem('username')
  const role = localStorage.getItem('userRole')
  const creativeCredits = localStorage.getItem('userCreativeCredits') || '0'
  const projectCredits = localStorage.getItem('userProjectCredits') || '0'
  const isLoggedIn = !!token

  const [showAdmin, setShowAdmin] = useState(false)
  const [showUserCard, setShowUserCard] = useState(false)
  const [groupName, setGroupName] = useState('')
  const [allowedPages, setAllowedPages] = useState<string[]>(allPageKeys)
  const [showCreditDialog, setShowCreditDialog] = useState(false)
  const [creditType, setCreditType] = useState<'creative' | 'project'>('creative')
  const [creditLogs, setCreditLogs] = useState<CreditLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const userCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isLoggedIn) {
      const fetchUserInfo = async () => {
        try {
          const res = await apiFetch('/api/auth/me')
          const data = await res.json()
          if (data.user?.group_name) {
            setGroupName(data.user.group_name)
          }
          const pages = data.user?.allowed_pages
          setAllowedPages(Array.isArray(pages) && pages.length > 0 ? pages : allPageKeys)
          if (data.user?.creative_credits !== undefined) {
            localStorage.setItem('userCreativeCredits', String(data.user.creative_credits))
          }
          if (data.user?.project_credits !== undefined) {
            localStorage.setItem('userProjectCredits', String(data.user.project_credits))
          }
        } catch {
          // 非关键数据，静默失败
        }
      }
      fetchUserInfo()
    }
  }, [isLoggedIn])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userCardRef.current && !userCardRef.current.contains(e.target as Node)) {
        setShowUserCard(false)
      }
    }
    if (showUserCard) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showUserCard])

  const handleLogout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('username')
    localStorage.removeItem('userRole')
    localStorage.removeItem('userCredits')
    localStorage.removeItem('userCreativeCredits')
    localStorage.removeItem('userProjectCredits')
    setShowUserCard(false)
    navigate('/login')
  }

  const fetchCreditLogs = async (type: 'creative' | 'project') => {
    setLoadingLogs(true)
    try {
      const res = await apiFetch(`/api/auth/credit-logs?type=${type}`)
      const data = await res.json()
      setCreditLogs(data.logs || [])
    } catch {
      setCreditLogs([])
    } finally {
      setLoadingLogs(false)
    }
  }

  const openCreditDialog = (type: 'creative' | 'project') => {
    setCreditType(type)
    setShowCreditDialog(true)
    setShowUserCard(false)
    fetchCreditLogs(type)
  }

  const visibleNavItems = role === 'admin'
    ? navItems
    : navItems.filter(item => allowedPages.includes(item.key))

  const currentPageKey = location.pathname === '/'
    ? 'generate'
    : navItems.find(item => item.to !== '/' && location.pathname.startsWith(item.to))?.key

  if (isLoggedIn && role !== 'admin' && currentPageKey && !allowedPages.includes(currentPageKey)) {
    return <Navigate to={visibleNavItems[0]?.to || '/'} replace />
  }

  return (
    <div className="flex h-screen">
      <aside
        className="flex flex-col items-center border-r border-border bg-background py-4 shrink-0"
        style={{ width: NAV_WIDTH }}
      >
        <div className="flex items-center justify-center mb-6">
          <LogoIcon />
        </div>

        <TooltipProvider>
        <nav className="flex flex-col items-center gap-1 flex-1 justify-center">
          {visibleNavItems.map((item) => {
            const isActive = item.to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.to)
            const IconComponent = item.icon
            return (
              <Tooltip key={item.to}>
                <TooltipTrigger
                  render={
                    <Link
                      to={item.to}
                      onClick={() => setShowAdmin(false)}
                      className={cn(
                        'flex items-center justify-center w-10 h-10 rounded-lg transition-colors',
                        isActive && !showAdmin
                          ? 'bg-accent text-accent-foreground'
                          : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/50',
                      )}
                    />
                  }
                >
                  <IconComponent />
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            )
          })}
          {role === 'admin' && (
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => setShowAdmin(!showAdmin)}
                    className={cn(
                      'flex items-center justify-center w-10 h-10 rounded-lg transition-colors cursor-pointer border-none bg-transparent',
                      showAdmin
                        ? 'bg-accent text-accent-foreground'
                        : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-accent/50',
                    )}
                  />
                }
              >
                <AdminIcon />
              </TooltipTrigger>
              <TooltipContent side="right">系统管理</TooltipContent>
            </Tooltip>
          )}
        </nav>
        </TooltipProvider>

        <div className="flex flex-col items-center gap-5">
          {isLoggedIn && (
            <div className="flex flex-col items-center gap-1">
              <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 gap-1">
                <Coins className="h-3 w-3" />
                {creativeCredits}
              </Badge>
              <Badge variant="secondary" className="text-[10px] px-2 py-0.5 bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 gap-1">
                <Coins className="h-3 w-3" />
                {projectCredits}
              </Badge>
            </div>
          )}

          <div className="relative flex items-center justify-center" ref={userCardRef}>
            {isLoggedIn ? (
              <div className="relative">
                <div
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-medium cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={() => setShowUserCard(!showUserCard)}
                >
                  {username?.charAt(0).toUpperCase() || '?'}
                </div>
                {showUserCard && (
                  <div className="absolute left-full bottom-0 ml-2 w-56 rounded-xl border bg-background shadow-lg p-4 z-50">
                    <div className="flex flex-col items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground text-lg font-medium">
                        {username?.charAt(0).toUpperCase() || '?'}
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-1.5">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-sm font-medium">{username}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Shield className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">{groupName || (role === 'admin' ? '管理员组' : '默认用户组')}</span>
                        </div>
                      </div>
                      <div className="w-full space-y-1.5 pt-1 border-t">
                        <div
                          className="flex items-center justify-between text-xs cursor-pointer hover:bg-muted/50 rounded px-1 py-1 -mx-1"
                          onClick={() => openCreditDialog('creative')}
                        >
                          <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
                            <Coins className="h-3 w-3" />
                            创作积分
                          </span>
                          <span className="font-medium">{creativeCredits}</span>
                        </div>
                        <div
                          className="flex items-center justify-between text-xs cursor-pointer hover:bg-muted/50 rounded px-1 py-1 -mx-1"
                          onClick={() => openCreditDialog('project')}
                        >
                          <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                            <Coins className="h-3 w-3" />
                            项目积分
                          </span>
                          <span className="font-medium">{projectCredits}</span>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full mt-1 text-destructive hover:text-destructive"
                        onClick={handleLogout}
                      >
                        <LogOut className="h-3.5 w-3.5 mr-1.5" />
                        退出登录
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <Button
                size="icon"
                variant="outline"
                className="h-8 w-8 rounded-full"
                onClick={() => navigate('/login')}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            )}
          </div>

          {isLoggedIn && (
            <button className="relative text-muted-foreground hover:text-foreground transition-colors">
              <Bell className="h-5 w-5" />
            </button>
          )}
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-hidden">
        {showAdmin ? (
          <Suspense fallback={<div className="flex items-center justify-center h-full"><Spinner /></div>}>
            <AdminPanel />
          </Suspense>
        ) : (
          <Outlet />
        )}
      </main>

      {/* 积分明细弹框 */}
      <Dialog open={showCreditDialog} onOpenChange={setShowCreditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-4 w-4" />
              {creditType === 'creative' ? '创作积分' : '项目积分'}扣减明细
            </DialogTitle>
          </DialogHeader>
          <div className="max-h-80 overflow-y-auto">
            {loadingLogs ? (
              <div className="flex items-center justify-center py-8">
                <Spinner />
              </div>
            ) : creditLogs.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                暂无扣减记录
              </div>
            ) : (
              <div className="space-y-2">
                {creditLogs.map((log) => (
                  <div key={log.id} className="flex items-start justify-between p-2 rounded-lg border bg-muted/30">
                    <div className="flex-1 min-w-0 mr-2">
                      <p className="text-sm truncate" title={log.prompt}>{log.prompt}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(log.created_at).toLocaleString('zh-CN')}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-medium text-destructive">-{log.credits_charged}</p>
                      <p className="text-xs text-muted-foreground">
                        {log.status === 'completed' ? '已完成' : log.status === 'failed' ? '已失败' : '处理中'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
