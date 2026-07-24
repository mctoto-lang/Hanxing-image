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

export function shouldShowBottomSkeletons({
  visibleCount,
  totalCards,
}: {
  visibleCount: number
  totalCards: number
}) {
  return visibleCount < totalCards
}

export function getBottomSkeletonCount({
  gridColumns,
  shouldShow,
}: {
  gridColumns: number
  shouldShow: boolean
}) {
  return shouldShow ? gridColumns : 0
}

export function getBottomSkeletonIndexes({
  visibleCards,
  skeletonCount,
}: {
  visibleCards: PromptCard[]
  skeletonCount: number
}) {
  if (skeletonCount <= 0) return []

  const lastVisibleCardIndex = visibleCards[visibleCards.length - 1]?.card_index ?? 0

  return Array.from({ length: skeletonCount }, (_, index) => lastVisibleCardIndex + index + 1)
}

function CardSkeleton({ indexLabel }: { indexLabel?: number }) {
  return (
    <div
      className="relative rounded-2xl border border-border/60 bg-card/60 overflow-hidden"
      style={{ aspectRatio: '3/5' }}
    >
      <Skeleton className="absolute inset-0 rounded-2xl" />
      {typeof indexLabel === 'number' && (
        <div className="absolute bottom-2.5 left-2.5 flex gap-1">
          <span className="animate-placeholder-breathe rounded-full bg-black/12 px-2 py-0.5 text-[10px] font-medium text-foreground/28 select-none">
            #{indexLabel}
          </span>
        </div>
      )}
    </div>
  )
}

interface CardGridProps {
  taskId: number | null
  cards: PromptCard[]
  cardImagesMap: Map<number, CardImage[]>
  batchMode: boolean
  selectedCardIds: Set<number>
  flipAllToImage: boolean
  selectedDeepenTemplate: Template | null
  selectedRegenTemplate: Template | null
  selectedTranslateTemplate: Template | null
  selectedImageModel: ImageModel | null
  selectedSize: string | null
  onToggleSelect: (id: number) => void
  onCardUpdated: (card: PromptCard) => void
  onAddCard: (prompt: string) => void
  onCardGeneratingImage?: (id: number, generating: boolean) => void
  // 外部批量操作加载状态
  batchDeepeningCardIds?: Set<number>
  batchRegeneratingCardIds?: Set<number>
  batchTranslatingCardIds?: Set<number>
  batchGeneratingImageCardIds?: Set<number>
}

export function getNextVisibleCountOnDataChange({
  previousVisibleCount,
  nextCardsLength,
  didTaskChange,
}: {
  previousVisibleCount: number
  nextCardsLength: number
  didTaskChange: boolean
}) {
  if (didTaskChange) {
    return Math.min(INITIAL_VISIBLE_COUNT, nextCardsLength || INITIAL_VISIBLE_COUNT)
  }

  if (nextCardsLength <= 0) {
    return INITIAL_VISIBLE_COUNT
  }

  if (nextCardsLength < previousVisibleCount) {
    return nextCardsLength
  }

  return previousVisibleCount
}

export default memo(function WorkspaceCardGrid({
  taskId,
  cards,
  cardImagesMap,
  batchMode,
  selectedCardIds,
  flipAllToImage,
  selectedDeepenTemplate,
  selectedRegenTemplate,
  selectedTranslateTemplate,
  selectedImageModel,
  selectedSize,
  onToggleSelect,
  onCardUpdated,
  onAddCard,
  onCardGeneratingImage,
  batchDeepeningCardIds = EMPTY_SET,
  batchRegeneratingCardIds = EMPTY_SET,
  batchTranslatingCardIds = EMPTY_SET,
  batchGeneratingImageCardIds = EMPTY_SET,
}: CardGridProps) {
  const sentinelRef = useRef<HTMLDivElement | null>(null)
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE_COUNT)
  const [skeletonCount, setSkeletonCount] = useState(GRID_COLUMNS)
  const previousTaskIdRef = useRef<number | null>(taskId)

  useEffect(() => {
    const didTaskChange = previousTaskIdRef.current !== taskId
    previousTaskIdRef.current = taskId

    setVisibleCount(prev => getNextVisibleCountOnDataChange({
      previousVisibleCount: prev,
      nextCardsLength: cards.length,
      didTaskChange,
    }))
  }, [taskId, cards.length])

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
  const shouldShowLoadingSkeletons = shouldShowBottomSkeletons({
    visibleCount,
    totalCards: cards.length,
  })
  const bottomSkeletonCount = getBottomSkeletonCount({
    gridColumns: skeletonCount,
    shouldShow: shouldShowLoadingSkeletons,
  })
  const bottomSkeletonIndexes = useMemo(() => getBottomSkeletonIndexes({
    visibleCards,
    skeletonCount: bottomSkeletonCount,
  }), [visibleCards, bottomSkeletonCount])

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
            selectedTranslateTemplate={selectedTranslateTemplate}
            selectedImageModel={selectedImageModel}
            selectedSize={selectedSize}
            onToggleSelect={onToggleSelect}
            onCardUpdated={onCardUpdated}
            onCardGeneratingImage={onCardGeneratingImage}
            batchDeepening={batchDeepeningCardIds.has(card.id)}
            batchRegenerating={batchRegeneratingCardIds.has(card.id)}
            batchTranslating={batchTranslatingCardIds.has(card.id)}
            batchGeneratingImage={batchGeneratingImageCardIds.has(card.id)}
          />
        ))}
        {bottomSkeletonIndexes.map((indexLabel, index) => (
          <CardSkeleton key={`bottom-skeleton-${index}`} indexLabel={indexLabel} />
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
