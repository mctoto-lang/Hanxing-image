const MAX_CUSTOM_CARDS = 100
const MAX_BATCH_CARDS = 100
const MAX_BATCH_IMAGES = 20
const MAX_BATCH_ATTACHMENTS = 500

function normalizeStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [...new Set(values.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean))]
}

export function validateCustomTaskRequest(body: Record<string, unknown>) {
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  const prompt = typeof body.theme_prompt === 'string' ? body.theme_prompt.trim() : ''
  const cardCount = Number(body.card_count)
  const imageUrls = normalizeStrings(body.reference_image_urls)
  if (!title || !prompt) throw new Error('任务标题和长提示词不能为空')
  if (!Number.isInteger(cardCount) || cardCount < 1 || cardCount > MAX_CUSTOM_CARDS) throw new Error(`创建卡片数量必须为 1 到 ${MAX_CUSTOM_CARDS} 的整数`)
  return { title, prompt, cardCount, imageUrls }
}

export function normalizeBatchImageRequest(rawCardIds: unknown, rawImageUrls: unknown) {
  const cardIds = Array.isArray(rawCardIds)
    ? [...new Set(rawCardIds.map(Number).filter(value => Number.isInteger(value) && value > 0))]
    : []
  const imageUrls = normalizeStrings(rawImageUrls)
  if (!cardIds.length) throw new Error('至少选择一张卡片')
  if (!imageUrls.length) throw new Error('至少上传一张图片')
  if (cardIds.length > MAX_BATCH_CARDS) throw new Error(`单次最多选择 ${MAX_BATCH_CARDS} 张卡片`)
  if (imageUrls.length > MAX_BATCH_IMAGES) throw new Error(`单次最多上传 ${MAX_BATCH_IMAGES} 张图片`)
  if (cardIds.length * imageUrls.length > MAX_BATCH_ATTACHMENTS) throw new Error(`单次最多写入 ${MAX_BATCH_ATTACHMENTS} 条图片记录`)
  return { cardIds, imageUrls }
}
