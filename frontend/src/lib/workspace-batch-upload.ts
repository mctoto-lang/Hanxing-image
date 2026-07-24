type GalleryMode = 'selected' | 'reference'

export function canShowWorkspaceBatchActions(hasGeneratingCard: boolean, selectedCount: number) {
  return {
    showDeleteOnly: selectedCount > 0 && hasGeneratingCard,
    showActions: selectedCount > 0 && !hasGeneratingCard,
  }
}

export function getInitialGalleryMode(requestedMode: GalleryMode, referenceLimit: number): GalleryMode {
  return requestedMode === 'reference' && referenceLimit > 0 ? 'reference' : 'selected'
}
