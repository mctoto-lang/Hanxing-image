import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Bell, LogOut, Coins, User, Shield } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import AdminPanel from '@/components/AdminPanel'
import { Suspense, useState, useEffect, useRef } from 'react'
import type { FC } from 'react'
import Spinner from '@/components/Spinner'

const NAV_WIDTH = 72

const LogoIcon: FC = () => (
  <img src="/logo.svg" alt="寒星" className="h-7 w-7" />
)

const GenerateIcon: FC<{ filled?: boolean }> = ({ filled }) => (
  <svg viewBox="0 0 1024 1024" className="h-5 w-5">
    <path d="M538.112 38.4c-15.36-44.544-39.936-44.544-55.296 0l-84.992 250.88c-14.848 44.544-64 93.184-108.032 108.544L40.448 482.816c-44.544 15.36-44.544 39.936 0 55.296l247.808 86.016c44.544 15.36 93.184 64.512 108.544 108.544l86.528 251.392c15.36 44.544 39.936 44.544 55.296 0l84.48-249.856c14.848-44.544 63.488-93.184 108.032-108.544l252.928-86.528c44.544-15.36 44.544-39.936 0-54.784l-248.832-83.968c-44.544-14.848-93.184-63.488-108.544-108.032-1.536-0.512-88.576-253.952-88.576-253.952z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 20} />
  </svg>
)

const AssetsIcon: FC<{ filled?: boolean }> = ({ filled }) => (
  <svg viewBox="0 0 1024 1024" className="h-5 w-5">
    <path d="M855.04 385.024q19.456 2.048 38.912 10.24t33.792 23.04 21.504 37.376 2.048 54.272q-2.048 8.192-8.192 40.448t-14.336 74.24-18.432 86.528-19.456 76.288q-5.12 18.432-14.848 37.888t-25.088 35.328-36.864 26.112-51.2 10.24l-567.296 0q-21.504 0-44.544-9.216t-42.496-26.112-31.744-40.96-12.288-53.76l0-439.296q0-62.464 33.792-97.792t95.232-35.328l503.808 0q22.528 0 46.592 8.704t43.52 24.064 31.744 35.84 12.288 44.032l0 11.264-53.248 0q-40.96 0-95.744-0.512t-116.736-0.512-115.712-0.512-92.672-0.512l-47.104 0q-26.624 0-41.472 16.896t-23.04 44.544q-8.192 29.696-18.432 62.976t-18.432 61.952q-10.24 33.792-20.48 65.536-2.048 8.192-2.048 13.312 0 17.408 11.776 29.184t29.184 11.776q31.744 0 43.008-39.936l54.272-198.656q133.12 1.024 243.712 1.024l286.72 0z" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={filled ? 0 : 20} />
  </svg>
)

const CanvasIcon: FC<{ filled?: boolean }> = ({ filled }) => (
  <svg viewBox="0 0 1024 1024" className="h-5 w-5">
    <path d="M284.458667 369.792c15.701333 0 28.416 12.714667 28.416 28.416v483.584a28.458667 28.458667 0 0 1-28.416 28.416H256a28.458667 28.458667 0 0 1-28.458667-28.416v-85.333333h-85.333333A28.458667 28.458667 0 0 1 113.792 768v-28.458667c0-15.701333 12.714667-28.416 28.416-28.416h85.333333V398.208c0-15.701333 12.757333-28.416 28.458667-28.416h28.458667z m597.333333 341.333333c15.701333 0 28.416 12.714667 28.416 28.416V768a28.458667 28.458667 0 0 1-28.416 28.458667h-85.333333v85.333333a28.458667 28.458667 0 0 1-28.458667 28.416h-28.458667a28.458667 28.458667 0 0 1-28.416-28.416v-85.333333H398.208A28.458667 28.458667 0 0 1 369.792 768v-28.458667c0-15.701333 12.714667-28.416 28.416-28.416h483.584zM768 113.792c15.701333 0 28.458667 12.714667 28.458667 28.416v85.333333h85.333333c15.701333 0 28.416 12.757333 28.416 28.458667v28.458667a28.458667 28.458667 0 0 1-28.416 28.416h-85.333333v312.917333a28.458667 28.458667 0 0 1-28.458667 28.416h-28.458667a28.458667 28.458667 0 0 1-28.416-28.416V284.970667a29.013333 29.013333 0 0 1 0-0.512V142.208c0-15.701333 12.714667-28.416 28.416-28.416H768z m-483.541333 0c15.701333 0 28.416 12.714667 28.416 28.416v85.333333h312.917333c15.701333 0 28.416 12.757333 28.416 28.458667v28.458667a28.458667 28.458667 0 0 1-28.416 28.416H142.208a28.458667 28.458667 0 0 1-28.416-28.416V256c0-15.701333 12.714667-28.458667 28.416-28.458667h85.333333v-85.333333c0-15.701333 12.757333-28.416 28.458667-28.416h28.458667z" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth={filled ? 0 : 16} />
  </svg>
)

