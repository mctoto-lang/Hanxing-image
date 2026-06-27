import { beforeEach, describe, expect, it, vi } from 'vitest'
import { uploadReferenceImages } from '../product-reference-upload'
import { apiFetch } from '../api'

vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    apiFetch: vi.fn(),
  }
})

describe('uploadReferenceImages', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('uploads files through reference-image endpoint and returns uploaded urls', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://cos.example.com/ref-1.jpg' })))
      .mockResolvedValueOnce(new Response(JSON.stringify({ url: 'https://cos.example.com/ref-2.jpg' })))

    const files = [
      new File(['file-1'], 'ref-1.jpg', { type: 'image/jpeg' }),
      new File(['file-2'], 'ref-2.jpg', { type: 'image/jpeg' }),
    ]

    const urls = await uploadReferenceImages(files)

    expect(urls).toEqual([
      'https://cos.example.com/ref-1.jpg',
      'https://cos.example.com/ref-2.jpg',
    ])
    expect(apiFetch).toHaveBeenCalledTimes(2)
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/upload/reference-image', {
      method: 'POST',
      body: expect.any(FormData),
    })
  })
})
