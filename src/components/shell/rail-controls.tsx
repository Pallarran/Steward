"use client";

import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { logout } from "@/app/(app)/actions";
import { ThemeToggle } from "./theme-toggle";

/**
 * Theme, settings, sign out.
 *
 * Chrome, not content. It sits at the foot of the rail rather than top-right
 * because the content header is the capture field's place — step 8.
 */
export function RailControls({ onNavigate }: { onNavigate?: () => void }) {
  const button =
    "flex size-[26px] items-center justify-center rounded-[8px] text-faint transition-colors hover:bg-sidebar-accent hover:text-foreground";

  return (
    <div className="flex items-center gap-[2px] px-[16px]">
      <ThemeToggle />
      {/* Chrome, not a destination, so it sits here rather than in the nav. */}
      <Link
        href="/settings"
        onClick={onNavigate}
        aria-label="Settings"
        title="Settings"
        className={button}
      >
        <Settings size={15} strokeWidth={1.8} />
      </Link>
      <form action={logout}>
        <button type="submit" aria-label="Sign out" title="Sign out" className={button}>
          <LogOut size={15} strokeWidth={1.8} />
        </button>
      </form>
    </div>
  );
}
