// 统一的 API 请求工具：自动携带 token，并在 401 时统一处理（清除登录态并跳转登录页）

let onUnauthorized: (() => void) | null = null

// 注册 401 回调（由 App 层注入，避免 lib 层直接依赖 router）
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

function getToken(): string | null {
  return localStorage.getItem('token')
}

function handleUnauthorized() {
  localStorage.removeItem('token')
  localStorage.removeItem('username')
  localStorage.removeItem('userRole')
  localStorage.removeItem('userCredits')
  localStorage.removeItem('userCreativeCredits')
  localStorage.removeItem('userProjectCredits')
  if (onUnauthorized) {
    onUnauthorized()
  } else {
    // 兜底：直接跳转
    window.location.href = '/login'
  }
}

export interface ApiFetchOptions extends Omit<RequestInit, 'body'> {
  // 是否跳过 401 自动处理（少数场景需要自行处理 401，例如登录接口本身）
  skipAuthRedirect?: boolean
  // body 支持普通对象（自动 JSON 序列化）、FormData、BodyInit
  body?: BodyInit | object | null
}

export async function apiFetch(input: string, options: ApiFetchOptions = {}): Promise<Response> {
  const { skipAuthRedirect, headers, body, ...rest } = options
  const token = getToken()

  const finalHeaders = new Headers(headers || {})
  if (token) {
    finalHeaders.set('Authorization', `Bearer ${token}`)
  }

  let finalBody: BodyInit | null | undefined = body as BodyInit | null | undefined
  // 若 body 是普通对象（非 FormData/Blob/ArrayBuffer 等），自动 JSON 序列化
  if (body && typeof body === 'object' && !(body instanceof FormData) && !(body instanceof Blob) && !(body instanceof ArrayBuffer) && !(body instanceof ReadableStream) && !ArrayBuffer.isView(body) && !(body instanceof URLSearchParams)) {
    if (!finalHeaders.has('Content-Type')) {
      finalHeaders.set('Content-Type', 'application/json')
    }
    finalBody = JSON.stringify(body)
  }

  const res = await fetch(input, { ...rest, body: finalBody, headers: finalHeaders })

  if (res.status === 401 && !skipAuthRedirect) {
    handleUnauthorized()
  }

  return res
}

// 便捷方法：直接返回 JSON
export async function apiGetJson<T = unknown>(url: string, options?: ApiFetchOptions): Promise<T> {
  const res = await apiFetch(url, { ...options, method: 'GET' })
  return res.json() as Promise<T>
}

export async function apiPostJson<T = unknown>(url: string, body?: unknown, options?: ApiFetchOptions): Promise<T> {
  const res = await apiFetch(url, { ...options, method: 'POST', body: body as ApiFetchOptions['body'] })
  return res.json() as Promise<T>
}

/**
 * 安全地解析 Response 的 JSON 内容。
 * 当响应体为空或不是合法 JSON 时（例如 404 空响应），返回 {} 而不是抛出
 * "Failed to execute 'json' on 'Response': Unexpected end of JSON input"。
 */
export async function safeResponseJson(res: Response): Promise<Record<string, unknown>> {
  const text = await res.text()
  if (!text.trim()) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}
