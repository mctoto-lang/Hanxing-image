import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowUp02Icon, HugeiconsIcon, PlusSignIcon, ToolsIcon } from "@/components/icons"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { FC, ReactNode } from "react"

export interface UploadedFile {
  id: string
  name: string
  url?: string
  type?: string
}

export interface Tool {
  name: string
  category: string
  description?: string
  icon?: ReactNode
}

export interface SlashCommandMatch {
  tool: Tool
  score: number
}

export interface ComposerContextOption {
  id: string
  label: string
  icon?: ReactNode
  description?: string
  onClick?: () => void
}

export interface ComposerProps {
  placeholder?: string
  onSubmit?: (message: string, files?: UploadedFile[]) => void
  onChange?: (value: string) => void
  disabled?: boolean
  showToolsButton?: boolean
  onToolSelect?: (tool: Tool) => void
  tools?: Tool[]
  onAttachClick?: () => void
  contextOptions?: ComposerContextOption[]
  autoFocus?: boolean
  maxRows?: number
  defaultValue?: string
  value?: string
  className?: string
  attachedFiles?: UploadedFile[]
  onRemoveFile?: (id: string) => void
  isLoading?: boolean
  showSendButton?: boolean
}

const PRIMARY_COLOR = "#00bbff"

export const Composer: FC<ComposerProps> = ({
  placeholder = "输入提示词描述你想要生成的图片...",
  onSubmit,
  onChange,
  disabled = false,
  showToolsButton = false,
  tools = [],
  onAttachClick,
  contextOptions,
  autoFocus = false,
  maxRows = 6,
  defaultValue = "",
  value,
  className,
  attachedFiles = [],
  onRemoveFile,
  isLoading = false,
  showSendButton = true,
}) => {
  const [inputValue, setInputValue] = useState(defaultValue)
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)

  const currentValue = value !== undefined ? value : inputValue

  void tools
  void onRemoveFile

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value
      if (value === undefined) {
        setInputValue(newValue)
      }
      onChange?.(newValue)
    },
    [onChange, value],
  )

  useEffect(() => {
    const textarea = textareaRef.current
    if (!textarea) return
    textarea.style.height = "auto"
    const lineHeight = 24
    const maxHeight = lineHeight * maxRows
    const newHeight = Math.min(textarea.scrollHeight, maxHeight)
    textarea.style.height = `${newHeight}px`
  }, [currentValue, maxRows])

  const handleSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault()
      if (isLoading) return
      if (currentValue.trim() || attachedFiles.length > 0) {
        onSubmit?.(currentValue, attachedFiles)
        if (value === undefined) {
          setInputValue("")
        }
      }
    },
    [currentValue, attachedFiles, onSubmit, value, isLoading],
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey && !disabled && !isLoading) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit, disabled, isLoading],
  )

  const handleContextClick = useCallback(() => {
    if (isLoading) return
    if (contextOptions && contextOptions.length > 0) {
      setIsContextMenuOpen(!isContextMenuOpen)
    } else {
      onAttachClick?.()
    }
  }, [contextOptions, isContextMenuOpen, onAttachClick, isLoading])

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus()
    }
  }, [autoFocus])

  const canSubmit = currentValue.trim() || attachedFiles.length > 0

  return (
    <div className={cn("relative w-full", className)}>
      <div
        ref={composerRef}
        className={cn(
          "relative rounded-3xl px-1 pt-1 pb-2",
          "bg-zinc-100 dark:bg-zinc-800",
        )}
      >
        <form onSubmit={handleSubmit}>
          <div className="relative px-3">
            <textarea
              ref={textareaRef}
              value={currentValue}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled || isLoading}
              rows={1}
              className={cn(
                "w-full resize-none bg-transparent py-3 pr-20 transition-all text-base font-light",
                "text-zinc-900 dark:text-white",
                "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
                "focus:outline-none",
                "disabled:cursor-not-allowed disabled:opacity-50",
              )}
              style={{
                minHeight: "24px",
                maxHeight: `${24 * maxRows}px`,
              }}
            />
          </div>
        </form>

        <div className="flex items-center justify-between px-2 pt-1">
          <div className="flex items-center gap-1">
            {onAttachClick && (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="icon-lg"
                  onClick={handleContextClick}
                  disabled={disabled || isLoading}
                  className={cn(
                    "relative rounded-full cursor-pointer",
                    "bg-zinc-200 dark:bg-zinc-700",
                    "hover:bg-zinc-300 dark:hover:bg-zinc-600/90",
                    "disabled:cursor-wait disabled:opacity-70",
                    isContextMenuOpen && "bg-zinc-300 dark:bg-zinc-600",
                  )}
                  aria-label="添加附件"
                >
                  <HugeiconsIcon
                    icon={PlusSignIcon}
                    size={23}
                    className="text-zinc-500 dark:text-zinc-400"
                  />
                </Button>

                {isContextMenuOpen && contextOptions && (
                  <div className="absolute bottom-full left-0 mb-2 min-w-[200px] rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 p-1 shadow-xl z-50">
                    {contextOptions.map((option) => (
                      <Button
                        key={option.id}
                        variant="ghost"
                        onClick={() => {
                          option.onClick?.()
                          setIsContextMenuOpen(false)
                        }}
                        className="w-full cursor-pointer justify-start gap-2 rounded-lg px-3 py-2 text-left whitespace-normal text-zinc-900 dark:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        {option.icon && (
                          <span className="flex-shrink-0" style={{ color: PRIMARY_COLOR }}>
                            {option.icon}
                          </span>
                        )}
                        <div className="flex flex-col">
                          <span>{option.label}</span>
                          {option.description && (
                            <span className="text-xs text-zinc-500 dark:text-zinc-400">
                              {option.description}
                            </span>
                          )}
                        </div>
                      </Button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {showToolsButton && (
              <Button
                variant="ghost"
                size="icon-lg"
                disabled={disabled || isLoading}
                className={cn(
                  "relative rounded-full cursor-pointer",
                  "bg-zinc-200 dark:bg-zinc-700 text-zinc-500 dark:text-zinc-400",
                  "hover:bg-zinc-300 dark:hover:bg-zinc-600/90",
                  "disabled:cursor-wait disabled:opacity-70",
                )}
                aria-label="工具"
              >
                <HugeiconsIcon icon={ToolsIcon} size={23} />
              </Button>
            )}
          </div>

          {showSendButton && (
          <Button
            variant="ghost"
            size="icon-lg"
            onClick={() => handleSubmit()}
            disabled={disabled || isLoading || !canSubmit}
            className={cn(
              "rounded-full cursor-pointer",
              "disabled:cursor-not-allowed disabled:opacity-70",
              canSubmit && "bg-[#00bbff] text-white hover:bg-[#00a3e0]",
              !canSubmit && "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500",
            )}
            aria-label="发送"
          >
            <HugeiconsIcon icon={ArrowUp02Icon} size={20} />
          </Button>
          )}
        </div>
      </div>
    </div>
  )
}

export default Composer
