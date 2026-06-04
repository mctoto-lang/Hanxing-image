import { Loader2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

interface QueueStatusBadgeProps {
  queued: number
  processing: number
  greenThreshold?: number
  yellowThreshold?: number
  className?: string
}

export function QueueStatusBadge({
  queued,
  processing,
  greenThreshold = 10,
  yellowThreshold = 15,
  className,
}: QueueStatusBadgeProps) {
  const total = queued + processing

  if (total === 0) return null

  const getStatusColor = () => {
    if (total < greenThreshold) {
      return 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
    }
    if (total < yellowThreshold) {
      return 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30'
    }
    return 'bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30'
  }

  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border',
        getStatusColor(),
        className
      )}
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      <span>生图 {total}</span>
    </div>
  )
}
