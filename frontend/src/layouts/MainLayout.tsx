import { Link, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, LogOut, Coins, User, Shield } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { apiFetch } from '@/lib/api'
import AdminPanel from '@/components/AdminPanel'
import { FolderKanbanIcon, GridViewIcon, HugeiconsIcon, PictureInPictureOnIcon, Shield01Icon, StarsIcon, Layers01Icon } from '@/components/icons'
import { Suspense, useState, useEffect, useRef } from 'react'
import type { FC } from 'react'
import type { IconSvgElement } from '@/components/icons'
import Spinner from '@/components/Spinner'

const NAV_WIDTH = 72

const LogoIcon: FC = () => (
  <img src="/logo.svg" alt="寒星" className="h-7 w-7" />
)

const NavIcon = ({ icon }: { icon: IconSvgElement }) => <HugeiconsIcon icon={icon} size={20} strokeWidth={1.7} />

const navItems = [
  { key: 'generate', to: '/', icon: StarsIcon, label: '自由创作' },
  { key: 'canvas', to: '/canvas', icon: Layers01Icon, label: '项目创作' },
  { key: 'history', to: '/history', icon: FolderKanbanIcon, label: '资产管理' },
  { key: 'workspace', to: '/workspace', icon: GridViewIcon, label: '批量生图' },
  { key: 'product', to: '/product-image', icon: PictureInPictureOnIcon, label: '商品主图' },
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
                  <NavIcon icon={item.icon} />
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
                <NavIcon icon={Shield01Icon} />
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
