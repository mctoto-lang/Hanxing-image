import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface LoginFormProps extends React.ComponentProps<"div"> {
  username: string
  setUsername: (v: string) => void
  password: string
  setPassword: (v: string) => void
  error: string
  loading: boolean
  onSubmit: (e: React.FormEvent) => void
}

export function LoginForm({
  className,
  username,
  setUsername,
  password,
  setPassword,
  error,
  loading,
  onSubmit,
  ...props
}: LoginFormProps) {
  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">瀚星AI图片工作台</CardTitle>
          <CardDescription>请登录以继续</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="username">用户名</FieldLabel>
                <Input
                  id="username"
                  placeholder="请输入用户名"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="password">密码</FieldLabel>
                <Input
                  id="password"
                  type="password"
                  placeholder="请输入密码"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </Field>
              {error && (
                <p className="text-destructive text-sm text-center">{error}</p>
              )}
              <Field>
                <Button type="submit" disabled={loading}>
                  {loading ? '登录中...' : '登录'}
                </Button>
              </Field>
              <div className="text-center text-sm text-muted-foreground">
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger className="cursor-help">
                      没有账号？立即注册
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>未开放注册渠道，仅管理员可创建账号</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </FieldGroup>
          </form>
        </CardContent>
      </Card>
      <FieldDescription className="px-6 text-center">
        点击继续即表示您同意我们的<a href="#" className="underline underline-offset-4 hover:text-primary">服务条款</a>和<a href="#" className="underline underline-offset-4 hover:text-primary">隐私政策</a>。
      </FieldDescription>
    </div>
  )
}
