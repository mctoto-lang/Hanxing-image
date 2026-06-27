"use client"

import { cn } from "@/lib/utils"
import type React from "react"
import type { CSSProperties } from "react"

type ShineBorderProps = {
  className?: string
  duration?: number
  shineColor?: string | string[]
  borderWidth?: number
  style?: React.CSSProperties
}

export function ShineBorder({
  className,
  duration = 14,
  shineColor = "#000000",
  borderWidth = 1,
  style,
}: ShineBorderProps) {
  const animationDuration = `${duration}s`

  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit]",
        className
      )}
      style={
        {
          "--border-width": `${borderWidth}px`,
          "--animation-duration": animationDuration,
          "--shine-color":
            typeof shineColor === "string"
              ? shineColor
              : shineColor.join(", "),
          ...style,
        } as CSSProperties
      }
    >
      <div
        className="absolute inset-0 rounded-[inherit]"
        style={{
          padding: `${borderWidth}px`,
          background: `
            linear-gradient(
              90deg,
              ${typeof shineColor === "string" ? shineColor : shineColor.join(", ")}
            )
          `,
          WebkitMask:
            "linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)",
          WebkitMaskComposite: "xor",
          maskComposite: "exclude",
        }}
      >
        <div
          className="absolute inset-0 rounded-[inherit]"
          style={{
            background: `
              conic-gradient(
                from 0deg,
                transparent 0deg 90deg,
                ${typeof shineColor === "string" ? shineColor : shineColor[0]} 90deg 180deg,
                transparent 180deg 270deg,
                ${typeof shineColor === "string" ? shineColor : shineColor[shineColor.length - 1]} 270deg 360deg
              )
            `,
            animation: `shine var(--animation-duration) linear infinite`,
          }}
        />
      </div>
      <style>{`
        @keyframes shine {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </div>
  )
}
