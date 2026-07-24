import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
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
  TooltipTrigger,
} from "@/components/ui/tooltip"

interface LoginFormProps extends React.ComponentProps<"form"> {
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
    <form
      className={cn("flex flex-col gap-6", className)}
      onSubmit={onSubmit}
      {...props}
    >
      <FieldGroup>
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-2xl font-bold">登录账号</h1>
          <p className="text-balance text-sm text-muted-foreground">
            请输入用户名和密码登录
          </p>
        </div>
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
          <div className="flex items-center">
            <FieldLabel htmlFor="password">密码</FieldLabel>
            <Tooltip>
              <TooltipTrigger
                type="button"
                className="ml-auto cursor-help text-sm underline-offset-4 hover:underline"
              >
                忘记密码？
              </TooltipTrigger>
              <TooltipContent>请联系管理员重置密码</TooltipContent>
            </Tooltip>
          </div>
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
          <p className="text-center text-sm text-destructive">{error}</p>
        )}
        <Field>
          <Button type="submit" disabled={loading}>
            {loading ? "登录中..." : "登录"}
          </Button>
        </Field>
        <FieldDescription className="text-center">
          <Tooltip>
            <TooltipTrigger
              type="button"
              className="cursor-help underline underline-offset-4 hover:text-primary"
            >
              没有账号？立即注册
            </TooltipTrigger>
            <TooltipContent>内部系统未开放注册</TooltipContent>
          </Tooltip>
        </FieldDescription>
      </FieldGroup>
    </form>
  )
}
