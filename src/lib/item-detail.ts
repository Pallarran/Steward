import { prisma } from "@/lib/db/prisma";
import { readFact } from "@/lib/facts";
import { UNRAID_ARRAY, UNRAID_PARITY, type ArrayFact, type ParityFact } from "@/lib/adapters/unraid";
import type { MailDetail } from "@/lib/adapters/gmail";
import type { TodoistDetail } from "@/lib/adapters/todoist";
import { CADENCE_LABEL, monthlyEquivalentCents, nextRenewal } from "@/lib/subscriptions";
import { monthLabel } from "@/lib/couple";
import { money, moneyExact } from "@/lib/finance";
import { clock, duration } from "@/lib/format";

/**
 * What the detail dialog shows beyond the row itself.
 *
 * **Built here rather than fetched with the queue.** `listQueue` reads the
 * `Item` and joins nothing, and joining every source for every row would be
 * work thrown away on the rows nobody opens — which is most of them. So this
 * runs once, when a dialog opens. It is also where the cached model summary
 * comes from, for the same reason turned around: `listQueue` deliberately
 * *omits* that column so mail text never rides along to the browser.
 *
 * **The join key is the `externalId`, and every format is already fixed** by the
 * adapter that writes it: `down:<monitor name>`, `renewal:<id>:<date>`,
 * `child:<person id>`, `open:<YYYY-MM>`, and so on. Those strings are a
 * contract between the producer and this file, and changing one without the
 * other silently produces an empty dialog rather than an error.
 *
 * **Two sources have nothing to join to** — Gmail and Todoist's Inbox — because
 * Steward stores no mail at all and `Task` deliberately excludes Inbox tasks.
 * Both carry what the dialog needs on `Item.detail` instead. That column exists
 * for exactly this, and for nothing that could be joined.
 */
export type DetailFact = {
  label: string;
  value: string;
  /** Figures, ids and times, which line up better in the mono face. */
  mono?: boolean;
};

export type ItemDetail = {
  facts: DetailFact[];
  /** Extra destinations. The row's own `url` is rendered separately. */
  links: { label: string; href: string }[];
  /** Why there is nothing more to say, when there is nothing more. */
  note: string | null;
  /**
   * The cached model summary, if one has been asked for.
   *
   * It rides here rather than on `QueueItem` because `listQueue` omits it: for
   * mail this is the only trace of a body Steward holds, and it has no business
   * in a page payload for rows nobody opened. This call already happens when
   * the dialog opens, so carrying it costs nothing extra.
   */
  summary: string | null;
  /**
   * A summary has been attempted, whatever came of it.
   *
   * `summary === null` with this true means there was nothing readable to
   * summarise — a calendar invite, an image-only newsletter — and there never
   * will be. The dialog says so rather than offering a button that can only
   * fail, which is what it would do if it went by `summary` alone.
   */
  summaryTried: boolean;
};

type Bare = Omit<ItemDetail, "summary" | "summaryTried">;

const NOTHING: Bare = { facts: [], links: [], note: null };

export async function readItemDetail(id: string, now: Date = new Date()): Promise<ItemDetail> {
  const item = await prisma.item.findUnique({ where: { id } });
  if (!item) {
    return { ...NOTHING, summary: null, summaryTried: false, note: "That row is gone." };
  }

  const detail = await forSource(item, now);
  return { ...detail, summary: item.summary, summaryTried: item.summarisedAt !== null };
}

type Row = NonNullable<Awaited<ReturnType<typeof prisma.item.findUnique>>>;

async function forSource(item: Row, now: Date): Promise<Bare> {
  switch (item.source) {
    case "kuma":
      return kuma(item.externalId, now);
    case "subscriptions":
      return subscription(item.externalId, now);
    case "people":
      return people(item.externalId, now);
    case "unraid":
      return unraid();
    case "ha":
      return ha(item.externalId);
    case "todoist":
      return todoist(item.detail);
    case "gmail":
      return gmail(item.externalId, item.detail);
    default:
      return NOTHING;
  }
}

/* ------------------------------------------------------------------ Kuma */

