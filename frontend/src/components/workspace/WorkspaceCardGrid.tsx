import { memo } from 'react'
import { Plus } from 'lucide-react'
import WorkspaceFlipCard from './WorkspaceFlipCard'
import type { PromptCard, CardImage, Template, ImageModel } from '@/pages/WorkspacePage'

const EMPTY_SET = new Set<number>()
const EMPTY_IMAGES: CardImage[] = []

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
  return (
    <>
      <div
        className="grid gap-5 p-5"
        style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}
      >
        {cards.map(card => (
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
    </>
  )
})
