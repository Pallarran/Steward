import crypto from "crypto";
import { prisma } from "@/lib/db/prisma";
import { writeFact } from "@/lib/facts";
import { request } from "./http";
import type { Adapter } from "./types";

/**
 * The unavailable-entity count, for the Systems page.
 *
 * A fact rather than a queue row: it is current state that resolves itself when
 * a device comes back, not something that arrived and needs clearing.
 *
 * `ignored` is how many were excluded by the rule below, kept so the number can
 * be explained rather than merely trusted.
 */
export const HA_UNAVAILABLE = "ha:unavailable";
export type UnavailableFact = {
  count: number;
  entities: string[];
  ignored: number;
  at: string;
};

/**
 * Domains that are `unavailable` by design, and are therefore not a fault.
 *
 * Measured, not guessed. The first run on the live instance reported 63
 * unavailable entities, and the sample was Chrome eight times, Firefox twice,
 * a TV, "Family room TV Cast" and "Family room TV Remote": Cast targets and
 * media players go unavailable whenever the device is off or the browser is
 * closed, which is most of the time. A count that reads 63 every day is
 * wallpaper, not a signal, and a panel nobody believes is worse than no panel.
 *
 * `device_tracker` is here for the same reason — a phone that has left the
 * house is not a broken phone.
 */
const ALWAYS_COMING_AND_GOING = new Set(["media_player", "remote", "device_tracker"]);

const TIMEOUT_MS = 15_000;

/** How far ahead to fetch. Waste collection is weekly, so a week plus a day. */
const WINDOW_DAYS = 8;

/**
 * The calendars that become events on the Today card.
 *
 * `sharedWith` marks an event as someone else's. Marylene's is here at
 * Vincent's decision: her 07:45 transport runs shape his morning whether or
 * not the errand is his, and Today claims to hold everything time-bound today.
 *
 * Chosen from what the calendars actually contain, not from their names.
 */
const EVENT_CALENDARS: { id: string; sharedWith?: string }[] = [
  { id: "calendar.vincent" },
  { id: "calendar.family" },
  { id: "calendar.couple" },
  { id: "calendar.both_girls" },
  { id: "calendar.annabelle" },
  { id: "calendar.naomi" },
  { id: "calendar.school" },
  { id: "calendar.canada" },
  { id: "calendar.cleaning" },
  { id: "calendar.marylene", sharedWith: "Marylene" },
];

/**
 * Read for their own line on the card rather than as events.
 *
 * Deliberately absent from both lists: `calendar.home` and `calendar.inbox`.
 * They are the Home Assistant Todoist integration mirroring the tasks Steward
 * already reads from Todoist directly — all 28 of calendar.home's events
 * matched a Todoist task by exact title, so including them would show every
 * task twice.
 */
export const MEAL_CALENDAR = "calendar.meal_plan";
export const WASTE_CALENDARS = ["calendar.garbage", "calendar.recycling_and_compost"];
export const SCHOOL_DAY_CALENDAR = "calendar.school_day";

const ALL_CALENDARS = [
  ...EVENT_CALENDARS.map((c) => c.id),
  MEAL_CALENDAR,
  ...WASTE_CALENDARS,
  SCHOOL_DAY_CALENDAR,
];

type HaEvent = {
  summary?: string;
  description?: string | null;
  location?: string | null;
  uid?: string | null;
  recurrence_id?: string | null;
  start: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
};

type HaState = { entity_id: string; state: string; attributes: Record<string, unknown> };

function auth() {
  const base = process.env.HA_BASE_URL;
  const token = process.env.HA_TOKEN;
  if (!base || !token) throw new Error("HA_BASE_URL and HA_TOKEN are not set");
  return { base, headers: { Authorization: `Bearer ${token}` } };
}

