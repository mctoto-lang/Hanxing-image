import { describe, expect, it } from 'vitest'

import type { PromptCard } from '@/pages/WorkspacePage'
import { getBatchGenerationLanguageSummary } from '@/pages/WorkspacePage'

function createCard(overrides: Partial<PromptCard> = {}): PromptCard {
  return {
    id: 1,
    task_id: 1,
    card_index: 1,
    prompt: '中文提示词',
    selected_image_id: null,
    sel_img_id: null,
    sel_img_url: null,
    sel_img_model_name: null,
    sel_img_size: null,
    created_at: '2026-07-22T00:00:00.000Z',
    updated_at: '2026-07-22T00:00:00.000Z',
    ...overrides,
  }
}

describe('批量生图语言选择', () => {
  it('默认中文优先，并识别同时具备有效中英文内容的卡片', () => {
    const summary = getBatchGenerationLanguageSummary([
      createCard({
        translated_prompt: 'English prompt',
        translation_source_prompt: '中文提示词',
        translation_status: 'synced',
      }),
      createCard({ id: 2 }),
    ], 'zh')

    expect(summary.requiresLanguageSelection).toBe(true)
    expect(summary.primaryCount).toBe(2)
    expect(summary.fallbackCount).toBe(0)
  })

  it('英文优先时使用已有英文译文，即使译文已过期', () => {
    const summary = getBatchGenerationLanguageSummary([
      createCard({
        translated_prompt: 'English prompt',
        translation_source_prompt: '中文提示词',
        translation_status: 'synced',
      }),
      createCard({
        id: 2,
        translated_prompt: 'Outdated English prompt',
        translation_source_prompt: '旧中文提示词',
        translation_status: 'outdated',
      }),
    ], 'en')

    expect(summary.requiresLanguageSelection).toBe(true)
    expect(summary.primaryCount).toBe(2)
    expect(summary.fallbackCount).toBe(0)
  })
})
