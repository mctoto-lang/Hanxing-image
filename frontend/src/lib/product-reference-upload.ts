export interface ReferenceUploadProgress {
  uploadedCount: number
  totalCount: number
  percent: number
  currentFileName: string
}

interface UploadReferenceImagesOptions {
  onProgress?: (progress: ReferenceUploadProgress) => void
}

function getToken() {
  return localStorage.getItem('token')
}

function parseJsonSafely(text: string) {
  if (!text.trim()) return {}
  try {
    const parsed = JSON.parse(text)
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function uploadSingleReferenceImage(
  file: File,
  onFileProgress?: (percent: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', '/api/upload/reference-image')

    const token = getToken()
    if (token) {
      xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    }

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return
      onFileProgress?.(Math.round((event.loaded / event.total) * 100))
    }

    xhr.onerror = () => reject(new Error('参考图上传失败'))
    xhr.onabort = () => reject(new Error('参考图上传已取消'))
    xhr.onload = () => {
      const data = parseJsonSafely(xhr.responseText)
      if (xhr.status === 401) {
        localStorage.removeItem('token')
        localStorage.removeItem('username')
        localStorage.removeItem('userRole')
        localStorage.removeItem('userCredits')
        localStorage.removeItem('userCreativeCredits')
        localStorage.removeItem('userProjectCredits')
        window.location.href = '/login'
        reject(new Error('登录已失效，请重新登录'))
        return
      }
      if (xhr.status < 200 || xhr.status >= 300) {
        reject(new Error((data.error as string) || '参考图上传失败'))
        return
      }
      if (typeof data.url !== 'string' || !data.url) {
        reject(new Error('参考图上传失败'))
        return
      }
      onFileProgress?.(100)
      resolve(data.url)
    }

    const formData = new FormData()
    formData.append('image', file)
    xhr.send(formData)
  })
}

export async function uploadReferenceImages(
  files: File[],
  options: UploadReferenceImagesOptions = {},
): Promise<string[]> {
  const totalCount = files.length
  const urls: string[] = []

  for (const [index, file] of files.entries()) {
    const url = await uploadSingleReferenceImage(file, (filePercent) => {
      const percent = Math.round(((index + filePercent / 100) / totalCount) * 100)
      options.onProgress?.({
        uploadedCount: index,
        totalCount,
        percent,
        currentFileName: file.name,
      })
    })

    urls.push(url)
    options.onProgress?.({
      uploadedCount: index + 1,
      totalCount,
      percent: Math.round(((index + 1) / totalCount) * 100),
      currentFileName: file.name,
    })
  }

  return urls
}
