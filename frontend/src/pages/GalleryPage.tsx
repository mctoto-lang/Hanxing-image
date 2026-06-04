import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardFooter } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

interface GalleryItem {
  image_url: string
  prompt: string
  model_name: string
  username: string
  generation_time: string
}

export default function GalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([])
  const [loading, setLoading] = useState(true)

  const fetchGallery = useCallback(async () => {
    try {
      setLoading(true)
      const token = localStorage.getItem('token')
      const res = await fetch('/api/gallery', {
        headers: { Authorization: `Bearer ${token}` },
      })
      const data = await res.json()
      setItems(data.gallery || [])
    } catch {
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchGallery()
  }, [fetchGallery])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">公开画廊</h1>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
        </div>
      ) : items.length === 0 ? (
        <p className="text-muted-foreground text-center py-12">暂无公开图片</p>
      ) : (
        <div className="columns-1 sm:columns-2 md:columns-3 lg:columns-4 gap-4">
          {items.map((item, index) => (
            <Card key={index} className="mb-4 break-inside-avoid p-0">
              <img
                src={item.image_url}
                alt={item.prompt}
                className="w-full rounded-t-xl"
                loading="lazy"
              />
              <CardContent className="px-3 pt-3 pb-0">
                <p className="text-sm line-clamp-2">{item.prompt}</p>
              </CardContent>
              <CardFooter className="flex flex-col items-start gap-2 py-3">
                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary">{item.model_name}</Badge>
                  <Badge>{item.username}</Badge>
                </div>
                <span className="text-xs text-muted-foreground">
                  {new Date(item.generation_time).toLocaleString('zh-CN')}
                </span>
              </CardFooter>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