async function kuma(externalId: string, now: Date): Promise<Bare> {
  const key = externalId.replace(/^down:/, "");

  // A roll-up names no single monitor, but the row was written from exactly the
  // set that is down, so reading that set back reproduces it.
  if (key.startsWith("rollup:")) {
    const down = await prisma.monitor.findMany({
      where: { status: "down" },
      orderBy: { name: "asc" },
    });

    return {
      facts: down.map((m) => ({
        label: m.name,
        value: `down for ${duration(m.changedAt, now)}`,
      })),
      links: [],
      note: down.length === 0 ? "They have all recovered since this row was written." : null,
    };
  }

  const monitor = await prisma.monitor.findUnique({ where: { name: key } });
  if (!monitor) return { ...NOTHING, note: "Uptime Kuma no longer reports this monitor." };

  const facts: DetailFact[] = [
    { label: "Down since", value: `${clock(monitor.changedAt)}, ${duration(monitor.changedAt, now)} ago` },
    // Kuma writes the literal string "null" rather than omitting the label, so
    // the column is nullable and a check with no type is normal, not broken.
    ...(monitor.type ? [{ label: "Check", value: monitor.type, mono: true }] : []),
  ];

  // The last figure Kuma recorded, which is from before it fell over — worth
  // saying, because otherwise it reads as a response it just got.
  if (monitor.responseMs !== null) {
    facts.push({ label: "Last response", value: `${monitor.responseMs} ms`, mono: true });
  }

  return {
    facts,
    // The service's own address, which the row deliberately does not link to:
    // its url is the one guaranteed not to answer while it is down, so it
    // belongs here as a way to check rather than there as the way out.
    links: monitor.url ? [{ label: "The service itself", href: monitor.url }] : [],
    note: null,
  };
}

/* --------------------------------------------------------- Subscriptions */

async function subscription(externalId: string, now: Date): Promise<Bare> {
  const id = externalId.split(":")[1] ?? "";
  const sub = await prisma.subscription.findUnique({ where: { id } });
  if (!sub) return { ...NOTHING, note: "That subscription has been deleted." };

  const next = nextRenewal(sub.renewsOn, sub.cadence, now);

  const facts: DetailFact[] = [
    // Both halves, which the row cannot show: `subtitle()` prints the price or
    // "cancel link attached", never both, so a subscription with a cancel link
    // has never shown Vincent what it costs.
    {
      label: "Amount",
      value: `${moneyExact(sub.amountCents, sub.currency)} ${CADENCE_LABEL[sub.cadence]}`,
      mono: true,
    },
    {
      label: "Monthly equivalent",
      value: money(monthlyEquivalentCents(sub), sub.currency),
      mono: true,
    },
    {
      label: "Renews",
      value: next.toISOString().slice(0, 10),
      mono: true,
    },
  ];

  if (sub.card) facts.push({ label: "Card", value: sub.card, mono: true });
  if (sub.noticeDays !== null) {
    facts.push({ label: "Notice", value: `${sub.noticeDays} days`, mono: true });
  }
  if (sub.notes) facts.push({ label: "Notes", value: sub.notes });
  if (!sub.active) facts.push({ label: "Status", value: "cancelled" });

  return { facts, links: [], note: null };
}

/* ---------------------------------------------------------------- People */

async function people(externalId: string, now: Date): Promise<Bare> {
  if (externalId.startsWith("open:")) {
    const month = externalId.slice("open:".length);
    const slot = await prisma.coupleSlot.findUnique({ where: { month } });
    const ideas = await prisma.idea.findMany({
      where: { personId: null, usedAt: null },
      orderBy: { createdAt: "desc" },
      take: 5,
    });

    return {
      facts: [
        { label: "Month", value: monthLabel(month) },
        { label: "Status", value: slot?.status ?? "open" },
        ...(slot?.title ? [{ label: "Idea so far", value: slot.title }] : []),
        ...(slot?.notes ? [{ label: "Notes", value: slot.notes }] : []),
        ...ideas.map((i) => ({ label: "From the bank", value: i.text })),
      ],
      links: [],
      note: ideas.length === 0 && !slot?.title ? "The shared idea bank is empty." : null,
    };
  }

  const id = externalId.split(":")[1] ?? "";
  const person = await prisma.person.findUnique({
    where: { id },
    include: { ideas: { where: { usedAt: null }, orderBy: { createdAt: "desc" }, take: 5 } },
  });
  if (!person) return { ...NOTHING, note: "That person has been removed." };

  const facts: DetailFact[] = [];
  if (person.relation) facts.push({ label: "Who", value: person.relation });
  if (person.intention) facts.push({ label: "Intention", value: person.intention });
  facts.push({ label: "Every", value: `${person.cadenceDays} days`, mono: true });
  facts.push({
    label: "Last contact",
    value: person.lastContactAt
      ? `${duration(person.lastContactAt, now)} ago`
      : "not recorded",
    mono: true,
  });
  if (person.planTitle) facts.push({ label: "Planned", value: person.planTitle });
  for (const idea of person.ideas) facts.push({ label: "Idea", value: idea.text });

  return {
    facts,
    links: [],
    note: person.ideas.length === 0 && !person.planTitle ? "Nothing in her bank yet." : null,
  };
}

