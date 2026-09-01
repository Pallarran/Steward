import * as React from "react"
import { ChevronDown } from "lucide-react"

import { cn } from "@/lib/utils"

/**
 * A native `<select>` that matches `Input`.
 *
 * The literal it replaces was copy-pasted six times at `h-[36px]` — 4px taller
 * than every input beside it, in every add form in the app. That mismatch was
 * the visible symptom of the two design systems: the hand-written `<select>`
 * guessed at a height while `Input` inherited shadcn's `h-8`, and neither
 * number appeared anywhere the other could see it.
 *
 * **Native, not a Radix listbox.** On a phone this opens the platform picker,
 * which is the right control on the device Steward is most often read from, and
 * it needs no JavaScript in a server component.
 *
 * `appearance-none` plus our own chevron, because the native arrow is drawn by
 * the OS and ignores the theme — a light triangle on the dark ground and a dark
 * one on the light, neither matching the token palette.
 */
function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    // `className` sizes the **wrapper**, not the select. The chevron is
    // positioned against this span, so a width landing on the inner element
    // instead would leave the arrow floating wherever the flex row happened to
    // stretch the wrapper to.
    <span className={cn("relative inline-flex w-full items-center", className)}>
      <select
        data-slot="select"
        className="h-[32px] w-full min-w-0 appearance-none rounded-[10px] border border-input bg-input-fill py-[4px] pl-[10px] pr-[24px] text-[16px] transition-colors outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-[15px]"
        {...props}
      >
        {children}
      </select>

      <ChevronDown
        size={14}
        strokeWidth={1.8}
        aria-hidden
        className="pointer-events-none absolute right-[8px] text-faint"
      />
    </span>
  )
}

export { Select }
