import { describe, expect, it, vi } from 'vitest'
import { copyText } from '../clipboard'

describe('copyText', () => {
  it('falls back to document copy when the Clipboard API rejects the request', async () => {
    const clipboard = { writeText: vi.fn().mockRejectedValue(new Error('NotAllowedError')) }
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: clipboard })
    const textarea = {
      value: '',
      style: {},
      setAttribute: vi.fn(),
      select: vi.fn(),
    }
    const execCommand = vi.fn().mockReturnValue(true)
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValue(textarea),
      body: { appendChild: vi.fn(), removeChild: vi.fn() },
      execCommand,
    })

    await expect(copyText('提示词')).resolves.toBe(true)
    expect(clipboard.writeText).toHaveBeenCalledWith('提示词')
    expect(execCommand).toHaveBeenCalledWith('copy')
    vi.unstubAllGlobals()
  })
})
