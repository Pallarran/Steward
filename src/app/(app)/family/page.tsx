import { Trash2 } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import {
  monthKey,
  monthLabel,
  OWNER,
  readFamily,
  type IdeaRow,
  type KidView,
  type SlotRow,
} from "@/lib/family";
import { duration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddSlotForm } from "./add-slot-form";
import {
  addIdea,
  addKid,
  completeOuting,
  deleteIdea,
  deleteKid,
  deleteSlot,
  updateKid,
  updateSlot,
  useIdea,
  useKidIdea,
} from "./actions";

export const metadata = { title: "Family · Steward" };

const STATUS: Record<string, { label: string; colour: string }> = {
  open: { label: "needs an idea", colour: "var(--warning)" },
  planning: { label: "in planning", colour: "var(--blue)" },
  booked: { label: "booked", colour: "var(--teal)" },
  done: { label: "done", colour: "var(--faint)" },
};

/**
 * The family planner — PRD component 5, and the `TabFamily` artboard.
 *
 * **Steward owns this**, decided 2026-08-31. Cowork stays where Vincent
 * explores ideas and works out a plan; Steward holds what is parked and what is
 * booked, so there is always a view and a nudge. The vault therefore stays
 * unmounted, and the regulatory question about `Work-HQ` never arises.
 *
 * Layout follows the artboard: the couple plan and its bank fill the width, and
 * *One on one* sits in a fixed right column — the same 340px the Today card
 * uses on Home, rather than the artboard's 400px, so the two pages agree.
 *
 * **Not built: "Coming up".** The artboard's fourth card lists birthdays from
 * `calendar.anniversaries`, which is v3 — and the artboard annotates its own
 * limitation, that the calendar holds six entries and nothing for extended
 * family. Steward can only surface what is in there, so an almost-empty panel
 * would advertise a gap rather than fill one.
 */
