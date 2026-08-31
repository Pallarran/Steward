import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * 32px tall, the app's control height. `Select` and a default `Button` match it
 * exactly — see the note in `button.tsx` for why that had to be said out loud.
 *
 * **16px below `md`, 14px above.** Not a stray value: iOS Safari zooms the page
 * when a focused field's text is under 16px, and Steward is reached from a
 * phone over Tailscale.
 */
function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-[32px] w-full min-w-0 rounded-[10px] border border-input bg-input-fill px-[10px] py-[4px] text-[16px] transition-colors outline-none file:inline-flex file:h-[24px] file:border-0 file:bg-transparent file:text-[14px] file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-[14px] dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Input }
