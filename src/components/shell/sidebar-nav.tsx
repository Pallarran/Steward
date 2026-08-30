"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS } from "./nav";

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-[3px] px-[10px]">
      {NAV_ITEMS.map(({ label, href, icon: Icon, accent, ready }) => {
        const active = pathname === href;
        const className =
          "flex items-center gap-[11px] rounded-[10px] px-[11px] py-[9px] text-[14px]";

        const inner = (
          <>
            <Icon size={17} strokeWidth={1.7} style={{ color: accent }} className="shrink-0" />
            <span className={active ? "font-semibold text-foreground" : "text-muted-foreground"}>
              {label}
            </span>
          </>
        );

        // Sections without a page yet are not links. A rail full of dead links
        // teaches you to distrust the rail.
        if (!ready) {
          return (
            <div
              key={href}
              aria-disabled
              title={`${label} arrives with its build step`}
              className={`${className} cursor-default opacity-45`}
            >
              {inner}
            </div>
          );
        }

        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`${className} transition-colors ${
              active ? "bg-sidebar-accent" : "hover:bg-sidebar-accent/60"
            }`}
          >
            {inner}
          </Link>
        );
      })}
    </nav>
  );
}
