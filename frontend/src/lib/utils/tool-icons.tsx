export function formatToolName(name: string): string {
  return name
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

export function getToolCategoryIcon(_category: string, _props?: Record<string, unknown>): null {
  return null
}