/* ---------------------------------------------------------------- Unraid */

async function unraid(): Promise<Bare> {
  const [array, parity] = await Promise.all([
    readFact<ArrayFact>(UNRAID_ARRAY),
    readFact<ParityFact>(UNRAID_PARITY),
  ]);
  if (!array) return { ...NOTHING, note: "The array has not been read yet." };

  const value = array.value;
  const facts: DetailFact[] = [{ label: "Array", value: value.state.toLowerCase(), mono: true }];

  for (const disk of value.disks.filter((d) => value.disabled.includes(d.name))) {
    facts.push({
      label: disk.name,
      value: [disk.status, disk.tempC !== null ? `${disk.tempC}°C` : null, `${disk.errors} errors`]
        .filter(Boolean)
        .join(" · "),
      mono: true,
    });
  }

  const spare = value.disks.filter((d) => d.role === "Parity").length - value.disabled.length;
  facts.push({
    label: "Parity spare",
    value: spare > 0 ? `${spare} left` : "none left — the next failure loses data",
    mono: spare > 0,
  });

  if (parity && parity.value.status !== "idle") {
    facts.push({
      label: "Parity check",
      value: `${parity.value.status}${parity.value.percent !== null ? ` at ${parity.value.percent}%` : ""} · ${parity.value.errors} errors`,
      mono: true,
    });
  }

  return { facts, links: [], note: null };
}

/* ------------------------------------------------------- Home Assistant */

function ha(externalId: string): Bare {
  if (externalId.startsWith("system:")) {
    // `system:<entity_id>:<version>` — and entity ids contain no colon, so a
    // plain split is safe here in a way it would not be generally.
    const [, entity, version] = externalId.split(":");
    return {
      facts: [
        { label: "Entity", value: entity ?? "unknown", mono: true },
        { label: "Available", value: version ?? "unknown", mono: true },
      ],
      links: [],
      note: null,
    };
  }

  // Add-on, HACS and firmware roll-ups. Steward stores only the counts, so the
  // row's own subtitle — the first four names — is genuinely the richest record
  // that exists anywhere in the database. Saying so beats an empty panel.
  return {
    facts: [],
    links: [],
    note: "Home Assistant is where these get installed; Steward only counts them.",
  };
}

/* --------------------------------------------------------------- Todoist */

function todoist(raw: unknown): Bare {
  const detail = raw as TodoistDetail | null;
  if (!detail) {
    // Rows written before 2026-09-02 carry no detail and are not rewritten
    // until the next poll, which is at most five minutes away.
    return { ...NOTHING, note: "Not collected yet — this fills in on the next poll." };
  }

  const facts: DetailFact[] = [];
  if (detail.description) facts.push({ label: "Note", value: detail.description });
  if (detail.due) facts.push({ label: "Due", value: detail.due });
  if (detail.labels.length > 0) {
    facts.push({ label: "Labels", value: detail.labels.join(", "), mono: true });
  }

  return {
    facts,
    links: [],
    note: facts.length === 0 ? "Just the line — no note, no labels, no date." : null,
  };
}

/* ----------------------------------------------------------------- Gmail */

function gmail(externalId: string, raw: unknown): Bare {
  if (externalId === "unread:more" || externalId.startsWith("unread:rollup:")) {
    return { ...NOTHING, note: "This row stands for several messages." };
  }

  const detail = raw as MailDetail | null;
  return {
    facts: detail?.fromAddress ? [{ label: "From", value: detail.fromAddress, mono: true }] : [],
    links: [],
    // Steward reads envelopes and never a body, so there is genuinely nothing
    // else stored. The summary button is the way to learn more, and it fetches
    // the message rather than reading something Steward kept.
    note: detail?.fromAddress ? null : "Not collected yet — this fills in on the next poll.",
  };
}
