import { useMemo, useState } from 'react'
import { Check, ChevronsUpDown, Search } from 'lucide-react'

import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface ComboboxOption {
  value: string
  label: string
  description?: string
  keywords?: string
}

interface ComboboxProps {
  value: string
  onValueChange: (value: string) => void
  options: ComboboxOption[]
  placeholder?: string
  searchPlaceholder?: string
  emptyText?: string
  disabled?: boolean
  className?: string
  contentClassName?: string
}

export function Combobox({
  value,
  onValueChange,
  options,
  placeholder = '请选择',
  searchPlaceholder = '搜索...',
  emptyText = '暂无选项',
  disabled = false,
  className,
  contentClassName,
}: ComboboxProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = options.find(option => option.value === value)
  const filteredOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    if (!normalizedQuery) return options

    return options.filter(option => {
      const searchable = [option.label, option.description, option.keywords]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()

      return searchable.includes(normalizedQuery)
    })
  }, [options, query])

  const handleSelect = (nextValue: string) => {
    onValueChange(nextValue)
    setOpen(false)
    setQuery('')
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        type="button"
        disabled={disabled}
        role="combobox"
        aria-expanded={open}
        className={cn(
          'flex h-8 w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm text-left transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 dark:bg-input/30',
          className,
        )}
      >
        <span className={cn('truncate', !selected && 'text-muted-foreground')}>
          {selected?.label || placeholder}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      </PopoverTrigger>
      <PopoverContent className={cn('w-80 p-0 z-[70]', contentClassName)} align="start">
        <div className="border-b p-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={searchPlaceholder}
              className="h-8 pl-8 text-sm"
              autoFocus
            />
          </div>
        </div>
        <div className="max-h-64 overflow-y-auto p-1.5">
          {filteredOptions.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</div>
          ) : (
            filteredOptions.map(option => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={cn(
                  'flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-accent',
                  value === option.value && 'bg-primary/5 text-primary',
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-medium">{option.label}</span>
                  {option.description && (
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">{option.description}</span>
                  )}
                </span>
                <Check className={cn('h-4 w-4 shrink-0', value === option.value ? 'opacity-100' : 'opacity-0')} />
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
