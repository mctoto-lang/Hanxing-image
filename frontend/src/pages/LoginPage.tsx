import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { LoginForm } from '@/components/login-form'

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
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
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
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <LoginForm
        className="w-80"
        username={username}
        setUsername={setUsername}
        password={password}
        setPassword={setPassword}
        error={error}
        loading={loading}
        onSubmit={handleLogin}
      />
    </div>
  )
}
