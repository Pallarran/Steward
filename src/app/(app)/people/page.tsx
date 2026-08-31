import { Trash2 } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { readPeople, type PersonView } from "@/lib/people";
import { duration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { AddPersonForm } from "./add-person-form";
import { deletePerson, recordContact, undoContact } from "./actions";

export const metadata = { title: "People · Steward" };

/**
 * Relationships — PRD component 8.
 *
 * Steward owns this list outright; there is no source to collect it from. The
 * page is deliberately plain: one line per person, how long it has been, and
 * one button.
 *
 * **Nothing here counts anything up.** No streak, no monthly total, no score,
 * and this stays out of the XP economy when the game layer arrives. PRD §6:
 * measurement alone made an activity feel like work and cut voluntary
 * continuation from 48.5% to 27.3%. Vincent decided to keep last-contact
 * visible anyway, judging that evidence adjacent rather than about this case —
 * and §2 lists watching whether it changes how the calls feel. **If it does,
 * this page is the thing that changes.**
 */
export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuth();

  const now = new Date();
  const [{ people, overdue }, params] = await Promise.all([readPeople(now), searchParams]);

  const contacted = one(params.contacted);
  const justContacted = contacted ? people.find((p) => p.id === contacted) : undefined;

  return (
    <>
      <header className="flex flex-col gap-[2px]">
        <h1 className="text-[21px] font-bold tracking-[-0.02em]">People</h1>
        <p className="text-[13px] text-muted-foreground">
          {people.length === 0
            ? "nobody yet"
            : overdue === 0
              ? "nobody has slipped"
              : `${overdue} past the mark you set`}
        </p>
      </header>

      {/* The undo. A mis-tap would otherwise destroy the real date silently,
          and this list exists nowhere else to recover it from. */}
      {justContacted ? (
        <div className="flex items-center justify-between gap-[12px] rounded-[10px] border border-primary/40 bg-card px-[16px] py-[11px]">
          <span className="text-[13px]">Marked as spoken to {justContacted.name}.</span>
          <form action={undoContact}>
            <input type="hidden" name="id" value={justContacted.id} />
            <Button type="submit" variant="secondary" size="sm">
              Undo
            </Button>
          </form>
        </div>
      ) : null}

      {people.length > 0 ? (
        <section className="flex flex-col gap-[2px] rounded-[10px] border bg-card px-[10px] py-[10px]">
          {people.map((person) => (
            <Row key={person.id} person={person} now={now} />
          ))}
        </section>
      ) : null}

      <section className="flex flex-col gap-[13px] rounded-[10px] border bg-card px-[18px] py-[17px]">
        <h2 className="text-[15px] font-semibold">Add someone</h2>
        <AddPersonForm />
        <p className="text-[13px] leading-[1.6] text-muted-foreground">
          The number of days is the point at which Steward puts one quiet line in the queue. Leave
          it blank and it never will — some people are worth keeping in view without a clock on
          them. There is no suggested value on purpose: a threshold you did not choose is one the
          system chose for you.
        </p>
      </section>
    </>
  );
}

function Row({ person, now }: { person: PersonView; now: Date }) {
  return (
    <div className="flex items-center gap-[13px] rounded-[9px] px-[12px] py-[11px] hover:bg-card-hover">
      <div className="flex min-w-0 grow flex-col gap-[3px]">
        <span className="flex items-baseline gap-[9px]">
          <span className="truncate text-[14px] font-medium">{person.name}</span>
          {person.relation ? (
            <span className="shrink-0 text-[12px] text-faint">{person.relation}</span>
          ) : null}
        </span>

        <span className="truncate text-[12px] text-muted-foreground">
          {person.lastContactAt
            ? `${duration(person.lastContactAt, now)} ago`
            : "no contact recorded"}
          {person.intention ? ` · ${person.intention}` : ""}
        </span>

        {/*
          A bar rather than a number. It says "it has been a while" without
          putting a count on a friendship — the distinction PRD §6 draws
          between a progress display, which helps, and a counter, which does
          the damage.
        */}
        {person.fraction !== null ? (
          <span className="mt-[2px] h-[3px] w-full max-w-[220px] overflow-hidden rounded-full bg-secondary">
            <span
              className="block h-full rounded-full"
              style={{
                width: `${Math.round(person.fraction * 100)}%`,
                background: person.overdue ? "var(--warning)" : "var(--teal)",
              }}
            />
          </span>
        ) : null}
      </div>

      <form action={recordContact}>
        <input type="hidden" name="id" value={person.id} />
        <Button type="submit" variant="secondary" size="sm">
          Spoke to them
        </Button>
      </form>

      <form action={deletePerson}>
        <input type="hidden" name="id" value={person.id} />
        <button
          type="submit"
          aria-label={`Remove ${person.name}`}
          title="Remove"
          className="flex size-[24px] shrink-0 items-center justify-center rounded-[6px] text-faint transition-colors hover:bg-secondary hover:text-destructive"
        >
          <Trash2 size={14} strokeWidth={1.8} />
        </button>
      </form>
    </div>
  );
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