export default async function FamilyPage() {
  await requireAuth();

  const now = new Date();
  const { slots, ideas, kids, openForVincent } = await readFamily(now);

  const waiting = kids.filter((k) => k.overdue).length;

  return (
    <>
      <header className="flex flex-col gap-[2px]">
        <h1 className="text-[21px] font-bold tracking-[-0.02em]">Family</h1>
        <p className="text-[13px] text-muted-foreground">{verdict(openForVincent.length, waiting)}</p>
      </header>

      <div className="flex items-start gap-[16px]">
        <div className="flex min-w-0 grow flex-col gap-[20px]">
          <section className="flex flex-col gap-[11px]">
            <div className="flex items-baseline justify-between gap-[12px]">
              <h2 className="text-[15px] font-semibold">Couple nights</h2>
              <span className="font-mono text-[11px] text-faint">
                she plans odd months, you plan even
              </span>
            </div>

            {slots.length === 0 ? (
              <Panel>
                <p className="text-[13px] leading-[1.6] text-muted-foreground">
                  Nothing yet. Add the months you want on the plan — whose turn it is follows the
                  odd and even rule, and you can change it, because you two swap.
                </p>
              </Panel>
            ) : (
              <div className="flex flex-col gap-[6px]">
                {slots.map((slot) => (
                  <Slot key={slot.id} slot={slot} ideas={ideas} />
                ))}
              </div>
            )}

            <Panel>
              <AddSlotForm suggested={monthKey(now, 2)} />
            </Panel>
          </section>

          <section className="flex flex-col gap-[11px]">
            <div className="flex items-baseline justify-between gap-[12px]">
              <h2 className="text-[15px] font-semibold">Idea bank</h2>
              <span className="font-mono text-[11px] text-faint">
                {ideas.length} {ideas.length === 1 ? "idea" : "ideas"} waiting
              </span>
            </div>

            <Panel>
              <div className="flex flex-col gap-[10px]">
                <form action={addIdea} className="flex items-center gap-[8px]">
                  <Input
                    name="text"
                    required
                    placeholder="Something you have not done before"
                    aria-label="Idea"
                    className="grow"
                  />
                  <Button type="submit" variant="secondary">
                    Park it
                  </Button>
                </form>

                {ideas.length === 0 ? (
                  <p className="text-[13px] leading-[1.6] text-muted-foreground">
                    Empty. This is where an idea goes when it is worth remembering but not yet
                    worth planning — and it is what the queue counts when one of your months comes
                    open.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-[2px]">
                    {ideas.map((idea) => (
                      <IdeaRowView key={idea.id} idea={idea} />
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
          </section>
        </div>

        {/* The artboard's right column. */}
        <section className="flex w-[340px] shrink-0 flex-col gap-[11px]">
          <h2 className="text-[15px] font-semibold">One on one</h2>

          <Panel>
            <div className="flex flex-col gap-[14px]">
              {kids.length === 0 ? (
                <p className="text-[13px] leading-[1.6] text-muted-foreground">
                  Nobody yet. Add each girl and Steward keeps one question in view: is something
                  planned, and if not, what is in her bank.
                </p>
              ) : (
                kids.map((kid, i) => (
                  <div key={kid.id} className="flex flex-col gap-[10px]">
                    {i > 0 ? <span className="h-px w-full bg-border" /> : null}
                    <Kid kid={kid} now={now} />
                  </div>
                ))
              )}

              <form action={addKid} className="flex items-center gap-[8px] border-t pt-[12px]">
                <Input name="name" required placeholder="Her name" aria-label="Name" className="grow" />
                <Input
                  name="cadenceDays"
                  type="number"
                  min={1}
                  placeholder="Days"
                  aria-label="Nudge after this many days without a plan — blank for never"
                  title="Nudge after this many days with no plan. Blank means never."
                  className="w-[80px]"
                />
                <Button type="submit" variant="secondary" size="sm">
                  Add
                </Button>
              </form>
            </div>
          </Panel>
        </section>
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- helpers */

function verdict(openMonths: number, kidsWaiting: number): string {
  const parts: string[] = [];
  if (openMonths > 0) {
    parts.push(`${openMonths} of your months ${openMonths === 1 ? "needs" : "need"} an idea`);
  }
  if (kidsWaiting > 0) {
    parts.push(`${kidsWaiting} ${kidsWaiting === 1 ? "girl has" : "girls have"} nothing planned`);
  }
  return parts.length === 0 ? "nothing open" : parts.join(", ");
}

/**
 * One girl.
 *
 * The artboard's card, which asks two things: is something planned, and if not
 * what is in her bank. Editing sits inside a disclosure so the card reads as a
 * card until you want to change it — the page is for glancing at far more often
 * than for typing into.
 */
function Kid({ kid, now }: { kid: KidView; now: Date }) {
  const planned = kid.planTitle !== null;

  return (
    <div className="flex flex-col gap-[5px]">
      <div className="flex items-baseline justify-between gap-[10px]">
        <span className="truncate text-[14px]">{kid.name}</span>
        <span
          className="shrink-0 text-[13px]"
          style={{ color: planned ? "var(--teal)" : kid.overdue ? "var(--warning)" : "var(--faint)" }}
        >
          {planned ? "planned" : "no plan"}
        </span>
      </div>

      <span className="text-[12px] text-muted-foreground">
        {planned
          ? kid.planTitle
          : kid.ideas.length > 0
            ? `${kid.ideas.length} ${kid.ideas.length === 1 ? "idea" : "ideas"} in her bank`
            : "nothing in her bank yet"}
      </span>

      {kid.lastOutingAt ? (
        <span className="font-mono text-[11px] text-faint">
          last one {duration(kid.lastOutingAt, now)} ago
        </span>
      ) : null}

      {/* Her bank, offered where the decision is. */}
      {!planned && kid.ideas.length > 0 ? (
        <div className="mt-[3px] flex flex-wrap gap-[5px]">
          {kid.ideas.map((idea) => (
            <form key={idea.id} action={useKidIdea}>
              <input type="hidden" name="ideaId" value={idea.id} />
              <input type="hidden" name="kidId" value={kid.id} />
              <button
                type="submit"
                className="rounded-[7px] border px-[8px] py-[3px] text-[12px] text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground"
              >
                {idea.text}
              </button>
            </form>
          ))}
        </div>
      ) : null}

      {planned ? (
        <form action={completeOuting} className="mt-[4px]">
          <input type="hidden" name="id" value={kid.id} />
          <Button type="submit" variant="secondary" size="sm">
            We did it
          </Button>
        </form>
      ) : null}

      <details className="mt-[4px] text-[12px]">
        <summary className="cursor-pointer text-faint transition-colors hover:text-foreground">
          Edit
        </summary>

        <div className="mt-[9px] flex flex-col gap-[8px]">
          <form action={updateKid} className="flex flex-col gap-[7px]">
            <input type="hidden" name="id" value={kid.id} />
            <Input name="name" defaultValue={kid.name} aria-label="Name" />
            <Input
              name="planTitle"
              defaultValue={kid.planTitle ?? ""}
              placeholder="What you are doing"
              aria-label={`Plan for ${kid.name}`}
            />
            <div className="flex items-center gap-[7px]">
              <Input
                name="planDate"
                type="date"
                defaultValue={kid.planDate ? kid.planDate.toISOString().slice(0, 10) : ""}
                aria-label={`Date for ${kid.name}`}
                className="grow"
              />
              <Input
                name="cadenceDays"
                type="number"
                min={1}
                defaultValue={kid.cadenceDays ?? ""}
                placeholder="Days"
                aria-label={`Nudge after this many days for ${kid.name}`}
                className="w-[80px]"
              />
            </div>
            <Button type="submit" variant="secondary" size="sm">
              Save
            </Button>
          </form>

          <form action={addIdea} className="flex items-center gap-[7px]">
            <input type="hidden" name="kidId" value={kid.id} />
            <Input
              name="text"
              required
              placeholder="Park an idea for her"
              aria-label={`Idea for ${kid.name}`}
              className="grow"
            />
            <Button type="submit" variant="ghost" size="sm">
              Park
            </Button>
          </form>

          {kid.ideas.length > 0 ? (
            <ul className="flex flex-col gap-[1px]">
              {kid.ideas.map((idea) => (
                <IdeaRowView key={idea.id} idea={idea} />
              ))}
            </ul>
          ) : null}

          <form action={deleteKid}>
            <input type="hidden" name="id" value={kid.id} />
            <button
              type="submit"
              className="text-[12px] text-faint transition-colors hover:text-destructive"
            >
              Remove {kid.name}
            </button>
          </form>
        </div>
      </details>
    </div>
  );
}

function IdeaRowView({ idea }: { idea: IdeaRow }) {
  return (
    <li className="flex items-center gap-[9px] rounded-[8px] px-[8px] py-[6px] hover:bg-card-hover">
      <span className="min-w-0 grow truncate text-[13px]">{idea.text}</span>
      <form action={deleteIdea}>
        <input type="hidden" name="id" value={idea.id} />
        <button
          type="submit"
          aria-label={`Remove: ${idea.text}`}
          title="Remove"
          className="flex size-[20px] items-center justify-center rounded-[6px] text-faint transition-colors hover:bg-secondary hover:text-destructive"
        >
          <Trash2 size={13} strokeWidth={1.8} />
        </button>
      </form>
    </li>
  );
}

/**
 * One month.
 *
 * Reads as the artboard's row — month, plan, status — with editing inside a
 * disclosure, because this page is glanced at far more often than typed into.
 * An open month of Vincent's offers the bank inline: the answer to "December is
 * open" is usually already parked, and picking it should be one click.
 */
function Slot({ slot, ideas }: { slot: SlotRow; ideas: IdeaRow[] }) {
  const status = STATUS[slot.status] ?? STATUS.open;
  const mine = slot.planner === OWNER;
  const offerIdeas = slot.status === "open" && mine && ideas.length > 0;

  return (
    <div className="flex flex-col gap-[8px] rounded-[10px] border bg-card px-[16px] py-[12px]">
      <div className="flex flex-wrap items-baseline justify-between gap-[10px]">
        <span className="flex min-w-0 items-baseline gap-[11px]">
          <span className="shrink-0 font-mono text-[13px] font-semibold uppercase">
            {monthLabel(slot.month)}
          </span>
          <span className="truncate text-[13px] text-muted-foreground">
            {slot.title ?? (mine ? "your month, no plan yet" : `${slot.planner}'s month`)}
          </span>
        </span>
        <span className="shrink-0 text-[12px]" style={{ color: status.colour }}>
          {status.label}
        </span>
      </div>

      {slot.detail ? <span className="text-[12px] text-faint">{slot.detail}</span> : null}

      {offerIdeas ? (
        <div className="flex flex-wrap items-center gap-[5px]">
          <span className="mr-[3px] text-[12px] text-muted-foreground">From the bank:</span>
          {ideas.map((idea) => (
            <form key={idea.id} action={useIdea}>
              <input type="hidden" name="ideaId" value={idea.id} />
              <input type="hidden" name="slotId" value={slot.id} />
              <button
                type="submit"
                className="rounded-[7px] border px-[8px] py-[3px] text-[12px] text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground"
              >
                {idea.text}
              </button>
            </form>
          ))}
        </div>
      ) : null}

      <details className="text-[12px]">
        <summary className="cursor-pointer text-faint transition-colors hover:text-foreground">
          Edit
        </summary>

        <form action={updateSlot} className="mt-[9px] flex flex-col gap-[7px]">
          <input type="hidden" name="id" value={slot.id} />

          <Input
            name="title"
            defaultValue={slot.title ?? ""}
            placeholder="What it is"
            aria-label={`Plan for ${slot.month}`}
          />
          <Input
            name="detail"
            defaultValue={slot.detail ?? ""}
            placeholder="Bookings, times, what is still to decide"
            aria-label={`Detail for ${slot.month}`}
          />

          <div className="flex flex-wrap items-center gap-[7px]">
            <Input
              name="eventDate"
              type="date"
              defaultValue={slot.eventDate ? slot.eventDate.toISOString().slice(0, 10) : ""}
              aria-label={`Date for ${slot.month}`}
              title="The real date, which need not fall in this month"
              className="w-[150px]"
            />
            <select
              name="status"
              defaultValue={slot.status}
              aria-label={`Status for ${slot.month}`}
              className="h-[36px] rounded-[8px] border border-input bg-transparent px-[10px] text-[13px]"
            >
              {Object.entries(STATUS).map(([value, s]) => (
                <option key={value} value={value}>
                  {s.label}
                </option>
              ))}
            </select>
            <select
              name="planner"
              defaultValue={slot.planner}
              aria-label={`Who plans ${slot.month}`}
              className="h-[36px] rounded-[8px] border border-input bg-transparent px-[10px] text-[13px]"
            >
              <option>Vincent</option>
              <option>Marylène</option>
            </select>
            <Button type="submit" variant="secondary" size="sm">
              Save
            </Button>
          </div>
        </form>

        <form action={deleteSlot} className="mt-[8px]">
          <input type="hidden" name="id" value={slot.id} />
          <button
            type="submit"
            className="text-[12px] text-faint transition-colors hover:text-destructive"
          >
            Remove this month
          </button>
        </form>
      </details>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[10px] border bg-card px-[16px] py-[14px]">{children}</div>;
}
