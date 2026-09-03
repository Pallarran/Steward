import Link from "next/link";

import { readFinance, percent } from "@/lib/finance";
import { readMailInbox, type MailInbox } from "@/lib/mail";
import { readNewsUnread } from "@/lib/news";
import { readPeople } from "@/lib/people";
import { readSubscriptions } from "@/lib/subscriptions";
import { readGate, readSystems, type Gate, type Systems } from "@/lib/systems";
import { Dot, type Tone } from "@/components/shell/dot";

/**
 * Five tiles, one per area Home cannot otherwise show.
 *
 * **This is the fifth shape of the band and the first that answers "is that
 * good or bad".** It grew to eleven tiles by accretion, one at a time, and
 * Vincent's verdict was that it was a mess: the colour code was not doing its
 * job and most tiles were unclear — *"3 today", "0 late": what does it refer
 * to?* Three faults, and they compounded.
 *
 * **Three tiles repeated the cards two inches away.** `3 today`, `5 due today`
 * and `0 late` were the Late, Today and Upcoming cards, in the same viewport.
 * That is exactly the redundancy argument that removed the gate card and the
 * `queued` tile, broken three times over — and the tell was there all along:
 * those were precisely the three tiles that could not link anywhere, because
 * their answer was already on this page.
 *
 * **Labels did not name their subject.** `today`, `close`, `unread`, `to file`
 * each parsed only if you already knew which area it belonged to. So the area
 * names itself now, on its own line, and that is the whole fix.
 *
 * **Colour had no way to say "fine".** Eight of eleven tiles were permanently
 * neutral and the rest lit only on failure, so a normal day was eleven
 * identical grey chips and `0 late` looked exactly like `12 to file`. The dot
 * is the state and the tint is the emphasis: a fine area is a plain card with a
 * teal dot, which is "fine" finally having an appearance, and an area that
 * wants something takes a tinted ground and a matching dot. The vocabulary is
 * the rail's own — `Dot` and its tones already speak it on `/systems` and in
 * the sidebar, and this was the one status surface not using it.
 *
 * **Each tile shows its area's most pressing fact, not a fixed metric.** The
 * Finance tile reads the day's change on an ordinary day and names a renewal
 * when one is inside its notice window, because that is then the more pressing
 * thing about money.
 *
 * `unavailable` went with the other three: a number with no threshold that
 * never lights is not an overview, it is furniture — the complaint in
 * miniature. Documents and Launcher still get nothing, for the reason they
 * never did: both are reference surfaces, and a tile that can never change is
 * dead width in a strip whose whole job is to be scanned.
 */
type Tile = {
  key: string;
  /** The area's own name. A tile that does not say this is unreadable cold. */
  area: string;
  /** The figure, in mono — null when the fact is words rather than a number. */
  lead: string | null;
  rest: string;
  tone: Tone;
  href: string;
  /** Gmail, the one place a tile points outside Steward. */
  external?: boolean;
};

/**
 * Tinted grounds, for the tones that want something. `ok` gets none.
 *
 * The colour is on the tile so the fact inherits it — the area's name keeps its
 * own `text-faint` and stays quiet, which is right: the name is a label, and it
 * is the *fact* that is urgent.
 */
const TINT: Partial<Record<Tone, string>> = {
  down: "border-destructive/50 bg-destructive/[0.07] text-destructive [a&]:hover:bg-destructive/[0.12]",
  degraded: "border-warning/50 bg-warning/[0.07] text-warning [a&]:hover:bg-warning/[0.12]",
  stale: "border-warning/50 bg-warning/[0.07] text-warning [a&]:hover:bg-warning/[0.12]",
  due: "border-primary/50 bg-primary/[0.07] text-primary [a&]:hover:bg-primary/[0.12]",
};

/**
 * Above this many read messages still sitting in the inbox, the Mail tile asks
 * for attention.
 *
 * **A guess, and it is meant to be moved.** A commit ago this tile was
 * deliberately never coloured, on the argument that a backlog is normally
 * non-zero and a rule like "above zero lights amber" would light it for ever.
 * Vincent then asked to be told whether a number is good or bad, and a
 * threshold is the only honest way to answer that — so there is one, it is
 * visible, and twenty-five is a starting point rather than a finding.
 */
