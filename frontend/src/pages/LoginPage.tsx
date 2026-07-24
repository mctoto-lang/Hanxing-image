import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LoginForm } from '@/components/login-form'
import { apiFetch } from '@/lib/api'
import { GalleryVerticalEndIcon } from 'lucide-react'

const LOGIN_BG =
  'https://hanxing-image-1317632122.cos.ap-guangzhou.myqcloud.com/image/login-page-bg.png'

export default function LoginPage() {
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await apiFetch('/api/auth/login', {
        method: 'POST',
        body: { username, password },
        skipAuthRedirect: true,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '登录失败')
        return
      }
      localStorage.setItem('token', data.token)
      localStorage.setItem('username', data.user.username)
      localStorage.setItem('userRole', data.user.role)
      localStorage.setItem('userCredits', String(data.user.credits))
      localStorage.setItem('userCreativeCredits', String(data.user.creative_credits || 0))
      localStorage.setItem('userProjectCredits', String(data.user.project_credits || 0))
      navigate('/')
    } catch {
      setError('网络错误，请检查后端服务')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="grid min-h-svh lg:grid-cols-2">
      {/* 左侧：品牌 + 表单 */}
      <div className="flex flex-col gap-4 p-6 md:p-10">
        {/* 品牌 Logo */}
        <div className="flex justify-center gap-2 md:justify-start">
          <a href="#" className="flex items-center gap-2 font-medium">
            <div className="flex size-6 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <GalleryVerticalEndIcon className="size-4" />
            </div>
            瀚星AIGC
          </a>
        </div>

        {/* 表单居中 */}
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xs">
            <LoginForm
              username={username}
              setUsername={setUsername}
              password={password}
              setPassword={setPassword}
              error={error}
              loading={loading}
              onSubmit={handleLogin}
            />
          </div>
        </div>
      </div>

      {/* 右侧：封面图片（桌面端显示） */}
      <div className="relative hidden bg-muted lg:block">
        <img
          src={LOGIN_BG}
          alt="瀚星AIGC"
          className="absolute inset-0 h-full w-full object-cover dark:brightness-[0.2] dark:grayscale"
        />
      </div>
    </div>
  )
}
