import { apiFetch, safeResponseJson } from './api'

export async function uploadReferenceImages(files: File[]): Promise<string[]> {
  const urls: string[] = []

  for (const file of files) {
    const formData = new FormData()
    formData.append('image', file)

    const res = await apiFetch('/api/upload/reference-image', {
      method: 'POST',
      body: formData,
    })

    const data = await safeResponseJson(res)
    if (!res.ok) {
      throw new Error((data.error as string) || '参考图上传失败')
    }

    if (typeof data.url !== 'string' || !data.url) {
      throw new Error('参考图上传失败')
    }

    urls.push(data.url)
  }

  return urls
}
