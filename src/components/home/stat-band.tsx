import Link from "next/link";

import { readFinance, percent } from "@/lib/finance";
import { readMailInbox } from "@/lib/mail";
import { readNewsUnread } from "@/lib/news";
import { readPeople } from "@/lib/people";
import { readSubscriptions } from "@/lib/subscriptions";
import { readGate, readSystems, type Systems } from "@/lib/systems";
import type { Today } from "@/lib/today";

/**
 * The band, and — since the gate went — the whole of Home's alerting.
 *
 * **It covers every area that can change.** It used to carry services, queued,
 * due today, late, the day's change and the next renewal: Systems, Home and
 * Finance, three of seven. People, News and the entire server-and-array surface
 * reached Home through nothing at all, which is how a faulty fan and a disk
 * with 128 read errors could both be true while Home said "all clear".
 *
 * **A tile is a question, its colour is the answer, and the link is where to
 * go.** Colour still only ever means "this needs you" — never "this is good",
 * never "this went down" — and now also means *look here*: red is failing or
 * already lost, amber is degraded or not known, gold is a deadline he can still
 * act on. Seven tiles carry an href; the three that read off the Today card
 * below them do not, because their answer is already on this page.
 *
 * **The day change is the deliberate exception.** Finance colours that same
 * figure by its sign, because there it is the subject. Here it would sit beside
 * colour that means "go and fix this" and look identical, and a red −0.4%
 * morning does not need anything doing before lunch.
 *
 * **Every collector's staleness lands on its own tile** — Kuma on services,
 * Unraid and the server on whitetower, HA on unavailable and today, Todoist on
 * due today and late, Horizon on the day change, RSS on unread. That is why
 * there is no "collectors" tile: no source can go quiet without the tile that
 * depends on it saying so. A stale source contributes an em dash and turns
 * amber, never a number that is no longer true.
 *
 * **Documents and Launcher get no tile, deliberately.** Both are reference
 * surfaces: the cheat sheet holds what he put in it and nothing arrives in it,
 * and the launcher's only health signal is Kuma's, which the services tile
 * already carries. A tile that can never change and never lights is dead width
 * in a strip whose whole job is to be scanned.
 */
type Tile = {
  /**
   * Stable across renders and **not** the label, which is not unique: the
   * schedule tile and the day-change tile can both read "today", and two
   * different tiles can both read "not known".
   */
  key: string;
  value: string;
  label: string;
  /** Only ever set when the tile wants something. */
  tone?: "down" | "warn" | "due";
  /** The page that explains it. Absent when that page is this one. */
  href?: string;
};

const TONE = {
  down:
    "border-destructive/50 bg-destructive/[0.07] text-destructive [a&]:hover:bg-destructive/[0.14]",
  warn: "border-warning/50 bg-warning/[0.07] text-warning [a&]:hover:bg-warning/[0.14]",
  due: "border-primary/50 bg-primary/[0.07] text-primary [a&]:hover:bg-primary/[0.14]",
} as const;

