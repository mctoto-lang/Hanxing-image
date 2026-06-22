import { Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import Spinner from './components/Spinner'
import { setUnauthorizedHandler } from './lib/api'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const GeneratePage = lazy(() => import('./pages/GeneratePage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const CanvasPage = lazy(() => import('./pages/CanvasPage'))
const WorkspacePage = lazy(() => import('./pages/WorkspacePage'))
const MainLayout = lazy(() => import('./layouts/MainLayout'))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function App() {
  const navigate = useNavigate()

  // 注册全局 401 处理：清除登录态并跳转登录页
  useEffect(() => {
    setUnauthorizedHandler(() => {
      navigate('/login', { replace: true })
    })
  }, [navigate])

  return (
    <TooltipProvider>
      <Suspense fallback={<div className="min-h-screen flex items-center justify-center"><Spinner /></div>}>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <MainLayout />
              </ProtectedRoute>
            }
          >
            <Route index element={<GeneratePage />} />
            <Route path="history" element={<HistoryPage />} />
            <Route path="canvas" element={<CanvasPage />} />
            <Route path="workspace" element={<WorkspacePage />} />
          </Route>
        </Routes>
      </Suspense>
      <Toaster />
    </TooltipProvider>
  )
}

export default App
