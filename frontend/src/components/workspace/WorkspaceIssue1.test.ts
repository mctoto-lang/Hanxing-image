import { describe, expect, it } from 'vitest'

import type { CardImage, PromptCard } from '@/pages/WorkspacePage'

import { mergeCardsWithImageSummary } from '@/pages/WorkspacePage'
import { getNextVisibleCountOnDataChange } from './WorkspaceCardGrid'
import { shouldAutoFlipToImage } from './WorkspaceFlipCard'
import { getBottomSkeletonCount, getBottomSkeletonIndexes, shouldShowBottomSkeletons } from './WorkspaceCardGrid'

function createCard(overrides: Partial<PromptCard> = {}): PromptCard {
  return {
    id: 1,
    task_id: 1,
    card_index: 1,
    prompt: 'prompt',
    selected_image_id: 10,
    sel_img_id: 10,
    sel_img_url: 'https://example.com/existing.jpg',
    sel_img_model_name: 'model-a',
    sel_img_size: '1024x1024',
    sel_img_started_at: '2026-06-26T10:00:00.000Z',
    sel_img_completed_at: '2026-06-26T10:01:00.000Z',
    sel_img_created_at: '2026-06-26T10:01:00.000Z',
    created_at: '2026-06-26T10:00:00.000Z',
    updated_at: '2026-06-26T10:01:00.000Z',
    ...overrides,
  }
}

function createImage(overrides: Partial<CardImage> = {}): CardImage {
  return {
    id: 10,
    card_id: 1,
    image_api_id: 1,
    image_url: 'https://example.com/generated.jpg',
    model_name: 'model-b',
    size: '1024x1024',
    format: 'png',
    status: 'completed',
    error_message: null,
    is_selected: 1,
    generation_started_at: '2026-06-26T10:02:00.000Z',
    generation_completed_at: '2026-06-26T10:03:00.000Z',
    created_at: '2026-06-26T10:03:00.000Z',
    ...overrides,
  }
}

describe('workspace issue 1', () => {
  it('keeps previously loaded selected image fields when refreshed summary has no selected image', () => {
    const currentCards = [createCard()]
    const fetchedCards = [createCard({ sel_img_url: null, sel_img_id: null, selected_image_id: null })]

    const merged = mergeCardsWithImageSummary(fetchedCards, {
      cards: {
        1: {
          card_id: 1,
          pending_count: 1,
          completed_count: 1,
          failed_count: 0,
          selected_image: null,
          images: [createImage()],
        },
      },
    }, currentCards)

    expect(merged[0].sel_img_url).toBe('https://example.com/existing.jpg')
    expect(merged[0].selected_image_id).toBe(10)
    expect(merged[0].sel_img_model_name).toBe('model-a')
  })

  it('still updates selected image fields when refreshed summary provides a new selected image', () => {
    const currentCards = [createCard()]
    const fetchedCards = [createCard({ sel_img_url: null, sel_img_id: null, selected_image_id: null })]

    const merged = mergeCardsWithImageSummary(fetchedCards, {
      cards: {
        1: {
          card_id: 1,
          pending_count: 0,
          completed_count: 2,
          failed_count: 0,
          selected_image: {
            id: 11,
            image_url: 'https://example.com/new.jpg',
            model_name: 'model-c',
            size: '2048x2048',
            started_at: '2026-06-26T10:04:00.000Z',
            completed_at: '2026-06-26T10:05:00.000Z',
            created_at: '2026-06-26T10:05:00.000Z',
          },
          images: [createImage({ id: 11, image_url: 'https://example.com/new.jpg' })],
        },
      },
    }, currentCards)

    expect(merged[0].sel_img_url).toBe('https://example.com/new.jpg')
    expect(merged[0].selected_image_id).toBe(11)
    expect(merged[0].sel_img_model_name).toBe('model-c')
  })

  it('does not auto flip to image side while user is editing the prompt', () => {
    expect(shouldAutoFlipToImage({
      hasDisplayImage: true,
      displayImageChanged: true,
      isEditingPrompt: true,
      isManuallyFlippedToBack: true,
    })).toBe(false)
  })

  it('auto flips to image side when a new image arrives and user is not editing', () => {
    expect(shouldAutoFlipToImage({
      hasDisplayImage: true,
      displayImageChanged: true,
      isEditingPrompt: false,
      isManuallyFlippedToBack: false,
    })).toBe(true)
  })

  it('keeps current visible count during polling updates within the same task', () => {
    expect(getNextVisibleCountOnDataChange({
      previousVisibleCount: 52,
      nextCardsLength: 55,
      didTaskChange: false,
    })).toBe(52)
  })

  it('resets visible count when switching to a new task', () => {
    expect(getNextVisibleCountOnDataChange({
      previousVisibleCount: 52,
      nextCardsLength: 55,
      didTaskChange: true,
    })).toBe(16)
  })

  it('shrinks visible count only when cards length becomes smaller than current visible count', () => {
    expect(getNextVisibleCountOnDataChange({
      previousVisibleCount: 52,
      nextCardsLength: 40,
      didTaskChange: false,
    })).toBe(40)
  })

  it('shows bottom loading skeletons whenever there are still cards not yet loaded', () => {
    expect(shouldShowBottomSkeletons({
      visibleCount: 16,
      totalCards: 80,
    })).toBe(true)
  })

  it('does not show bottom loading skeletons when all cards are already visible', () => {
    expect(shouldShowBottomSkeletons({
      visibleCount: 24,
      totalCards: 24,
    })).toBe(false)
  })

  it('matches bottom skeleton count to current grid columns', () => {
    expect(getBottomSkeletonCount({ gridColumns: 4, shouldShow: true })).toBe(4)
    expect(getBottomSkeletonCount({ gridColumns: 2, shouldShow: true })).toBe(2)
  })

  it('does not render bottom skeletons when loading indicator should stay hidden', () => {
    expect(getBottomSkeletonCount({ gridColumns: 4, shouldShow: false })).toBe(0)
  })

  it('derives skeleton numbers from the last visible card index', () => {
    const cards = Array.from({ length: 40 }, (_, index) => createCard({
      id: index + 1,
      card_index: index + 1,
    }))

    expect(getBottomSkeletonIndexes({
      visibleCards: cards.slice(0, 28),
      skeletonCount: 4,
    })).toEqual([29, 30, 31, 32])
  })

  it('returns no skeleton numbers when there are no skeleton cards to render', () => {
    expect(getBottomSkeletonIndexes({
      visibleCards: [createCard({ card_index: 28 })],
      skeletonCount: 0,
    })).toEqual([])
  })

  it('continues from the real last card index instead of visible count', () => {
    expect(getBottomSkeletonIndexes({
      visibleCards: [
        createCard({ id: 101, card_index: 12 }),
        createCard({ id: 102, card_index: 18 }),
        createCard({ id: 103, card_index: 28 }),
      ],
      skeletonCount: 3,
    })).toEqual([29, 30, 31])
  })
})
