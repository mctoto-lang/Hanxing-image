import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Plus } from 'lucide-react'
import WorkspaceFlipCard from './WorkspaceFlipCard'
import type { PromptCard, CardImage, Template, ImageModel } from '@/pages/WorkspacePage'
import { Skeleton } from '@/components/ui/skeleton'

const EMPTY_SET = new Set<number>()
const EMPTY_IMAGES: CardImage[] = []
const INITIAL_VISIBLE_COUNT = 16
const VISIBLE_STEP = 12
const GRID_COLUMNS = 4

function CardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className="relative rounded-2xl border border-border/60 bg-card/60 overflow-hidden"
      style={{ aspectRatio: '3/5' }}
    >
      <Skeleton className="absolute inset-0 rounded-2xl" />
      <div className="absolute inset-x-0 top-0 p-3 flex items-center justify-between">
        <Skeleton className="h-4 w-10 rounded-full bg-background/60" />
        <Skeleton className="h-6 w-14 rounded-lg bg-background/60" />
      </div>
      <div className="absolute inset-x-0 bottom-0 p-3 space-y-2">
        <Skeleton className="h-3 w-3/4 bg-background/60" />
        <Skeleton className="h-3 w-1/2 bg-background/60" />
      </div>
      {compact && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Skeleton className="h-10 w-10 rounded-full bg-background/60" />
        </div>
      )}
    </div>
  )
}

interface CardGridProps {
  cards: PromptCard[]
  cardImagesMap: Map<number, CardImage[]>
  batchMode: boolean
  selectedCardIds: Set<number>
  flipAllToImage: boolean
  selectedDeepenTemplate: Template | null
  selectedRegenTemplate: Template | null
  selectedImageModel: ImageModel | null
  selectedSize: string | null
  onToggleSelect: (id: number) => void
  onCardUpdated: (card: PromptCard) => void
  onCardDeleted: (id: number) => void
  onAddCard: (prompt: string) => void
  onCardGeneratingImage?: (id: number, generating: boolean) => void
  // 外部批量操作加载状态
  batchDeepeningCardIds?: Set<number>
  batchRegeneratingCardIds?: Set<number>
  batchGeneratingImageCardIds?: Set<number>
}

export default memo(function WorkspaceCardGrid({
  cards,
  cardImagesMap,
  batchMode,
  selectedCardIds,
  flipAllToImage,
  selectedDeepenTemplate,
  selectedRegenTemplate,
  selectedImageModel,
  selectedSize,
  onToggleSelect,
  onCardUpdated,
  onCardDeleted,
  onAddCard,
  onCardGeneratingImage,
  batchDeepeningCardIds = EMPTY_SET,
  batchRegeneratingCardIds = EMPTY_SET,
  batchGeneratingImageCardIds = EMPTY_SET,
}: CardGridProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT)
  const [skeletonCount, setSkeletonCount] = useState(GRID_COLUMNS)

  useEffect(() => {
    setVisibleCount(INITIAL_VISIBLE_COUNT)
  }, [cards])

  useEffect(() => {
    const updateSkeletonCount = () => {
      if (typeof window === 'undefined') return
      const width = window.innerWidth

      if (width < 640) {
        setSkeletonCount(1)
        return
      }

      if (width < 1024) {
        setSkeletonCount(2)
        return
      }

      if (width < 1280) {
        setSkeletonCount(3)
        return
      }

      setSkeletonCount(GRID_COLUMNS)
    }

    updateSkeletonCount()
    window.addEventListener('resize', updateSkeletonCount)
    return () => window.removeEventListener('resize', updateSkeletonCount)
  }, [])

  const hasMore = visibleCount < cards.length
  const visibleCards = useMemo(() => cards.slice(0, visibleCount), [cards, visibleCount])
  const remainingCount = cards.length - visibleCount
  const shouldShowLoadingSkeletons = hasMore && remainingCount <= VISIBLE_STEP

  const loadMore = useCallback(() => {
    setVisibleCount(prev => Math.min(prev + VISIBLE_STEP, cards.length))
  }, [cards.length])

  useEffect(() => {
    if (!hasMore) return
    const element = sentinelRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore()
      },
      { rootMargin: '1200px' }
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [hasMore, loadMore])

  return (
    <>
      {shouldShowLoadingSkeletons && visibleCount > INITIAL_VISIBLE_COUNT && (
        <div className="px-5 pt-4 pb-1">
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-border/70 bg-muted/25 px-3 py-2">
            <Skeleton className="h-2.5 w-2.5 rounded-full" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      )}
      <div
        className="grid gap-5 p-5"
        style={{ gridTemplateColumns: `repeat(${GRID_COLUMNS}, 1fr)` }}
      >
        {visibleCards.map(card => (
          <WorkspaceFlipCard
            key={card.id}
            card={card}
            images={cardImagesMap.get(card.id) || EMPTY_IMAGES}
            batchMode={batchMode}
            isSelected={selectedCardIds.has(card.id)}
            flipAllToImage={flipAllToImage}
            selectedDeepenTemplate={selectedDeepenTemplate}
            selectedRegenTemplate={selectedRegenTemplate}
            selectedImageModel={selectedImageModel}
            selectedSize={selectedSize}
            onToggleSelect={onToggleSelect}
            onCardUpdated={onCardUpdated}
            onCardDeleted={onCardDeleted}
            onCardGeneratingImage={onCardGeneratingImage}
            batchDeepening={batchDeepeningCardIds.has(card.id)}
            batchRegenerating={batchRegeneratingCardIds.has(card.id)}
            batchGeneratingImage={batchGeneratingImageCardIds.has(card.id)}
          />
        ))}
        {shouldShowLoadingSkeletons && Array.from({ length: skeletonCount }).map((_, index) => (
          <CardSkeleton key={`bottom-skeleton-${index}`} compact />
        ))}
        {/* 添加卡片按钮 */}
        <div
          className="relative rounded-2xl border-2 border-dashed border-border bg-muted/30 hover:bg-muted/50 hover:border-primary/40 transition-all duration-200 cursor-pointer flex items-center justify-center group"
          style={{ aspectRatio: '3/5' }}
          onClick={() => onAddCard('')}
        >
          <div className="flex flex-col items-center gap-2 text-muted-foreground group-hover:text-primary transition-colors">
            <Plus className="h-8 w-8" />
            <span className="text-xs">添加卡片</span>
          </div>
        </div>
      </div>
      {hasMore && (
        <div className="px-5 pb-5">
          <div ref={sentinelRef} className="h-1 w-full -mt-5" />
        </div>
      )}
    </>
  )
})
