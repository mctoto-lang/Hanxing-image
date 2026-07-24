export type ImageApiFormat = 'grs' | 'jimeng'
export type GrsModelFamily = 'gpt' | 'gemini'

export const DEFAULT_IMAGE_API_FORMAT: ImageApiFormat = 'grs'
export const DEFAULT_REFERENCE_IMAGE_FIELD = 'images'

export interface ImageModelConfigInput {
  api_format?: unknown
  extra_config?: unknown
}

export interface GrsExtraConfig {
  grs_model_family: GrsModelFamily
  reply_type?: 'json' | 'async'
  image_size_grs?: '1K' | '2K' | '4K'
}

interface BuildGrsRequestInput {
  model: string
  prompt: string
  imageSize: string
  extraConfig: GrsExtraConfig
  referenceImages: string[]
  referenceImageField?: string
}

interface GenerationCapabilities {
  api_format?: unknown
  extra_config?: unknown
  supports_reference_image?: unknown
  max_reference_images?: unknown
  supported_sizes?: unknown
}

interface BuildJimengRequestInput {
  model: string
  prompt: string
  ratio: string
  resolution: string
  count: number
  referenceImages: string[]
  referenceImageField?: string
}

interface BuildImageRequestSummaryInput {
  referenceImages: string[]
  referenceImageField?: string
  modelFamily?: string | null
  imageSize: string
}

export interface BuildImageLogRequestParamsInput extends BuildImageRequestSummaryInput {
  source: string
  sourceLabel: string
  taskType: string
  model: string
  prompt: string
  format: ImageApiFormat
}

const FORMATS = new Set<ImageApiFormat>(['grs', 'jimeng'])
const GRS_FIELDS = new Set(['grs_model_family', 'reply_type', 'image_size_grs'])
const JIMENG_FIELDS = new Set(['jimeng_resolution', 'jimeng_n'])

function parseExtraConfig(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null || value === '') return {}
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
      return parsed
    } catch {
      throw new Error('extra_config 必须是有效的 JSON 对象')
    }
  }
  if (typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>
  throw new Error('extra_config 必须是有效的 JSON 对象')
}

function rejectUnsupportedFields(config: Record<string, unknown>, allowed: Set<string>) {
  const unsupported = Object.keys(config).filter(key => !allowed.has(key))
  if (unsupported.length > 0) throw new Error(`当前接口格式不支持配置字段：${unsupported.join(', ')}`)
}

export function isLegacyImageApiFormat(value: unknown): boolean {
  return !FORMATS.has(value as ImageApiFormat)
}

export function getLegacyImageModelMigration(value: unknown) {
  if (!isLegacyImageApiFormat(value)) return null
  return {
    api_format: 'grs' as const,
    extra_config: JSON.stringify({ grs_model_family: value === 'gemini' ? 'gemini' : 'gpt' }),
    is_active: 0,
    visible_in_generate: 0,
    visible_in_canvas: 0,
    visible_in_workspace: 0,
    visible_in_product: 0,
  }
}

export function assertSupportedImageApiFormat(value: unknown): ImageApiFormat {
  if (!FORMATS.has(value as ImageApiFormat)) throw new Error(`不支持的图片接口格式：${String(value)}`)
  return value as ImageApiFormat
}

