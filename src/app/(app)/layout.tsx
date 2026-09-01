import { requireAuth } from "@/lib/auth/require-auth";
import { Sidebar } from "@/components/shell/sidebar";
import { AutoRefresh } from "@/components/shell/auto-refresh";

/**
 * Everything behind the login lives under this route group. A new page is
 * therefore behind it by construction rather than by remembering to check.
 *
 * Sidebar 224px fixed, content fills the rest at 20–24px padding —
 * docs/DESIGN.md, Layout. Below `md` the rail becomes a sheet behind a top bar,
 * so the column stacks rather than splitting a phone screen in half; the
 * padding steps down with it.
 *
 * **`main` is the scroller, not the document.** Until 2026-09-01 nothing in the
 * app established a scroll container at all: this was `min-h-dvh`, so the shell
 * grew past the viewport and `html` scrolled. The rail is a stretched flex item
 * of that shell, which is why its bottom block — theme, sign out, the level and
 * the sources — sat at the bottom of the *document* and scrolled off on any
 * long page. A real height here fixes that by construction, with no `sticky`
 * anywhere, and it is what lets Home be a page that does not scroll.
 *
 * `min-h-0` on `main` is not decoration: a flex child's default
 * `min-height: auto` refuses to shrink below its content, so without it the
 * overflow never engages and nothing changes.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireAuth();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground md:flex-row">
      {/* PRD §4: true while left open all day, not a morning snapshot. */}
      <AutoRefresh />
      <Sidebar />
      <main className="flex min-h-0 min-w-0 grow flex-col gap-[24px] overflow-y-auto px-[16px] pt-[16px] pb-[24px] [scrollbar-gutter:stable] md:px-[24px] md:pt-[20px]">
        {children}
      </main>
    </div>
  );
}
