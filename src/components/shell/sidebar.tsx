import Image from "next/image";
import Link from "next/link";
import { LogOut } from "lucide-react";
import { logout } from "@/app/(app)/actions";
import { LevelBlock } from "./level-block";
import { SidebarNav } from "./sidebar-nav";
import { ThemeToggle } from "./theme-toggle";

/** 224px fixed. Content fills the rest — docs/DESIGN.md, Layout. */
export function Sidebar() {
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
          <span className="text-[17px] font-bold tracking-[-0.01em]">Steward</span>
        </Link>

        <SidebarNav />
      </div>

      <div className="flex flex-col gap-[10px]">
        {/* Chrome, not content. It sits here rather than top-right because the
            content header is the capture field's place from step 8. */}
        <div className="flex items-center gap-[2px] px-[16px]">
          <ThemeToggle />
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
      </div>
    </aside>
  );
}
