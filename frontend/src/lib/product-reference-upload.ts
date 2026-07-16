export interface ReferenceUploadProgress {
  uploadedCount: number
  totalCount: number
  percent: number
  currentFileName: string
}

export interface ReferenceUploadResult {
  uploads: Array<{ file: File; url: string }>
  errors: string[]
}

const MAX_FILE_SIZE = 10 * 1024 * 1024
const MAX_IMAGE_DIMENSION = 8192
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg'])
const ALLOWED_EXTENSIONS = new Set(['png', 'jpg', 'jpeg'])

interface UploadReferenceImagesOptions {
  onProgress?: (progress: ReferenceUploadProgress) => void
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const image = new Image()
    image.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: image.naturalWidth, height: image.naturalHeight })
    }
    image.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('decode failed'))
    }
    image.src = url
  })
}

export async function validateReferenceImages(
  files: File[],
  getImageDimensions: (file: File) => Promise<{ width: number; height: number }> = readImageDimensions,
): Promise<{ validFiles: File[]; errors: string[] }> {
  const validFiles: File[] = []
  const errors: string[] = []

  for (const file of files) {
    const ext = file.name.split('.').pop()?.toLowerCase()
    if (!ext || !ALLOWED_EXTENSIONS.has(ext) || !ALLOWED_TYPES.has(file.type)) {
      errors.push(`${file.name}：仅支持 PNG、JPG、JPEG 格式`)
      continue
    }
    if (file.size > MAX_FILE_SIZE) {
      errors.push(`${file.name}：文件大小超过 10MB 限制`)
      continue
    }
    try {
      const { width, height } = await getImageDimensions(file)
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        errors.push(`${file.name}：图片尺寸为 ${width}×${height}，宽和高最大支持 8192px`)
        continue
      }
      validFiles.push(file)
    } catch {
      errors.push(`${file.name}：无法读取图片尺寸，请重新选择图片`)
    }
  }

  return { validFiles, errors }
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

    xhr.onerror = () => reject(new Error('参考图上传失败，请检查网络或文件大小是否超过 10MB'))
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
): Promise<ReferenceUploadResult> {
  const { validFiles, errors } = await validateReferenceImages(files)
  const totalCount = validFiles.length
  const uploads: Array<{ file: File; url: string }> = []

  if (totalCount === 0) return { uploads, errors }

  for (const [index, file] of validFiles.entries()) {
    try {
      const url = await uploadSingleReferenceImage(file, (filePercent) => {
        const percent = Math.round(((index + filePercent / 100) / totalCount) * 100)
        options.onProgress?.({
          uploadedCount: index,
          totalCount,
          percent,
          currentFileName: file.name,
        })
      })
      uploads.push({ file, url })
      options.onProgress?.({
        uploadedCount: index + 1,
        totalCount,
        percent: Math.round(((index + 1) / totalCount) * 100),
        currentFileName: file.name,
      })
    } catch (error) {
      errors.push(`${file.name}：${error instanceof Error ? error.message : '参考图上传失败'}`)
    }
  }

  return { uploads, errors }
}
