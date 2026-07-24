export interface ReferenceImageModel {
  supports_reference_image?: number | boolean | null
  max_reference_images?: number | null
}

export function normalizeReferenceImages(images: unknown): string[] {
  if (!Array.isArray(images)) return []
  return [...new Set(images.filter((image): image is string => typeof image === 'string').map(image => image.trim()).filter(Boolean))]
}

export function getReferenceImageLimit(model: ReferenceImageModel | null | undefined): number {
  if (!model?.supports_reference_image) return 0
  return Math.max(1, Math.floor(Number(model.max_reference_images) || 1))
}
