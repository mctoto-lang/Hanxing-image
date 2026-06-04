import { useState, useEffect, useCallback, useMemo } from 'react'
import { UserPlus, Coins, ShieldCheck, ShieldOff, ArrowUpDown, MoreHorizontal, KeyRound, UserCog } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { DataTable, type ColumnDef } from '@/components/ui/data-table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { toast } from 'sonner'

interface User {
  id: number
  username: string
  role: string
  credits: number
  creative_credits: number
  project_credits: number
  daily_credits_remaining: number
  daily_credits_date: string
  is_active: boolean
  group_name: string | null
  created_at: string
}

interface Group {
  id: number
  name: string
}

export default function AdminUsers() {
  const [users, setUsers] = useState<User[]>([])
  const [groups, setGroups] = useState<Group[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [editOpen, setEditOpen] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newGroupId, setNewGroupId] = useState<string>('')
  const [newRole, setNewRole] = useState<string>('user')
  const [editUserId, setEditUserId] = useState<number | null>(null)
  const [editCreativeCredits, setEditCreativeCredits] = useState('')
  const [editProjectCredits, setEditProjectCredits] = useState('')
  const [passwordOpen, setPasswordOpen] = useState(false)
  const [passwordUserId, setPasswordUserId] = useState<number | null>(null)
  const [passwordUsername, setPasswordUsername] = useState('')
  const [newPasswordValue, setNewPasswordValue] = useState('')
  const [roleConfirmOpen, setRoleConfirmOpen] = useState(false)
  const [roleConfirmUser, setRoleConfirmUser] = useState<User | null>(null)

  const fetchUsers = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setUsers(data.users || [])
    } catch {}
  }, [])

  const fetchGroups = useCallback(async () => {
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/admin/groups', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setGroups(data.groups || [])
    } catch {}
  }, [])

  useEffect(() => {
    fetchUsers()
    fetchGroups()
  }, [fetchUsers, fetchGroups])

  const handleCreateUser = async () => {
    if (!newUsername.trim() || !newPassword.trim()) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch('/api/admin/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          username: newUsername,
          password: newPassword,
          group_id: newGroupId ? parseInt(newGroupId) : null,
          role: newRole,
        }),
      })
      if (res.ok) {
        setCreateOpen(false)
        setNewUsername('')
        setNewPassword('')
        setNewGroupId('')
        setNewRole('user')
        fetchUsers()
      } else {
        const data = await res.json()
        toast.error(data.error || '创建失败')
      }
    } catch {
      toast.error('网络错误')
    }
  }

  const handleUpdateCredits = async () => {
    if (!editUserId) return
    try {
      const token = localStorage.getItem('token')
      await fetch(`/api/admin/users/${editUserId}/credits`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          creative_credits: parseInt(editCreativeCredits),
          project_credits: parseInt(editProjectCredits),
        }),
      })
      setEditOpen(false)
      setEditUserId(null)
      setEditCreativeCredits('')
      setEditProjectCredits('')
      fetchUsers()
    } catch {}
  }

  const handleToggleActive = async (userId: number) => {
    try {
      const token = localStorage.getItem('token')
      await fetch(`/api/admin/users/${userId}/toggle-active`, {
        method: 'PUT',
        headers: { Authorization: `Bearer ${token}` },
      })
      fetchUsers()
    } catch {}
  }

  const openPasswordModal = (user: User) => {
    setPasswordUserId(user.id)
    setPasswordUsername(user.username)
    setNewPasswordValue('')
    setPasswordOpen(true)
  }

  const handleResetPassword = async () => {
    if (!passwordUserId || !newPasswordValue.trim()) return
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/admin/users/${passwordUserId}/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ new_password: newPasswordValue }),
      })
      if (res.ok) {
        setPasswordOpen(false)
        setPasswordUserId(null)
        setNewPasswordValue('')
      } else {
        const data = await res.json()
        toast.error(data.error || '修改密码失败')
      }
    } catch {
      toast.error('网络错误')
    }
  }

  const handleToggleRole = async (user: User) => {
    setRoleConfirmUser(user)
    setRoleConfirmOpen(true)
  }

  const confirmToggleRole = async () => {
    if (!roleConfirmUser) return
    const user = roleConfirmUser
    const newRole = user.role === 'admin' ? 'user' : 'admin'
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/admin/users/${user.id}/role`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ role: newRole }),
      })
      if (res.ok) {
        fetchUsers()
      } else {
        const data = await res.json()
        toast.error(data.error || '切换角色失败')
      }
    } catch {
      toast.error('网络错误')
    } finally {
      setRoleConfirmOpen(false)
      setRoleConfirmUser(null)
    }
  }

  const openEditModal = (user: User) => {
    setEditUserId(user.id)
    setEditCreativeCredits(String(user.creative_credits || 0))
    setEditProjectCredits(String(user.project_credits || 0))
    setEditOpen(true)
  }

  const columns: ColumnDef<User, unknown>[] = useMemo(() => [
    {
      accessorKey: 'id',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          ID
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    {
      accessorKey: 'username',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          用户名
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
    },
    {
      accessorKey: 'role',
      header: '角色',
      cell: ({ row }) => (
        <Badge
          variant={row.original.role === 'admin' ? 'secondary' : 'outline'}
          className={
            row.original.role === 'admin'
              ? 'bg-amber-100 text-amber-800 hover:bg-amber-100'
              : ''
          }
        >
          {row.original.role === 'admin' ? '管理员' : '用户'}
        </Badge>
      ),
    },
    {
      accessorKey: 'creative_credits',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          <Coins className="mr-1 h-3 w-3 text-blue-500" />
          创作积分
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="flex items-center gap-1">
          <Coins className="h-3 w-3 text-blue-500" />
          {row.original.creative_credits || 0}
        </span>
      ),
    },
    {
      accessorKey: 'project_credits',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          <Coins className="mr-1 h-3 w-3 text-green-500" />
          项目积分
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => (
        <span className="flex items-center gap-1">
          <Coins className="h-3 w-3 text-green-500" />
          {row.original.project_credits || 0}
        </span>
      ),
    },
    {
      accessorKey: 'group_name',
      header: '权限组',
      cell: ({ row }) => row.original.group_name || '-',
    },
    {
      accessorKey: 'is_active',
      header: '状态',
      cell: ({ row }) => (
        <Badge
          variant={row.original.is_active ? 'secondary' : 'destructive'}
          className={
            row.original.is_active
              ? 'bg-green-100 text-green-800 hover:bg-green-100'
              : ''
          }
        >
          {row.original.is_active ? '活跃' : '禁用'}
        </Badge>
      ),
    },
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <Button
          variant="ghost"
          onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
        >
          创建时间
          <ArrowUpDown className="ml-2 h-4 w-4" />
        </Button>
      ),
      cell: ({ row }) => new Date(row.original.created_at).toLocaleString('zh-CN'),
    },
    {
      id: 'actions',
      header: '操作',
      cell: ({ row }) => {
        const user = row.original
        return (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-8 w-8 p-0">
                <span className="sr-only">打开菜单</span>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>操作</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => openEditModal(user)}>
                <Coins className="mr-2 h-4 w-4" />
                调整积分
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openPasswordModal(user)}>
                <KeyRound className="mr-2 h-4 w-4" />
                修改密码
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleToggleRole(user)}>
                <UserCog className="mr-2 h-4 w-4" />
                {user.role === 'admin' ? '设为普通用户' : '设为管理员'}
              </DropdownMenuItem>
              {user.role !== 'admin' && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleToggleActive(user.id)}>
                    {user.is_active ? (
                      <>
                        <ShieldOff className="mr-2 h-4 w-4" />
                        禁用用户
                      </>
                    ) : (
                      <>
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        启用用户
                      </>
                    )}
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )
      },
    },
  ], [])

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">用户管理</CardTitle>
        </CardHeader>
        <CardContent>
          <DataTable
            columns={columns}
            data={users}
            searchPlaceholder="搜索用户名..."
            searchColumn="username"
            pageSize={10}
            toolbar={
              <Button onClick={() => setCreateOpen(true)}>
                <UserPlus className="mr-2 h-4 w-4" />
                创建用户
              </Button>
            }
          />
        </CardContent>
      </Card>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>创建新用户</DialogTitle>
            <DialogDescription>填写以下信息创建新的用户账号。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-username" className="after:ml-0.5 after:text-red-500 after:content-['*']">
                  用户名
                </Label>
                <Input
                  id="create-username"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="create-password" className="after:ml-0.5 after:text-red-500 after:content-['*']">
                  密码
                </Label>
                <Input
                  id="create-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="create-group">权限组</Label>
              <Select
                value={newGroupId || undefined}
                onValueChange={(value: string | null) => setNewGroupId(value || '0')}
              >
                <SelectTrigger id="create-group">
                  <SelectValue placeholder="选择权限组" />
                </SelectTrigger>
                <SelectContent>
                  {groups.map((g) => (
                    <SelectItem key={g.id} value={String(g.id)}>
                      {g.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">选择权限组后，用户将自动获得该组的初始积分</p>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="create-role">角色</Label>
              <Select
                value={newRole}
                onValueChange={(value: string) => setNewRole(value)}
              >
                <SelectTrigger id="create-role">
                  <SelectValue placeholder="选择角色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">普通用户</SelectItem>
                  <SelectItem value="admin">管理员</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button onClick={handleCreateUser} disabled={!newUsername.trim() || !newPassword.trim()}>
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>调整积分</DialogTitle>
            <DialogDescription>修改该用户的创作积分和项目积分余额（永久积分，不会过期）。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-creative-credits" className="flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-blue-500" />
                创作积分
              </Label>
              <Input
                id="edit-creative-credits"
                type="number"
                min="0"
                value={editCreativeCredits}
                onChange={(e) => setEditCreativeCredits(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="edit-project-credits" className="flex items-center gap-1.5">
                <Coins className="h-3.5 w-3.5 text-green-500" />
                项目积分
              </Label>
              <Input
                id="edit-project-credits"
                type="number"
                min="0"
                value={editProjectCredits}
                onChange={(e) => setEditProjectCredits(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              取消
            </Button>
            <Button onClick={handleUpdateCredits}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改密码</DialogTitle>
            <DialogDescription>为用户「{passwordUsername}」设置新密码。</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="new-password-value" className="flex items-center gap-1.5">
                <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                新密码
              </Label>
              <Input
                id="new-password-value"
                type="password"
                placeholder="输入新密码（至少4位）"
                value={newPasswordValue}
                onChange={(e) => setNewPasswordValue(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordOpen(false)}>
              取消
            </Button>
            <Button onClick={handleResetPassword} disabled={!newPasswordValue.trim() || newPasswordValue.length < 4}>
              确认修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={roleConfirmOpen} onOpenChange={setRoleConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认切换角色</AlertDialogTitle>
            <AlertDialogDescription>
              确定将用户「{roleConfirmUser?.username}」的角色切换为「{roleConfirmUser?.role === 'admin' ? '普通用户' : '管理员'}」吗？
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={confirmToggleRole}>确认</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
