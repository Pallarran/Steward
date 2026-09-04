"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import type { NavBadges } from "./nav";
import { Mark } from "./mark";
import { RailControls } from "./rail-controls";
import { SidebarNav } from "./sidebar-nav";

/**
 * The narrow-screen shell.
 *
 * Steward is reached from outside the house over Tailscale — PRD §4 — which
 * means a phone, and the 224px rail is 57% of a 390px screen. Below `md` the
 * rail is hidden and this takes over: a slim bar with the mark and a hamburger,
 * and a sheet holding the same navigation.
 *
 * **The same navigation, not a copy of it.** `SidebarNav` and `NAV_ITEMS` are
 * reused verbatim, which is why the nav has one source of truth — Chronicle's
 * mobile sidebar does the same and it is the reason its two navs cannot drift.
 *
 * `footer` carries the level block and the collectors' clock, which are server
 * components and so arrive as children rather than being rebuilt here.
 *
 * Closing on navigation is an `onClick` on the links rather than an effect on
 * `pathname`: `react-hooks/set-state-in-effect` already caught this project
 * once, and the handler is simpler than the effect it replaces.
 */
export function MobileBar({
  badges,
  footer,
}: {
  badges: NavBadges;
  footer: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <div className="flex h-[54px] shrink-0 items-center justify-between border-b bg-sidebar pr-[12px] md:hidden">
      {/* The one place that stays horizontal: this strip is 54px tall and a
          stacked mark does not fit in it at any size worth having. */}
      <Mark layout="side" />

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          aria-label="Menu"
          className="flex size-[34px] items-center justify-center rounded-[8px] text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground"
        >
          <Menu size={19} strokeWidth={1.8} />
        </SheetTrigger>

        <SheetContent side="left" className="w-[254px] bg-sidebar px-0 py-[20px]">
          {/* Radix needs a title for the dialog's accessible name. It is not
              drawn: the mark below is the heading a sighted reader sees. */}
          <SheetTitle className="sr-only">Navigation</SheetTitle>

          <div className="flex h-full flex-col justify-between gap-[24px] overflow-y-auto">
            <div className="flex flex-col gap-[24px]">
              <Mark onNavigate={close} />
              <SidebarNav badges={badges} onNavigate={close} />
            </div>

            <div className="flex flex-col gap-[10px]">
              <RailControls onNavigate={close} />
              {footer}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
