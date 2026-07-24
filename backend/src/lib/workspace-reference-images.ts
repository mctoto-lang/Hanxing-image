export function normalizeWorkspaceReferenceImages(value: unknown, maxCount: number): string[] {
  const images = Array.isArray(value) ? value : []
  const uniqueImages = [...new Set(images.filter((image): image is string => typeof image === 'string').map(image => image.trim()).filter(Boolean))]
  return uniqueImages.slice(0, Math.max(0, maxCount))
}

export function parseWorkspaceReferenceImages(value: unknown): string[] {
  if (Array.isArray(value)) return normalizeWorkspaceReferenceImages(value, Number.MAX_SAFE_INTEGER)
  if (typeof value !== 'string') return []
  try {
    return normalizeWorkspaceReferenceImages(JSON.parse(value), Number.MAX_SAFE_INTEGER)
  } catch {
    return []
  }
}