function parseSupportedSizes(value: unknown): Set<string> {
  let parsed = value
  if (typeof value === 'string') {
    try { parsed = JSON.parse(value) } catch { return new Set() }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return new Set()
  const ratios = (parsed as { ratios?: unknown }).ratios
  if (!Array.isArray(ratios)) return new Set()
  return new Set(ratios.flatMap(item => {
    if (!item || typeof item !== 'object') return []
    const { width, height } = item as { width?: unknown; height?: unknown }
    return Number(width) > 0 && Number(height) > 0 ? [`${Number(width)}x${Number(height)}`] : []
  }))
}

export function validateGenerationCapabilities(model: GenerationCapabilities, referenceImages: unknown, imageSize: unknown): string[] {
  const images = Array.isArray(referenceImages)
    ? [...new Set(referenceImages.filter((item): item is string => typeof item === 'string').map(item => item.trim()).filter(Boolean))]
    : []
  if (images.length > 0 && !model.supports_reference_image) throw new Error('当前模型不支持参考图')
  const maxCount = Math.max(1, Number(model.max_reference_images) || 1)
  if (images.length > maxCount) throw new Error(`当前模型最多支持 ${maxCount} 张参考图`)
  const sizes = parseSupportedSizes(model.supported_sizes)
  const size = typeof imageSize === 'string' ? imageSize.trim() : ''
  if (sizes.size > 0 && !sizes.has(size)) throw new Error(`当前模型不支持尺寸 ${size}`)
  return images
}

export function validateQueuedGeneration(model: GenerationCapabilities, referenceImages: unknown, imageSize: unknown): string[] {
  validateImageModelConfig(model)
  return validateGenerationCapabilities(model, referenceImages, imageSize)
}

export function validateImageModelConfig(input: ImageModelConfigInput): void {
  const format = input.api_format
  if (isLegacyImageApiFormat(format)) throw new Error('图片模型仅支持 grs 和 jimeng 接口格式')
  const config = parseExtraConfig(input.extra_config)

  if (format === 'grs') {
    rejectUnsupportedFields(config, GRS_FIELDS)
    if (config.grs_model_family !== 'gpt' && config.grs_model_family !== 'gemini') {
      throw new Error('请选择有效的 GRS 模型族：gpt 或 gemini')
    }
    if (config.reply_type !== undefined && config.reply_type !== 'json' && config.reply_type !== 'async') {
      throw new Error('reply_type 仅支持 json 或 async')
    }
    if (config.image_size_grs !== undefined && !['1K', '2K', '4K'].includes(String(config.image_size_grs))) {
      throw new Error('image_size_grs 仅支持 1K、2K 或 4K')
    }
    if (config.grs_model_family === 'gpt' && config.image_size_grs !== undefined) {
      throw new Error('GPT 模型族不支持 image_size_grs')
    }
    return
  }

  rejectUnsupportedFields(config, JIMENG_FIELDS)
  if (config.jimeng_resolution !== undefined && !['1k', '2k', '4k'].includes(String(config.jimeng_resolution))) {
    throw new Error('jimeng_resolution 仅支持 1k、2k 或 4k')
  }
  if (config.jimeng_n !== undefined && (!Number.isInteger(config.jimeng_n) || Number(config.jimeng_n) < 1 || Number(config.jimeng_n) > 4)) {
    throw new Error('jimeng_n 必须是 1 到 4 的整数')
  }
}

function sizeToRatio(size: string): string {
  const match = size.match(/^(\d+)x(\d+)$/i)
  if (!match) return '1:1'
  const width = Number(match[1])
  const height = Number(match[2])
  const gcd = (a: number, b: number): number => b === 0 ? a : gcd(b, a % b)
  const divisor = gcd(width, height)
  return `${width / divisor}:${height / divisor}`
}

export function buildGrsRequestBody(input: BuildGrsRequestInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    aspectRatio: input.extraConfig.grs_model_family === 'gpt' ? input.imageSize : sizeToRatio(input.imageSize),
    replyType: input.extraConfig.reply_type || 'json',
  }
  if (input.extraConfig.grs_model_family === 'gemini' && input.extraConfig.image_size_grs) {
    body.imageSize = input.extraConfig.image_size_grs
  }
  if (input.referenceImages.length > 0) {
    const field = input.referenceImageField?.trim() || DEFAULT_REFERENCE_IMAGE_FIELD
    body[field] = input.referenceImages
  }
  return body
}

export function buildJimengRequestBody(input: BuildJimengRequestInput): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: input.model,
    prompt: input.prompt,
    ratio: input.ratio,
    resolution: input.resolution,
    n: input.count,
  }
  if (input.referenceImages.length > 0) {
    const field = input.referenceImageField?.trim() || DEFAULT_REFERENCE_IMAGE_FIELD
    body[field] = input.referenceImages
  }
  return body
}

export function buildImageRequestSummary(input: BuildImageRequestSummaryInput) {
  return {
    has_reference_images: input.referenceImages.length > 0,
    reference_image_count: input.referenceImages.length,
    reference_image_field: input.referenceImageField?.trim() || DEFAULT_REFERENCE_IMAGE_FIELD,
    model_family: input.modelFamily || null,
    image_size: input.imageSize,
  }
}

export function buildImageLogRequestParams(input: BuildImageLogRequestParamsInput) {
  return {
    source: input.source,
    source_label: input.sourceLabel,
    task_type: input.taskType,
    model: input.model,
    prompt: input.prompt,
    size: input.imageSize,
    format: input.format,
    ...buildImageRequestSummary(input),
  }
}

export function buildImageResponseSummary(imageUrls: string[]): { imageCount: number; imageUrls: string[] } {
  return { imageCount: imageUrls.length, imageUrls: imageUrls.slice(0, 10) }
}
