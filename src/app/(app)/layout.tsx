import { requireAuth } from "@/lib/auth/require-auth";
import { Sidebar } from "@/components/shell/sidebar";
import { AutoRefresh } from "@/components/shell/auto-refresh";

/**
 * Everything behind the login lives under this route group. A new page is
 * therefore behind it by construction rather than by remembering to check.
 *
 * Sidebar 224px fixed, content fills the rest at 22–24px padding —
 * docs/DESIGN.md, Layout.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  await requireAuth();

  return (
    <div className="flex min-h-dvh bg-background text-foreground">
      {/* PRD §4: true while left open all day, not a morning snapshot. */}
      <AutoRefresh />
      <Sidebar />
      <main className="flex min-w-0 grow flex-col gap-[16px] px-[24px] pt-[22px] pb-[26px]">
        {children}
      </main>
    </div>
  );
}
