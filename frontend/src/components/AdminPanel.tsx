import { useState, lazy, Suspense } from 'react'
import { X, LayoutDashboard, Users, Shield, Cpu, Image, FileText, PanelRightClose, PanelRightOpen, Database, Settings } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import Spinner from '@/components/Spinner'

const AdminDashboard = lazy(() => import('@/pages/admin/AdminDashboard'))
const AdminUsers = lazy(() => import('@/pages/admin/AdminUsers'))
const AdminGroups = lazy(() => import('@/pages/admin/AdminGroups'))
const AdminModels = lazy(() => import('@/pages/admin/AdminModels'))
const AdminImages = lazy(() => import('@/pages/admin/AdminImages'))
const AdminStorageSettings = lazy(() => import('@/pages/admin/AdminStorageSettings'))
const AdminLogs = lazy(() => import('@/pages/admin/AdminLogs'))
const AdminSettings = lazy(() => import('@/pages/admin/AdminSettings'))

const PANEL_NAV_WIDTH = 200

const adminTabs = [
  { key: 'dashboard', icon: LayoutDashboard, label: '概览', Component: AdminDashboard },
  { key: 'users', icon: Users, label: '用户管理', Component: AdminUsers },
  { key: 'groups', icon: Shield, label: '权限组', Component: AdminGroups },
  { key: 'models', icon: Cpu, label: '模型/API', Component: AdminModels },
  { key: 'images', icon: Image, label: '图片管理', Component: AdminImages },
  { key: 'storage', icon: Database, label: '存储设置', Component: AdminStorageSettings },
  { key: 'settings', icon: Settings, label: '系统设置', Component: AdminSettings },
  { key: 'logs', icon: FileText, label: '日志', Component: AdminLogs },
]

export default function AdminPanel({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState('dashboard')
  const [showNav, setShowNav] = useState(true)
  const ActiveComponent = adminTabs.find((t) => t.key === activeTab)?.Component || AdminDashboard

  return (
    <div className="flex h-full">
      {showNav && (
        <aside
          className="flex flex-col border-r border-border bg-sidebar/30 shrink-0"
          style={{ width: PANEL_NAV_WIDTH }}
        >
          <div className="flex items-center justify-between px-4 h-12 border-b border-border">
            <span className="font-semibold text-sm">管理后台</span>
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShowNav(false)}
                className="text-muted-foreground"
              >
                <PanelRightClose className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <nav className="flex flex-col gap-1 p-2 flex-1">
            {adminTabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.key
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={cn(
                    'flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left w-full transition-colors',
                    isActive
                      ? 'bg-primary/10 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{tab.label}</span>
                </button>
              )
            })}
          </nav>
        </aside>
      )}

      <div className="flex-1 min-w-0 overflow-y-auto p-6 relative">
        {!showNav && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowNav(true)}
            className="absolute left-4 top-4 gap-1.5 shadow-sm"
          >
            <PanelRightOpen className="h-4 w-4" />
            <span>导航</span>
          </Button>
        )}
        <Suspense fallback={<div className="flex items-center justify-center py-20"><Spinner /></div>}>
          <ActiveComponent />
        </Suspense>
      </div>
    </div>
  )
}
