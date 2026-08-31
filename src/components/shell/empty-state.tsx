import type { LucideIcon } from "lucide-react";

/**
 * Nothing here — and what that means.
 *
 * **`tone` is the whole point.** An empty queue with a failing collector is a
 * failed load wearing an achievement's clothes, and congratulating Vincent for
 * it is exactly the failure rule 2 exists to prevent. So emptiness has two
 * readings and the component makes you pick:
 *
 * - `calm` — earned. Nothing is waiting because nothing is waiting.
 * - `warning` — not earned. It is empty because something did not arrive.
 *
 * The action is passed as `children` so this component owns no logic about what
 * to do next; Chronicle's does the same and it is why theirs is reusable.
 *
 * **This is only for a collection that is empty.** Two other kinds of emptiness
 * exist and neither belongs here — docs/DESIGN.md, *Three kinds of empty*.
 */
export function EmptyState({
  icon: Icon,
  title,
  tone = "calm",
  children,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description: React.ReactNode;
  tone?: "calm" | "warning";
  children?: React.ReactNode;
}) {
  const warning = tone === "warning";
  const accent = warning ? "var(--warning)" : "var(--primary)";

  return (
    <div className="flex grow flex-col items-center justify-center gap-[4px] rounded-[10px] border border-dashed bg-card/50 px-[24px] py-[52px] text-center">
      {Icon ? (
        <span
          className="mb-[10px] flex size-[42px] items-center justify-center rounded-full"
          style={{ background: `color-mix(in srgb, ${accent} 10%, transparent)` }}
        >
          <Icon size={19} strokeWidth={1.7} style={{ color: accent }} />
        </span>
      ) : null}

      <p className={`text-[17px] font-semibold ${warning ? "text-warning" : ""}`}>{title}</p>
      <p className="max-w-[440px] text-[13px] leading-[1.6] text-muted-foreground">
        {description}
      </p>

      {children ? <div className="mt-[14px]">{children}</div> : null}
    </div>
  );
}