const AdminIcon: FC<{ filled?: boolean }> = ({ filled }) => (
  <svg viewBox="0 0 1024 1024" className="h-5 w-5">
    <path d="M897.861818 438.225455l-48.407273-14.661819a338.152727 338.152727 0 0 0-36.538181-87.738181l23.272727-44.45091a46.545455 46.545455 0 0 0-8.145455-54.923636l-40.494545-41.425454A46.545455 46.545455 0 0 0 732.625455 186.181818l-44.45091 23.272727a329.076364 329.076364 0 0 0-87.738181-34.676363l-14.661819-48.64A46.545455 46.545455 0 0 0 541.323636 93.090909h-58.647272a46.545455 46.545455 0 0 0-44.450909 33.047273L423.563636 174.545455a330.24 330.24 0 0 0-87.738181 36.538181L291.374545 186.181818a46.545455 46.545455 0 0 0-54.923636 7.912727l-41.425454 42.356364A46.545455 46.545455 0 0 0 186.181818 291.374545l23.272727 44.45091a336.756364 336.756364 0 0 0-34.676363 87.738181l-48.64 14.661819A46.545455 46.545455 0 0 0 93.090909 482.676364v58.647272a46.545455 46.545455 0 0 0 33.047273 44.450909l48.407273 14.661819a338.152727 338.152727 0 0 0 36.538181 87.738181L186.181818 732.625455a46.545455 46.545455 0 0 0 8.145455 54.923636l41.425454 41.425454a46.545455 46.545455 0 0 0 54.923637 7.912728l44.450909-23.272728a329.076364 329.076364 0 0 0 87.738182 36.072728l14.661818 48.64a46.545455 46.545455 0 0 0 45.149091 32.581818h58.647272a46.545455 46.545455 0 0 0 44.450909-33.047273l14.661819-48.407273a330.24 330.24 0 0 0 87.738181-36.538181l44.45091 23.272727a46.545455 46.545455 0 0 0 54.923636-7.912727l41.425454-41.425455a46.545455 46.545455 0 0 0 8.843637-54.225454l-23.272727-44.45091a336.756364 336.756364 0 0 0 36.072727-87.738181l48.64-14.661819A46.545455 46.545455 0 0 0 930.909091 541.323636v-58.647272a46.545455 46.545455 0 0 0-33.047273-44.450909z m-61.905454 117.527272a46.545455 46.545455 0 0 0-31.418182 32.814546 302.545455 302.545455 0 0 1-31.418182 75.403636 46.545455 46.545455 0 0 0-1.861818 45.149091l17.221818 32.814545-1.861818 1.861819-34.909091 34.909091-32.814545-17.221819a46.545455 46.545455 0 0 0-45.149091 1.861819 302.545455 302.545455 0 0 1-75.403636 31.418182 46.545455 46.545455 0 0 0-32.814546 31.418182l-10.705454 35.374545h-52.363637l-10.705454-35.374545a46.545455 46.545455 0 0 0-32.814546-31.418182 302.545455 302.545455 0 0 1-75.403636-31.418182 46.545455 46.545455 0 0 0-45.149091-1.861819l-32.814545 17.221819-1.861818-1.861819-34.909091-34.909091 17.221818-32.814545a46.545455 46.545455 0 0 0-1.861818-45.149091 302.545455 302.545455 0 0 1-31.418182-75.403636 46.545455 46.545455 0 0 0-31.418182-32.814546l-35.374545-10.705454v-52.363637l35.374545-10.705454a46.545455 46.545455 0 0 0 31.418182-32.814546 302.545455 302.545455 0 0 1 31.418182-75.403636 46.545455 46.545455 0 0 0 1.861818-45.149091l-17.221818-32.814545 1.861818-1.861819 34.909091-34.909091 32.814545 17.221819a46.545455 46.545455 0 0 0 45.149091-1.861819 302.545455 302.545455 0 0 1 75.403636-31.418182 46.545455 46.545455 0 0 0 32.814546-31.418182l10.705454-35.374545h52.363637l10.705454 35.374545a46.545455 46.545455 0 0 0 32.814546 31.418182 302.545455 302.545455 0 0 1 75.403636 31.418182 46.545455 46.545455 0 0 0 45.149091 1.861819l32.814545-17.221819 1.861818 1.861819 34.909091 34.909091-17.221818 32.814545a46.545455 46.545455 0 0 0 1.861818 45.149091 302.545455 302.545455 0 0 1 31.418182 75.403636 46.545455 46.545455 0 0 0 31.418182 32.814546l35.374545 10.705454v52.363637l-35.374545 10.705454z" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth={filled ? 0 : 16} />
    <path d="M512 372.363636a139.636364 139.636364 0 1 0 0 279.272728 139.636364 139.636364 0 0 0 0-279.272728z m0 209.454546a69.818182 69.818182 0 1 1 0-139.636364 69.818182 69.818182 0 0 1 0 139.636364z" fill={filled ? 'currentColor' : 'none'} stroke={filled ? 'none' : 'currentColor'} strokeWidth={filled ? 0 : 16} />
  </svg>
)

