import { listQueue } from "@/lib/queue";
import { readFinance, percent } from "@/lib/finance";
import { readSubscriptions } from "@/lib/subscriptions";
import type { Today } from "@/lib/today";

/**
 * One line of figures, above the gate.
 *
 * **This replaces the stat row, which was four bordered cards at 76px.** That
 * row was removed on 2026-09-01 because every number on it was already on the
 * same screen, and restored the same day at Vincent's request in a shape that
 * costs about 30px instead — a sentence of figures rather than a strip of
 * cards.
 *
 * **Services are deliberately absent.** The gate card sits directly beneath and
 * its own sentence says "8 of 8 monitors up"; repeating that 30px above is what
 * got the first version deleted. Everything here is either something to act on
 * or a number that moves.
 *
 * **Each figure answers for its own source.** A stale collector contributes an
 * em dash, never a number — rule 2 applies to one figure on a line exactly as
 * it applies to a whole panel, and a line of five numbers is a very easy place
 * to smuggle a stale one through.
 */
export async function StatBand({ today }: { today: Today }) {
  const [items, finance, { subscriptions }] = await Promise.all([
    listQueue(),
    readFinance(),
    readSubscriptions(),
  ]);

  const next = subscriptions.find((s) => s.active);

  const figures: { value: string; label: string; tone?: string }[] = [
    { value: String(items.length), label: "queued" },
    {
      value: today.todoist.stale ? "—" : String(today.dueToday.length),
      label: "due today",
    },
    {
      value: today.todoist.stale ? "—" : String(today.late.length),
      label: "late",
      tone: !today.todoist.stale && today.late.length > 0 ? "var(--destructive)" : undefined,
    },
  ];

  // Only once Horizon is wired up. A section that has never been configured is
  // not a section that is failing, and an em dash would imply it was.
  if (finance.configured) {
    figures.push({
      value: finance.stale || !finance.summary ? "—" : percent(finance.summary.dayChangePercent),
      label: finance.summary && finance.priceDateIsToday ? "today" : "at last close",
      tone:
        finance.stale || !finance.summary
          ? undefined
          : finance.summary.dayChangePercent >= 0
            ? "var(--teal)"
            : "var(--destructive)",
    });
  }

  if (next) {
    // "5d until Netflix", not "5d netflix" — the label is a phrase here rather
    // than a noun, and the name keeps its capital because it is one.
    figures.push({
      value: next.daysAway <= 0 ? "today" : `${next.daysAway}d`,
      label: next.daysAway <= 0 ? `${next.name} renews` : `until ${next.name}`,
      tone: next.soon ? "var(--primary)" : undefined,
    });
  }

  return (
    <div className="flex flex-wrap items-baseline gap-x-[8px] gap-y-[2px] font-mono text-[13px]">
      {figures.map((f, i) => (
        <span key={f.label} className="flex items-baseline gap-[5px]">
          {i > 0 ? <span className="pr-[3px] text-faint">·</span> : null}
          <span style={f.tone ? { color: f.tone } : undefined}>{f.value}</span>
          <span className="text-faint">{f.label}</span>
        </span>
      ))}
    </div>
  );
}