export async function StatBand({ today }: { today: Today }) {
  // `readGate` takes no argument on purpose: it is `cache()`-wrapped and keys
  // on its arguments, so a fresh Date here would defeat the dedupe with the
  // rail and the launcher.
  const [gate, systems, finance, { subscriptions }, people, news, mail] = await Promise.all([
    readGate(),
    readSystems(),
    readFinance(),
    readSubscriptions(),
    readPeople(),
    readNewsUnread(),
    readMailInbox(),
  ]);

  const next = subscriptions.find((s) => s.active);
  const tasksKnown = !today.todoist.stale;
  const houseKnown = !today.ha.stale;

  const tiles: Tile[] = [
    {
      key: "services",
      value: gate.stale ? "—" : `${gate.monitorsUp}/${gate.monitorsTotal}`,
      label: gate.stale ? "not known" : "services",
      tone: gate.stale
        ? "warn"
        : gate.state === "clear"
          ? undefined
          : gate.state === "degraded"
            ? "warn"
            : "down",
      href: "/systems",
    },
    whitetower(systems),
    {
      key: "unavailable",
      value: houseKnown ? String(systems.ha.unavailable?.count ?? 0) : "—",
      label: "unavailable",
      tone: houseKnown ? undefined : "warn",
      href: "/systems",
    },
    {
      key: "schedule",
      value: houseKnown ? String(today.events.length) : "—",
      label: "today",
      tone: houseKnown ? undefined : "warn",
    },
    {
      key: "due",
      value: tasksKnown ? String(today.dueToday.length) : "—",
      label: "due today",
      tone: tasksKnown ? undefined : "warn",
    },
    {
      key: "late",
      value: tasksKnown ? String(today.late.length) : "—",
      label: "late",
      tone: !tasksKnown ? "warn" : today.late.length > 0 ? "down" : undefined,
    },
  ];

  // Only once Gmail is connected: an inbox nobody has set up is not an empty
  // one, and a bare 0 would say it was.
  if (mail.configured) {
    tiles.push({
      key: "to-file",
      value: mail.stale ? "—" : String(mail.read),
      label: "to file",
      // **Never coloured, and that is a choice.** Read-and-unfiled is a
      // backlog, not a fault: it is normal for it to be non-zero, so a rule
      // like "above zero lights amber" would light it permanently and the tile
      // would become furniture — the same trap the unavailable tile is written
      // to avoid. A threshold can be set once Vincent knows his own steady
      // state, which is what this tile is for finding out.
      tone: mail.stale ? "warn" : undefined,
    });
  }

  // Only once Horizon is wired up: a section that has never been configured is
  // not a section that is failing, and an em dash would imply it was.
  if (finance.configured) {
    tiles.push({
      key: "day-change",
      value: finance.stale || !finance.summary ? "—" : percent(finance.summary.dayChangePercent),
      // "close" rather than "last close": the widest label in the band against
      // one of its widest values, and the word it loses says nothing.
      label: finance.summary && finance.priceDateIsToday ? "today" : "close",
      tone: finance.stale ? "warn" : undefined,
      href: "/finance",
    });
  }

  if (next) {
    tiles.push({
      key: "renewal",
      value: next.daysAway <= 0 ? "today" : `${next.daysAway}d`,
      label: next.daysAway <= 0 ? `${next.name} renews` : `to ${next.name}`,
      tone: next.soon ? "due" : undefined,
      href: "/finance",
    });
  }

  tiles.push(
    {
      key: "people",
      value: String(people.overdue),
      label: "to reach",
      // The one number `lib/people.ts` permits itself to roll up — PRD §6 puts
      // counting relationships out, and this is the exception the read layer
      // already returns pre-counted and the People page already renders.
      tone: people.overdue > 0 ? "due" : undefined,
      href: "/people",
    },
    {
      key: "news",
      value: news.stale ? "—" : String(news.unread),
      label: "unread",
      tone: news.stale ? "warn" : undefined,
      href: "/news",
    },
  );

  return (
    /*
      **As many tiles per row as fit, rather than a number written down.**

      It was a hardcoded ladder up to `2xl:grid-cols-10`, which was wrong on its
      own terms: **the tile count is already variable** — money and renewal
      appear only when Horizon and a subscription exist, and now `to file` only
      when Gmail does — so nine, ten or eleven tiles could all land in a grid
      told there were ten, orphaning one on a second row. Every tile added since
      has also needed the number edited, and this is the third such edit.

      `auto-fit` with a 132px floor does the arithmetic instead: eleven across
      on a maximised 1920 screen, folding on its own below that. The floor is
      what stops a label truncating, and it is the only number here now.
    */
    <div className="grid grid-cols-[repeat(auto-fit,minmax(132px,1fr))] gap-[8px]">
      {tiles.map((tile) => {
        const className = `flex min-w-0 items-baseline gap-[6px] rounded-[9px] border px-[10px] py-[8px] transition-colors ${
          tile.tone ? TONE[tile.tone] : "bg-card [a&]:hover:bg-muted"
        }`;

        const inner = (
          <>
            <span className="shrink-0 font-mono text-[15px] font-semibold">{tile.value}</span>
            <span className={`min-w-0 truncate text-[13px] ${tile.tone ? "" : "text-faint"}`}>
              {tile.label}
            </span>
          </>
        );

        return tile.href ? (
          <Link key={tile.key} href={tile.href} className={className}>
            {inner}
          </Link>
        ) : (
          <div key={tile.key} className={className}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

/**
 * WhiteTower itself: the array and the machine under it, in one tile.
 *
 * **Counts conditions, not rows.** Four disks with errors is one thing to look
 * at, not four — the same roll-up rule the monitors and the HA updates use.
 *
 * Everything counted here reached Home through nothing before this tile
 * existed: BMC health, faulty fans, an unreachable BMC, disk read/write errors,
 * parity sync errors and an array that is not started were all `/systems`-only,
 * and three of them render there in muted grey with no dot at all.
 *
 * **A stale half makes the whole tile an em dash.** The tile is a verdict on
 * one machine; half a verdict shown as a number would be exactly the thing
 * rule 2 exists to stop. Not connected is different, and stays uncoloured.
 */
function whitetower(sys: Systems): Tile {
  const base = { key: "whitetower", label: "whitetower", href: "/systems" } as const;

  const configured = [sys.unraid.configured, sys.server.configured].filter(Boolean).length;
  if (configured === 0) return { ...base, value: "—", label: "not connected" };

  if ((sys.unraid.configured && sys.unraid.stale) || (sys.server.configured && sys.server.stale)) {
    return { ...base, value: "—", label: "not known", tone: "warn" };
  }

  const array = sys.unraid.array;
  const parity = sys.unraid.parity;
  const hw = sys.server.hardware;

  // Spare parity: one disabled disk with a second parity behind it is being
  // covered. With none left, the next failure is data gone for good.
  const disabled = array?.disabled.length ?? 0;
  const spare = Math.max(0, (array?.disks.filter((d) => d.role === "Parity").length ?? 0) - disabled);

  const red = [
    array !== null && array.state !== "STARTED",
    disabled > 0 && spare === 0,
    hw?.health === "Critical",
  ].filter(Boolean).length;

  // Errors on a disk that is *not* the disabled one, which is its own
  // condition — a disabled disk reporting errors is the same fact twice.
  const erroring = array?.disks.some((d) => d.errors > 0 && !array.disabled.includes(d.name));

  const amber = [
    disabled > 0 && spare > 0,
    erroring ?? false,
    (parity?.errors ?? 0) > 0,
    hw?.unreachable != null,
    hw?.health != null && hw.health !== "OK" && hw.health !== "Critical",
    (hw?.fans.faulty.length ?? 0) > 0,
  ].filter(Boolean).length;

  const total = red + amber;
  if (total === 0) return { ...base, value: "ok" };

  return { ...base, value: String(total), label: "to check", tone: red > 0 ? "down" : "warn" };
}
