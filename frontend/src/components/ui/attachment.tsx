import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"
import type { ComponentPropsWithoutRef } from "react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const attachmentVariants = cva(
  "group/attachment relative flex overflow-hidden rounded-xl border border-border bg-background text-foreground transition-colors",
  {
    variants: {
      size: {
        default: "min-h-24 p-3",
        sm: "min-h-20 p-2.5",
        xs: "min-h-16 p-2",
      },
      orientation: {
        horizontal: "items-center gap-3",
        vertical: "flex-col gap-2.5",
      },
      state: {
        idle: "",
        uploading: "after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-foreground/5 after:to-transparent after:animate-pulse",
        processing: "after:absolute after:inset-0 after:bg-gradient-to-r after:from-transparent after:via-foreground/5 after:to-transparent after:animate-pulse",
        error: "border-destructive/40 bg-destructive/5",
        done: "",
      },
    },
    defaultVariants: {
      size: "default",
      orientation: "horizontal",
      state: "done",
    },
  }
)

const attachmentMediaVariants = cva(
  "relative shrink-0 overflow-hidden rounded-lg bg-muted",
  {
    variants: {
      variant: {
        icon: "flex items-center justify-center text-muted-foreground",
        image: "",
      },
      size: {
        default: "size-14",
        sm: "size-12",
        xs: "size-10",
      },
      orientation: {
        horizontal: "",
        vertical: "w-full",
      },
    },
    compoundVariants: [
      {
        variant: "image",
        orientation: "vertical",
        size: "default",
        className: "h-32",
      },
      {
        variant: "image",
        orientation: "vertical",
        size: "sm",
        className: "h-28",
      },
      {
        variant: "image",
        orientation: "vertical",
        size: "xs",
        className: "h-24",
      },
    ],
    defaultVariants: {
      variant: "icon",
      size: "default",
      orientation: "horizontal",
    },
  }
)

type AttachmentOwnProps = VariantProps<typeof attachmentVariants>

function Attachment({
  className,
  size,
  orientation,
  state,
  ...props
}: ComponentPropsWithoutRef<"div"> & AttachmentOwnProps) {
  return (
    <div
      data-slot="attachment"
      data-state={state}
      className={cn(attachmentVariants({ size, orientation, state, className }))}
      {...props}
    />
  )
}

type AttachmentMediaOwnProps = VariantProps<typeof attachmentMediaVariants>

function AttachmentMedia({
  className,
  variant,
  size,
  orientation,
  ...props
}: ComponentPropsWithoutRef<"div"> & AttachmentMediaOwnProps) {
  return (
    <div
      data-slot="attachment-media"
      className={cn(attachmentMediaVariants({ variant, size, orientation, className }))}
      {...props}
    />
  )
}

function AttachmentContent({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="attachment-content" className={cn("min-w-0 flex-1 space-y-1", className)} {...props} />
}

function AttachmentTitle({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="attachment-title" className={cn("truncate text-sm font-medium", className)} {...props} />
}

function AttachmentDescription({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="attachment-description" className={cn("text-xs text-muted-foreground", className)} {...props} />
}

function AttachmentActions({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="attachment-actions" className={cn("relative z-10 flex items-center gap-1 self-start", className)} {...props} />
}

function AttachmentAction({ className, variant = "ghost", size = "icon-xs", ...props }: ComponentPropsWithoutRef<typeof Button>) {
  return <Button data-slot="attachment-action" variant={variant} size={size} className={cn("rounded-full", className)} {...props} />
}

function AttachmentTrigger({ className, asChild = false, ...props }: ComponentPropsWithoutRef<"button"> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button"
  return <Comp data-slot="attachment-trigger" className={cn("absolute inset-0 z-0", className)} {...props} />
}

function AttachmentGroup({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div data-slot="attachment-group" className={cn("flex gap-3 overflow-x-auto", className)} {...props} />
}

export {
  Attachment,
  AttachmentAction,
  AttachmentActions,
  AttachmentContent,
  AttachmentDescription,
  AttachmentGroup,
  AttachmentMedia,
  AttachmentTitle,
  AttachmentTrigger,
}
