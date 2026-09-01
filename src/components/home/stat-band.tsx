import { listQueue } from "@/lib/queue";
import { readFinance, percent } from "@/lib/finance";
import { readSubscriptions } from "@/lib/subscriptions";
import { readGate } from "@/lib/systems";
import type { Today } from "@/lib/today";

/**
 * Six small tiles above the gate.
 *
 * **This is the third shape of this thing in a day**, and the history is worth
 * keeping. It began as four bordered cards at 76px, was removed because every
 * number on it was already on the same screen, came back as a sentence of
 * figures at 30px, and is now tiles at about 38px — Vincent's call, and the
 * right one: a tile can carry a colour, and a sentence cannot.
 *
 * **Colour means "this needs you", and nothing else.** Not "this is good", not
 * "this went down". So services light when they are not clear, late lights
 * above zero, and a renewal lights inside its own notice window — and the
 * queue, what is due today and the day's market change never light at all.
 *
 * **The day change is the deliberate exception to convention.** Finance colours
 * that same figure by its sign, because there it is the subject. Here it would
 * sit beside colour that means "go and fix this" and look identical, and a red
 * −0.4% morning does not need anything doing before lunch.
 *
 * **Each figure answers for its own source.** A stale collector contributes an
 * em dash rather than a number: a row of six numbers is an easy place to
 * smuggle a stale one through.
 */
type Tile = {
  value: string;
  label: string;
  /** Only ever set when the tile wants something. */
  tone?: "down" | "warn" | "due";
};

const TONE = {
  down: "border-destructive/50 bg-destructive/[0.07] text-destructive",
  warn: "border-warning/50 bg-warning/[0.07] text-warning",
  due: "border-primary/50 bg-primary/[0.07] text-primary",
} as const;

export async function StatBand({ today }: { today: Today }) {
  const [items, gate, finance, { subscriptions }] = await Promise.all([
    listQueue(),
    readGate(),
    readFinance(),
    readSubscriptions(),
  ]);

  const next = subscriptions.find((s) => s.active);

  const tiles: Tile[] = [
    // The gate's own headline, in 38px rather than the 60px card — which is
    // why that card now renders only when it has a problem to report.
    {
      value: gate.stale ? "—" : `${gate.monitorsUp}/${gate.monitorsTotal}`,
      label: gate.stale ? "not known" : gate.state === "clear" ? "up" : "services",
      tone: gate.stale ? "warn" : gate.state === "clear" ? undefined : gate.state === "degraded" ? "warn" : "down",
    },
    { value: String(items.length), label: "queued" },
    {
      value: today.todoist.stale ? "—" : String(today.dueToday.length),
      label: "due today",
    },
    {
      value: today.todoist.stale ? "—" : String(today.late.length),
      label: "late",
      tone: !today.todoist.stale && today.late.length > 0 ? "down" : undefined,
    },
  ];

  // Only once Horizon is wired up: a section that has never been configured is
  // not a section that is failing, and an em dash would imply it was.
  if (finance.configured) {
    tiles.push({
      value: finance.stale || !finance.summary ? "—" : percent(finance.summary.dayChangePercent),
      label: finance.summary && finance.priceDateIsToday ? "today" : "last close",
    });
  }

  if (next) {
    tiles.push({
      value: next.daysAway <= 0 ? "today" : `${next.daysAway}d`,
      label: next.daysAway <= 0 ? `${next.name} renews` : `to ${next.name}`,
      tone: next.soon ? "due" : undefined,
    });
  }

  return (
    <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-3 lg:grid-cols-6">
      {tiles.map((tile) => (
        <div
          key={tile.label}
          className={`flex min-w-0 items-baseline gap-[6px] rounded-[9px] border px-[10px] py-[8px] ${
            tile.tone ? TONE[tile.tone] : "bg-card"
          }`}
        >
          <span className="shrink-0 font-mono text-[15px] font-semibold">{tile.value}</span>
          <span className={`min-w-0 truncate text-[13px] ${tile.tone ? "" : "text-faint"}`}>
            {tile.label}
          </span>
        </div>
      ))}
    </div>
  );
}