async function get<T>(path: string): Promise<T> {
  const { base, headers } = auth();
  const response = await request(`${base}${path}`, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Home Assistant answered ${response.status} ${response.statusText} for ${path}`);
  }
  return (await response.json()) as T;
}

/** Local midnight, as the ISO string Home Assistant's calendar API expects. */
function windowFor(now: Date) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + WINDOW_DAYS);
  const iso = (d: Date) => d.toISOString().slice(0, 19);
  return { start: iso(start), end: iso(end) };
}

export const haAdapter: Adapter = {
  key: "ha",
  intervalSeconds: 300,

  async run(now) {
    // ---- Calendars --------------------------------------------------------
    const available = await get<{ entity_id: string; name: string }[]>("/api/calendars");
    const known = new Set(available.map((c) => c.entity_id));

    // Fail loudly on a calendar that has been renamed or removed. Quietly
    // fetching nothing would empty the Today card and read as "nothing on".
    const missing = ALL_CALENDARS.filter((id) => !known.has(id));
    if (missing.length > 0) {
      throw new Error(`Home Assistant has no calendar ${missing.join(", ")}`);
    }

    const { start, end } = windowFor(now);
    const sharedBy = new Map(EVENT_CALENDARS.map((c) => [c.id, c.sharedWith]));

    let events = 0;
    for (const calendarId of ALL_CALENDARS) {
      const fetched = await get<HaEvent[]>(
        `/api/calendars/${calendarId}?start=${start}&end=${end}`,
      );

      for (const e of fetched) {
        const allDay = Boolean(e.start.date);
        const startDate = (e.start.date ?? e.start.dateTime ?? "").slice(0, 10);
        if (!startDate) continue;

        // uid is stable per event; the start date separates one instance of a
        // recurring event from the next.
        const externalId = `${calendarId}:${e.uid ?? e.summary ?? "?"}:${startDate}`;

        const data = {
          calendarId,
          summary: e.summary?.trim() || "(untitled)",
          description: e.description?.trim() || null,
          location: e.location?.trim() || null,
          startDate,
          startAt: e.start.dateTime ? new Date(e.start.dateTime) : null,
          endAt: e.end?.dateTime ? new Date(e.end.dateTime) : null,
          allDay,
          sharedWith: sharedBy.get(calendarId) ?? null,
          seenAt: now,
        };

        await prisma.calendarEvent.upsert({
          where: { externalId },
          update: data,
          create: { externalId, ...data },
        });
        events++;
      }
    }

    // Anything absent from a successful poll has been moved, cancelled or has
    // fallen out of the window. Home Assistant is authoritative.
    const prunedEvents = await prisma.calendarEvent.deleteMany({ where: { seenAt: { lt: now } } });

    const states = await get<HaState[]>("/api/states");

    // ---- Unavailable entities ---------------------------------------------
    // `unknown` is deliberately excluded. Plenty of entities are legitimately
    // unknown between readings, so counting them would turn this from a signal
    // into noise; `unavailable` means the device is not answering.
    const offline = states.filter((s) => s.state === "unavailable");
    const faulty = offline.filter(
      (s) => !ALWAYS_COMING_AND_GOING.has(s.entity_id.split(".")[0] ?? ""),
    );

    await writeFact(HA_UNAVAILABLE, {
      count: faulty.length,
      // Enough to name the problem without storing the whole house.
      entities: faulty
        .map((s) => String(s.attributes.friendly_name ?? s.entity_id))
        .sort()
        .slice(0, 20),
      ignored: offline.length - faulty.length,
      at: now.toISOString(),
    } satisfies UnavailableFact);

    // ---- Updates ----------------------------------------------------------
    const pending = states.filter((s) => s.entity_id.startsWith("update.") && s.state === "on");

    // The split comes from the data, not from matching names. Core, the OS,
    // the Supervisor and the add-ons carry a `title` attribute; HACS cards,
    // HACS integrations and device firmware do not. Of 58 update entities, 10
    // have a title and 48 do not.
    const named = pending.filter((s) => typeof s.attributes.title === "string");
    const rest = pending.filter((s) => typeof s.attributes.title !== "string");

    const wantedUpdates: string[] = [];

    for (const u of named) {
      const version = String(u.attributes.latest_version ?? "");
      wantedUpdates.push(`${u.entity_id}:${version}`);
      await upsertUpdateItem({
        // The version is part of the id, so dismissing 2026.8.1 does not also
        // hide 2026.9.0 when it lands.
        externalId: `${u.entity_id}:${version}`,
        title: `${String(u.attributes.title)} ${version} is available`.trim(),
        subtitle: String(u.attributes.installed_version ?? "") || null,
        priority: 10,
        now,
      });
    }

    if (rest.length > 0) {
      // One line, not forty-eight. The id is a digest of exactly which ones,
      // so dismissing "3 waiting" does not also hide "7 waiting" next week.
      const ids = rest.map((s) => s.entity_id).sort();
      const digest = crypto.createHash("sha1").update(ids.join(",")).digest("hex").slice(0, 12);
      const names = rest
        .map((s) => String(s.attributes.friendly_name ?? s.entity_id).replace(/ Update$/, ""))
        .sort();

      wantedUpdates.push(`rollup:${digest}`);
      await upsertUpdateItem({
        externalId: `rollup:${digest}`,
        title: `${rest.length} component ${rest.length === 1 ? "update" : "updates"} waiting in Home Assistant`,
        subtitle: names.slice(0, 4).join(", ") + (names.length > 4 ? `, and ${names.length - 4} more` : ""),
        priority: 40,
        now,
      });
    }

    // An installed update stops being reported, and its row has to go with it.
    // Without this, "Core 2026.8.1 is available" would sit in the queue forever
    // after the update was applied: the item records a *pending* update, and it
    // stops being true the moment the update is installed. Found while building
    // the Systems page, which is what made a stale row visible as a wrong fact
    // rather than just an extra queue line.
    //
    // Scoped to `systems`, which for this source means updates and nothing else
    // today. A future Home Assistant systems item must either join this list or
    // carry its own category.
    const prunedUpdates = await prisma.item.deleteMany({
      where: {
        source: "ha",
        category: "systems",
        ...(wantedUpdates.length > 0 ? { externalId: { notIn: wantedUpdates } } : {}),
      },
    });

    return `${events} events (${prunedEvents.count} pruned), ${named.length} named updates, ${rest.length} rolled up (${prunedUpdates.count} gone), ${faulty.length} unavailable (${offline.length - faulty.length} ignored)`;
  },
};

async function upsertUpdateItem(args: {
  externalId: string;
  title: string;
  subtitle: string | null;
  priority: number;
  now: Date;
}) {
  await prisma.item.upsert({
    where: { source_externalId: { source: "ha", externalId: args.externalId } },
    // status untouched: a dismissed update stays dismissed.
    update: { title: args.title, subtitle: args.subtitle, priority: args.priority },
    create: {
      source: "ha",
      externalId: args.externalId,
      category: "systems",
      title: args.title,
      subtitle: args.subtitle,
      priority: args.priority,
      occurredAt: args.now,
    },
  });
}