const navItems = [
  { to: '/', icon: GenerateIcon, label: '自由创作' },
  { to: '/canvas', icon: CanvasIcon, label: '项目创作' },
  { to: '/history', icon: AssetsIcon, label: '资产管理' },
]

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
  const [showCreditDialog, setShowCreditDialog] = useState(false)
  const [creditType, setCreditType] = useState<'creative' | 'project'>('creative')
  const [creditLogs, setCreditLogs] = useState<CreditLog[]>([])
  const [loadingLogs, setLoadingLogs] = useState(false)
  const userCardRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isLoggedIn) {
      const fetchUserInfo = async () => {
        try {
          const res = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${token}` },
          })
          const data = await res.json()
          if (data.user?.group_name) {
            setGroupName(data.user.group_name)
          }
          if (data.user?.creative_credits !== undefined) {
            localStorage.setItem('userCreativeCredits', String(data.user.creative_credits))
          }
          if (data.user?.project_credits !== undefined) {
            localStorage.setItem('userProjectCredits', String(data.user.project_credits))
          }
        } catch {}
      }
      fetchUserInfo()
    }
  }, [isLoggedIn, token])

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
      const res = await fetch(`/api/auth/credit-logs?type=${type}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
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
          {navItems.map((item) => {
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
                        'flex items-center justify-center w-14 h-14 rounded-xl transition-colors',
                        isActive && !showAdmin
                          ? 'text-foreground'
                          : 'text-muted-foreground/50 hover:text-muted-foreground',
                      )}
                    />
                  }
                >
                  <IconComponent filled={isActive && !showAdmin} />
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            )
          })}
          {role === 'admin' && (
            <Tooltip>
              <TooltipTrigger
                onClick={() => setShowAdmin(!showAdmin)}
                className={cn(
                  'flex items-center justify-center w-14 h-14 rounded-xl transition-colors cursor-pointer border-none bg-transparent',
                  showAdmin
                    ? 'text-foreground'
                    : 'text-muted-foreground/50 hover:text-muted-foreground',
                )}
              >
                <AdminIcon filled={showAdmin} />
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
            <AdminPanel onClose={() => setShowAdmin(false)} />
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
