import { readGate } from "@/lib/systems";
import { readFinance } from "@/lib/finance";
import type { NavBadges } from "./nav";
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

/**
 * 224px fixed on a desktop, and gone below `md` — docs/DESIGN.md, Layout.
 *
 * On a narrow screen `MobileBar` takes over with the same navigation in a
 * sheet. Steward is reached from outside the house over Tailscale, which means
 * a phone, and a fixed 224px column is 57% of one.
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

      <aside className="hidden w-[224px] shrink-0 flex-col justify-between border-r bg-sidebar py-[20px] md:flex">
        <div className="flex flex-col gap-[24px]">
          <Mark />
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
