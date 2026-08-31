"use client";

import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { logout } from "@/app/(app)/actions";
import { ThemeToggle } from "./theme-toggle";
import { IconButton } from "./icon-button";

/**
 * Theme, settings, sign out.
 *
 * Chrome, not content. It sits at the foot of the rail rather than top-right
 * because the content header is the capture field's place — step 8.
 */
export function RailControls({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="flex items-center gap-[2px] px-[16px]">
      <ThemeToggle />
      {/* Chrome, not a destination, so it sits here rather than in the nav. */}
      <IconButton surface="rail" asChild>
        <Link href="/settings" onClick={onNavigate} aria-label="Settings" title="Settings">
          <Settings size={15} strokeWidth={1.8} />
        </Link>
      </IconButton>
      <form action={logout}>
        <IconButton surface="rail" type="submit" aria-label="Sign out" title="Sign out">
          <LogOut size={15} strokeWidth={1.8} />
        </IconButton>
      </form>
    </div>
  );
}
