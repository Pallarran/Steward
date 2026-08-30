"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <button
      type="button"
      // resolvedTheme is read at click time, never during render, so the
      // server and client markup are identical and there is nothing to
      // reconcile. The icon is chosen by CSS from the .dark class that
      // next-themes stamps on <html> before first paint — which is also why
      // there is no flash on reload.
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle theme"
      title="Toggle theme"
      className="flex size-[26px] items-center justify-center rounded-[8px] text-faint transition-colors hover:bg-sidebar-accent hover:text-foreground"
    >
      <Moon size={15} strokeWidth={1.8} className="dark:hidden" />
      <Sun size={15} strokeWidth={1.8} className="hidden dark:block" />
    </button>
  );
}
