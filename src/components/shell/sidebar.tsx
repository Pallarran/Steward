import { readGate } from "@/lib/systems";
import { readFinance } from "@/lib/finance";
import type { NavBadges } from "./nav";
import { Greeting } from "./greeting";
import { LevelBlock } from "./level-block";
import { Mark } from "./mark";
import { MobileBar } from "./mobile-bar";
import { RailControls } from "./rail-controls";
import { SourcesBlock } from "./sources-block";
import { SidebarNav } from "./sidebar-nav";

/**
 * The rail's badges, computed here because the nav itself is a client
 * component and must not read the database.
 *
 * Systems is the only section with live data in v1. Down, degraded and stale
 * are said differently for the same reason the gate says them differently: a
 * red dot means the house is broken, amber means it is running on its spare,
 * and the word "stale" means Steward does not know.
 */
async function navBadges(): Promise<NavBadges> {
  const [gate, finance] = await Promise.all([readGate(), readFinance()]);

  const badges: NavBadges = {
    // Three states, not two. A disabled array disk left this green until
    // 2026-08-31, because nothing in v1 had a word for a house that is running
    // on its spare rather than broken.
    "/systems": gate.stale
      ? { tone: "stale", text: "stale" }
      : { tone: gate.state === "clear" ? "ok" : gate.state === "degraded" ? "degraded" : "down" },
  };

  // The "stale" word on Finance is exactly what the "Something is wrong"
  // artboard draws. Only once it is connected: a section that has never been
  // set up is not a section that is failing.
  if (finance.configured && finance.stale) {
    badges["/finance"] = { tone: "stale", text: "stale" };
  }

  return badges;
}

/**
 * 256px fixed on a desktop, and gone below `md` — docs/DESIGN.md, Layout.
 *
 * On a narrow screen `MobileBar` takes over with the same navigation in a
 * sheet. Steward is reached from outside the house over Tailscale, which means
 * a phone, and a fixed rail is most of one.
 */
export async function Sidebar() {
  const badges = await navBadges();

  // Server components, so they are built once here and handed to the mobile
  // sheet as children rather than rebuilt inside it.
  const footer = (
    <>
      <LevelBlock />
      <SourcesBlock />
    </>
  );

  return (
    <>
      <MobileBar badges={badges} footer={footer} />

      {/* 256px since 2026-09-04, from 224. The greeting moved in here and the
          nav had no room to breathe; content at 1920 goes 1648 → 1616, which
          nothing on any page notices. */}
      <aside className="hidden w-[256px] shrink-0 flex-col justify-between border-r bg-sidebar py-[20px] md:flex">
        {/* `min-h-0` so a long nav scrolls rather than pushing the controls
            below out of the rail — which is the failure mode now that the rail
            is height-bound rather than as tall as the document. */}
        <div className="flex min-h-0 flex-col gap-[20px]">
          <Mark />
          <Greeting />
          <SidebarNav badges={badges} />
        </div>

        <div className="flex flex-col gap-[10px]">
          <RailControls />
          {footer}
        </div>
      </aside>
    </>
  );
}
