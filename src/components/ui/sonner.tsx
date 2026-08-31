"use client";

import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

/**
 * Toasts, in Steward's own palette.
 *
 * Sonner ships its own colours; mapping them onto the tokens means a toast
 * looks like the rest of the app in both themes and follows the theme toggle
 * without a second source of truth. Horizon does the same and it is why its
 * toasts do not look bolted on.
 *
 * `richColors` is deliberately off. A dismissal is not an error and not a
 * success — it is a thing that happened, with an undo — and colouring it green
 * would say otherwise.
 */
export function Toaster(props: ToasterProps) {
  const { resolvedTheme } = useTheme();

  return (
    <Sonner
      theme={resolvedTheme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      // Long enough to read a name and reach for Undo, short enough that it is
      // gone before it becomes clutter.
      duration={6000}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}
