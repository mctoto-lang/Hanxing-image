import { Routes, Route, Navigate } from 'react-router-dom'
import { Suspense, lazy } from 'react'
import { TooltipProvider } from "@/components/ui/tooltip"
import { Toaster } from "@/components/ui/sonner"
import Spinner from './components/Spinner'

const LoginPage = lazy(() => import('./pages/LoginPage'))
const GeneratePage = lazy(() => import('./pages/GeneratePage'))
const HistoryPage = lazy(() => import('./pages/HistoryPage'))
const CanvasPage = lazy(() => import('./pages/CanvasPage'))
const MainLayout = lazy(() => import('./layouts/MainLayout'))

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function App() {
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
          </Route>
        </Routes>
      </Suspense>
      <Toaster />
    </TooltipProvider>
  )
}

export default App
