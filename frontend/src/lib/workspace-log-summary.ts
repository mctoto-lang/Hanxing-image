/**
 * 将绘图日志的 response_body 转换为摘要字符串，不含 URL。
 * 对话日志的 response_body 是纯文本，原样返回。
 */
export function summarizeImageResponseBody(body: string | null | undefined): string | null {
  if (!body) return null

  try {
    const parsed = JSON.parse(body)
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      typeof parsed.imageCount === 'number'
    ) {
      return `生成 ${parsed.imageCount} 张图片`
    }
  } catch {
    // 非 JSON，视为对话文本
  }

  return body
}