const INBOX_FULL = 25;

export async function StatBand() {
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

  const tiles: Tile[] = [systemsTile(gate, systems)];

  if (mail.configured) tiles.push(mailTile(mail));

  // Only once Horizon is wired up: a section that has never been configured is
  // not a section that is failing, and an em dash would imply it was.
  if (finance.configured) {
    const next = subscriptions.find((s) => s.soon);

    tiles.push({
      key: "finance",
      area: "Finance",
      href: "/finance",
      // A renewal inside its window outranks the day's change: one is money
      // about to leave on a date, the other is a number that will be different
      // tomorrow.
      ...(next
        ? {
            lead: next.daysAway <= 0 ? "today" : `${next.daysAway}d`,
            rest: next.daysAway <= 0 ? `${next.name} renews` : `to ${next.name}`,
            tone: "due" as const,
          }
        : finance.stale || !finance.summary
          ? { lead: "—", rest: "not known", tone: "stale" as const }
          : {
              lead: percent(finance.summary.dayChangePercent),
              rest: finance.priceDateIsToday ? "today" : "at the close",
              // Never toned by its sign. Finance colours that same figure
              // because there it is the subject; here it would sit beside
              // colour that means "go and look" and read as an alarm.
              tone: "ok" as const,
            }),
    });
  }

  tiles.push(
    {
      key: "people",
      area: "People",
      href: "/people",
      lead: people.overdue > 0 ? String(people.overdue) : null,
      rest: people.overdue > 0 ? "to reach" : "nothing waiting",
      // The one number `lib/people.ts` permits itself to roll up — PRD §6 puts
      // counting relationships out, and this is the exception the read layer
      // already returns pre-counted and the People page already renders.
      tone: people.overdue > 0 ? "due" : "ok",
    },
    {
      key: "news",
      area: "News",
      href: "/news",
      lead: news.stale ? "—" : String(news.unread),
      rest: news.stale ? "not known" : "unread",
      // Never gold, whatever the count. Unread news is not a debt — rule 3
      // territory — and a tile that lit at four hundred would be lit for ever.
      tone: news.stale ? "stale" : "ok",
    },
  );

  return (
    // Five tiles, so the floor is wider than the eleven-tile band's 132px and
    // they stretch. Still `auto-fit` rather than a written-down count: three of
    // the five are conditional, so any fixed number can orphan one.
    <div className="grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-[8px]">
      {tiles.map((tile) => {
        const className = `flex min-w-0 flex-col gap-[3px] rounded-[10px] border px-[12px] py-[8px] transition-colors ${
          TINT[tile.tone] ?? "bg-card [a&]:hover:bg-muted"
        }`;

        const inner = (
          <>
            <span className="flex items-center gap-[6px]">
              <Dot tone={tile.tone} size={7} />
              <span className="truncate text-[12px] text-faint">{tile.area}</span>
            </span>

            <span className="flex min-w-0 items-baseline gap-[6px]">
              {tile.lead ? (
                <span className="shrink-0 font-mono text-[15px] font-semibold">{tile.lead}</span>
              ) : null}
              <span className="min-w-0 truncate text-[14px]">{tile.rest}</span>
            </span>
          </>
        );

        return tile.external ? (
          <a
            key={tile.key}
            href={tile.href}
            target="_blank"
            rel="noreferrer"
            className={className}
          >
            {inner}
          </a>
        ) : (
          <Link key={tile.key} href={tile.href} className={className}>
            {inner}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * The monitors, WhiteTower and the house, in one tile.
 *
 * **Three tiles became one.** Three out of eleven for a single page was
 * proportionate when the band was the only alerting on Home; now the tile names
 * the worst thing and links through, and the detail is one click away.
 *
 * **It names, rather than counts.** One problem reads as itself — `disk4
 * disabled`, `Plex is down` — and several roll up to `3 to check`, the rule the
 * monitors and the Home Assistant updates already use. A count alone is a
 * number you have to go and decode; a name is an answer.
 */
function systemsTile(gate: Gate, systems: Systems): Tile {
  const base = { key: "systems", area: "Systems", href: "/systems" } as const;

  const behind = staleCollectors(gate, systems);
  if (behind.length > 0) {
    // Rule 2 at the point it is easiest to get wrong: a source that has not
    // answered cannot contribute a verdict, and half a verdict shown as a
    // number would be worse than saying so.
    return {
      ...base,
      lead: null,
      rest: behind.length === 1 ? `${behind[0]} is behind` : `${behind.length} collectors behind`,
      tone: "stale",
    };
  }

  const { red, amber } = systemProblems(gate, systems);
  const all = [...red, ...amber];

  if (all.length === 0) {
    return { ...base, lead: `${gate.monitorsUp}/${gate.monitorsTotal}`, rest: "up", tone: "ok" };
  }

  return {
    ...base,
    lead: all.length === 1 ? null : String(all.length),
    rest: all.length === 1 ? all[0] : "to check",
    tone: red.length > 0 ? "down" : "degraded",
  };
}

/** Which of this tile's four sources have not answered recently enough. */
export function staleCollectors(gate: Gate, systems: Systems): string[] {
  const behind: string[] = [];

  if (gate.stale) behind.push("Uptime Kuma");
  if (systems.unraid.configured && systems.unraid.stale) behind.push("Unraid");
  if (systems.server.configured && systems.server.stale) behind.push("the server");
  if (systems.ha.stale) behind.push("Home Assistant");

  return behind;
}

/**
 * Everything wrong with the house, named.
 *
 * `red` is failing or already losing something; `amber` is degraded or wants
 * looking at. Both are phrases rather than counts, so a tile with exactly one
 * problem can say what it is.
 *
 * Assumes nothing is stale — `systemsTile` checks that first, because a stale
 * source contributes no opinion at all rather than a stale one.
 */
export function systemProblems(gate: Gate, systems: Systems): { red: string[]; amber: string[] } {
  const red: string[] = [];
  const amber: string[] = [];

  for (const problem of gate.problems) {
    if (problem.kind === "down") red.push(`${problem.name} is down`);
    else if (problem.kind === "degraded") {
      const names = problem.disks.join(", ");
      if (problem.spare === 0) red.push(`${names} disabled, no parity spare`);
      else amber.push(`${names} disabled`);
    }
  }

  const array = systems.unraid.array;
  if (array && array.state !== "STARTED") red.push("the array is not started");

  if (array) {
    // Errors on a disk that is *not* the disabled one, which is its own
    // condition — a disabled disk reporting errors is the same fact twice.
    const erroring = array.disks.filter(
      (d) => d.errors > 0 && !array.disabled.includes(d.name),
    );
    if (erroring.length === 1) amber.push(`${erroring[0].name} has read errors`);
    else if (erroring.length > 1) amber.push(`${erroring.length} disks have read errors`);
  }

  const parity = systems.unraid.parity;
  if (parity && parity.errors > 0) amber.push(`${parity.errors} parity errors`);

  const hw = systems.server.hardware;
  if (hw) {
    if (hw.unreachable) amber.push("the BMC will not answer");
    else if (hw.health === "Critical") red.push("the BMC reports critical");
    else if (hw.health && hw.health !== "OK") amber.push(`the BMC reports ${hw.health}`);

    const faulty = hw.fans.faulty;
    if (faulty.length === 1) amber.push(`${faulty[0]} is not OK`);
    else if (faulty.length > 1) amber.push(`${faulty.length} fans are not OK`);
  }

  return { red, amber };
}

function mailTile(mail: MailInbox): Tile {
  const base = {
    key: "mail",
    area: "Mail",
    // The one tile that leaves Steward. Filing is done in Gmail and there is no
    // Steward page for the inbox — the queue is unread mail, not this.
    href: "https://mail.google.com/mail/u/0/#inbox",
    external: true,
  } as const;

  if (mail.stale) return { ...base, lead: "—", rest: "not known", tone: "stale" };
  // "nothing to file", not "inbox clear": unread mail may well be sitting in
  // the queue on this same page, and this tile is only ever about the read
  // backlog. A tile that claimed a clear inbox beside five unread rows would be
  // wrong in the most visible way available to it.
  if (mail.read === 0) return { ...base, lead: null, rest: "nothing to file", tone: "ok" };

  return {
    ...base,
    lead: String(mail.read),
    rest: "to file",
    tone: mail.read > INBOX_FULL ? "due" : "ok",
  };
}
