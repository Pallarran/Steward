import { requireAuth } from "@/lib/auth/require-auth";
import { Sidebar } from "@/components/shell/sidebar";
import { AutoRefresh } from "@/components/shell/auto-refresh";

/**
 * Everything behind the login lives under this route group. A new page is
 * therefore behind it by construction rather than by remembering to check.
 *
 * Sidebar 224px fixed, content fills the rest at 22–24px padding —
 * docs/DESIGN.md, Layout. Below `md` the rail becomes a sheet behind a top bar,
 * so the column stacks rather than splitting a phone screen in half; the
 * padding steps down with it.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireAuth();

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground md:flex-row">
      {/* PRD §4: true while left open all day, not a morning snapshot. */}
      <AutoRefresh />
      <Sidebar />
      <main className="flex min-w-0 grow flex-col gap-[24px] px-[16px] pt-[16px] pb-[24px] md:px-[24px] md:pt-[20px]">
        {children}
      </main>
    </div>
  );
}
