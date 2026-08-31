import Image from "next/image";
import Link from "next/link";
import { LogOut, Settings } from "lucide-react";
import { logout } from "@/app/(app)/actions";
import { readGate } from "@/lib/systems";
import { readFinance } from "@/lib/finance";
import type { NavBadges } from "./nav";
import { LevelBlock } from "./level-block";
import { SourcesBlock } from "./sources-block";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";

/**
 * The rail's badges, computed here because the nav itself is a client
 * component and must not read the database.
 *
 * Systems is the only section with live data in v1. Down and stale are said
 * differently for the same reason the gate says them differently: a red dot
 * means the house is broken, the word "stale" means Steward does not know.
 */
async function navBadges(): Promise<NavBadges> {
  const [gate, finance] = await Promise.all([readGate(), readFinance()]);

  const badges: NavBadges = {
    "/systems": gate.stale
      ? { tone: "stale", text: "stale" }
      : { tone: gate.state === "clear" ? "ok" : "down" },
  };

  // The "stale" word on Finance is exactly what the "Something is wrong"
  // artboard draws. Only once it is connected: a section that has never been
  // set up is not a section that is failing.
  if (finance.configured && finance.stale) {
    badges["/finance"] = { tone: "stale", text: "stale" };
  }

  return badges;
}

/** 224px fixed. Content fills the rest — docs/DESIGN.md, Layout. */
export async function Sidebar() {
  const badges = await navBadges();

  return (
    <aside className="flex w-[224px] shrink-0 flex-col justify-between border-r bg-sidebar py-[22px]">
      <div className="flex flex-col gap-[24px]">
        <Link href="/" className="flex items-center gap-[11px] px-[18px]">
          {/* The mockup drew a gold chip with a key glyph standing in for the
              real mark. This is the mark. */}
          <Image
            src="/steward-mark.png"
            alt=""
            width={30}
            height={30}
            priority
            className="size-[30px] shrink-0"
          />
          <span className="flex min-w-0 flex-col">
            <span className="text-[17px] font-bold leading-[1.15] tracking-[-0.01em]">Steward</span>
            {/* Which house this is. Steward is single-instance by design, but
                it is reached over Tailscale from elsewhere, and the mockup puts
                the host here for exactly that reason. */}
            <span className="font-mono text-[11px] text-faint">whitetower</span>
          </span>
        </Link>

        <SidebarNav badges={badges} />
      </div>

      <div className="flex flex-col gap-[10px]">
        {/* Chrome, not content. It sits here rather than top-right because the
            content header is the capture field's place from step 8. */}
        <div className="flex items-center gap-[2px] px-[16px]">
          <ThemeToggle />
          {/* Chrome, not a destination, so it sits here rather than in the nav. */}
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className="flex size-[26px] items-center justify-center rounded-[8px] text-faint transition-colors hover:bg-sidebar-accent hover:text-foreground"
          >
            <Settings size={15} strokeWidth={1.8} />
          </Link>
          <form action={logout}>
            <button
              type="submit"
              aria-label="Sign out"
              title="Sign out"
              className="flex size-[26px] items-center justify-center rounded-[8px] text-faint transition-colors hover:bg-sidebar-accent hover:text-foreground"
            >
              <LogOut size={15} strokeWidth={1.8} />
            </button>
          </form>
        </div>

        <LevelBlock />
        <SourcesBlock />
      </div>
    </aside>
  );
}
