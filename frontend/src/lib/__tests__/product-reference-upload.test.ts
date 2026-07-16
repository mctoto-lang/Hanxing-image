import { describe, expect, it } from 'vitest'
import { getReferenceUploadError, validateReferenceImages } from '../product-reference-upload'

describe('validateReferenceImages', () => {
  it('keeps valid PNG and JPEG files while reporting every invalid file', async () => {
    const files = [
      new File(['png'], 'valid.png', { type: 'image/png' }),
      new File(['webp'], 'unsupported.webp', { type: 'image/webp' }),
      new File([new Uint8Array(10 * 1024 * 1024 + 1)], 'oversize.jpg', { type: 'image/jpeg' }),
      new File(['large'], 'too-wide.jpg', { type: 'image/jpeg' }),
    ]

    const result = await validateReferenceImages(files, async (file) => {
      if (file.name === 'too-wide.jpg') return { width: 8193, height: 2000 }
      return { width: 2000, height: 1000 }
    })

    expect(result.validFiles).toEqual([files[0]])
    expect(result.errors).toEqual([
      'unsupported.webp：仅支持 PNG、JPG、JPEG 格式',
      'oversize.jpg：文件大小超过 10MB 限制',
      'too-wide.jpg：图片尺寸为 8193×2000，宽和高最大支持 8192px',
    ])
  })

  it('reports files that cannot be decoded as images', async () => {
    const file = new File(['invalid'], 'broken.jpg', { type: 'image/jpeg' })

    const result = await validateReferenceImages([file], async () => {
      throw new Error('decode failed')
    })

    expect(result.validFiles).toEqual([])
    expect(result.errors).toEqual(['broken.jpg：无法读取图片尺寸，请重新选择图片'])
  })
})

describe('getReferenceUploadError', () => {
  it('explains that a proxy rejected an oversized request', () => {
    expect(getReferenceUploadError(413, {})).toBe('图片文件超过 10MB 限制，请压缩后重试')
  })
})
