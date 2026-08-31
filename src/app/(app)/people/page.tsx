import { Pencil, Plus, Trash2 } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { readPeople, type PersonView } from "@/lib/people";
import { monthKey, monthLabel, mineFor, readCouple, type IdeaRow, type Names, type SlotRow } from "@/lib/couple";
import { duration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PersonDialog } from "./person-dialog";
import { MonthDialog } from "./month-dialog";
import { PlanDialog } from "./plan-dialog";
import { completePlan, deletePerson, recordContact, undoContact } from "./actions";
import { addIdea, deleteIdea, deleteSlot, useIdea, usePersonIdea } from "./planner-actions";

export const metadata = { title: "People · Steward" };

const STATUS: Record<string, { label: string; colour: string }> = {
  open: { label: "needs an idea", colour: "var(--warning)" },
  planning: { label: "in planning", colour: "var(--blue)" },
  booked: { label: "booked", colour: "var(--teal)" },
  done: { label: "done", colour: "var(--faint)" },
};

/**
 * Everyone — PRD components 5 and 8, which stopped being two things on
 * 2026-08-31 at Vincent's call: *"it feels like the same subject."*
 *
 * They were only ever separate because their sources were, one vault markdown
 * and one a manual list. Steward owns both, so the split had nothing left
 * holding it up.
 *
 * **No form sits on this page.** Every add and every edit opens a dialog, which
 * is the pattern he pointed at in The Adventurer's Chronicle. The page is for
 * glancing at.
 *
 * **Nothing counts anything up**, and this page joins no XP economy. PRD §6:
 * measurement alone made an activity feel like work and cut voluntary
 * continuation from 48.5% to 27.3%. Three "days since" surfaces now sit
 * together, which concentrates exactly that risk — so each section counts its
 * own thing and nothing counts them together. §2 lists watching whether this
 * changes how the calls feel. **If it does, this page is what changes.**
 */
export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAuth();

  const now = new Date();
  const [{ spouse, children, circles, overdue }, couple, params] = await Promise.all([
    readPeople(now),
    readCouple(now),
    searchParams,
  ]);

  const everyone = [spouse, ...children, ...circles.flatMap((c) => c.people)].filter(
    (p): p is PersonView => p !== null,
  );
  const circleNames = [...new Set(circles.map((c) => c.name))];

  const contactedId = one(params.contacted);
  const justContacted = contactedId ? everyone.find((p) => p.id === contactedId) : undefined;

  const nextMonth = monthKey(now, 2);

  return (
    <>
      <header className="flex items-baseline justify-between gap-[12px]">
        <div className="flex flex-col gap-[2px]">
          <h1 className="text-[21px] font-bold tracking-[-0.02em]">People</h1>
          <p className="text-[13px] text-muted-foreground">
            {verdict(couple.openMine.length, overdue, everyone.length)}
          </p>
        </div>

        <PersonDialog
          circles={circleNames}
          trigger={
            <Button variant="secondary" size="sm">
              <Plus size={14} strokeWidth={2} />
              Add someone
            </Button>
          }
        />
      </header>

      {/* A mis-tap would otherwise destroy the real date silently, and this
          list exists nowhere else to recover it from. */}
      {justContacted ? (
        <div className="flex items-center justify-between gap-[12px] rounded-[10px] border border-primary/40 bg-card px-[16px] py-[11px]">
          <span className="text-[13px]">Marked as time with {justContacted.name}.</span>
          <form action={undoContact}>
            <input type="hidden" name="id" value={justContacted.id} />
            <Button type="submit" variant="secondary" size="sm">
              Undo
            </Button>
          </form>
        </div>
      ) : null}

      <div className="flex items-start gap-[16px]">
        <div className="flex min-w-0 grow flex-col gap-[20px]">
          <section className="flex flex-col gap-[11px]">
            <div className="flex items-baseline justify-between gap-[12px]">
              <h2 className="text-[15px] font-semibold">Couple nights</h2>
              <div className="flex items-baseline gap-[10px]">
                <span className="font-mono text-[11px] text-faint">
                  {couple.names.theirs} takes odd months
                </span>
                <MonthDialog
                  names={couple.names}
                  suggestedMonth={nextMonth}
                  suggestedMine={mineFor(nextMonth)}
                  trigger={
                    <Button variant="ghost" size="sm" className="text-faint">
                      <Plus size={13} strokeWidth={2} />
                      Month
                    </Button>
                  }
                />
              </div>
            </div>

            {!couple.hasSpouse ? (
              <Panel>
                <p className="text-[13px] leading-[1.6] text-muted-foreground">
                  No spouse recorded yet. Add one above and the planner uses their real name
                  instead of guessing — the months, the idea bank and the nudges all follow.
                </p>
              </Panel>
            ) : null}

            {couple.slots.length === 0 ? (
              <Panel>
                <p className="text-[13px] leading-[1.6] text-muted-foreground">
                  Nothing yet. Add the months you want on the plan; whose turn it is follows the
                  odd and even rule, and you can change it, because you two swap.
                </p>
              </Panel>
            ) : (
              <div className="flex flex-col gap-[6px]">
                {couple.slots.map((slot) => (
                  <Slot key={slot.id} slot={slot} ideas={couple.ideas} names={couple.names} />
                ))}
              </div>
            )}
          </section>

          <section className="flex flex-col gap-[11px]">
            <div className="flex items-baseline justify-between gap-[12px]">
              <h2 className="text-[15px] font-semibold">Idea bank</h2>
              <span className="font-mono text-[11px] text-faint">
                {couple.ideas.length} {couple.ideas.length === 1 ? "idea" : "ideas"} waiting
              </span>
            </div>

            <Panel>
              <div className="flex flex-col gap-[10px]">
                {/* One field, so it stays inline: a dialog for a single input
                    would be ceremony. */}
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

                {couple.ideas.length === 0 ? (
                  <p className="text-[13px] leading-[1.6] text-muted-foreground">
                    Empty. This is where an idea goes when it is worth remembering but not yet
                    worth planning — and it is what the queue counts when one of your months
                    comes open.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-[2px]">
                    {couple.ideas.map((idea) => (
                      <IdeaRowView key={idea.id} idea={idea} />
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
          </section>
        </div>

        <section className="flex w-[340px] shrink-0 flex-col gap-[11px]">
          <div className="flex items-baseline justify-between gap-[12px]">
            <h2 className="text-[15px] font-semibold">One on one</h2>
            <PersonDialog
              circles={circleNames}
              defaultKind="child"
              trigger={
                <Button variant="ghost" size="sm" className="text-faint">
                  <Plus size={13} strokeWidth={2} />
                  Add
                </Button>
              }
            />
          </div>

          <Panel>
            <div className="flex flex-col gap-[14px]">
              {children.length === 0 ? (
                <p className="text-[13px] leading-[1.6] text-muted-foreground">
                  Nobody yet. Add each girl and Steward keeps one question in view: is something
                  planned, and if not, what is in her bank.
                </p>
              ) : (
                children.map((child, i) => (
                  <div key={child.id} className="flex flex-col gap-[10px]">
                    {i > 0 ? <span className="h-px w-full bg-border" /> : null}
                    <Child child={child} now={now} circles={circleNames} />
                  </div>
                ))
              )}
            </div>
          </Panel>
        </section>
      </div>

      <section className="flex flex-col gap-[11px]">
        <div className="flex items-baseline justify-between gap-[12px]">
          <h2 className="text-[15px] font-semibold">Everyone else</h2>
          <span className="font-mono text-[11px] text-faint">
            {circles.reduce((n, c) => n + c.people.length, 0)} people
          </span>
        </div>

        {circles.length === 0 ? (
          <Panel>
            <p className="text-[13px] leading-[1.6] text-muted-foreground">
              Nobody yet. Parents, friends, anyone worth not losing touch with. Give each one a
              number of days and Steward puts a single quiet line in the queue when it has been
              longer than that — leave it blank and it never will.
            </p>
          </Panel>
        ) : (
          circles.map((circle) => (
            <Panel key={circle.name}>
              <div className="flex flex-col gap-[8px]">
                <h3 className="text-[13px] font-semibold text-muted-foreground">{circle.name}</h3>
                <div className="flex flex-col gap-[2px]">
                  {circle.people.map((person) => (
                    <Contact
                      key={person.id}
                      person={person}
                      now={now}
                      circles={circleNames}
                    />
                  ))}
                </div>
              </div>
            </Panel>
          ))
        )}
      </section>
    </>
  );
}

/* ---------------------------------------------------------------- pieces */

function verdict(openMonths: number, overdue: number, total: number): string {
  if (total === 0) return "nobody yet";

  const parts: string[] = [];
  if (openMonths > 0) {
    parts.push(`${openMonths} of your months ${openMonths === 1 ? "needs" : "need"} an idea`);
  }
  if (overdue > 0) parts.push(`${overdue} past the mark you set`);

  return parts.length === 0 ? "nothing is slipping" : parts.join(", ");
}

function Child({
  child,
  now,
  circles,
}: {
  child: PersonView;
  now: Date;
  circles: string[];
}) {
  const planned = child.planTitle !== null;

  return (
    <div className="flex flex-col gap-[5px]">
      <div className="flex items-baseline justify-between gap-[10px]">
        <span className="truncate text-[14px]">{child.name}</span>
        <span
          className="shrink-0 text-[13px]"
          style={{
            color: planned ? "var(--teal)" : child.overdue ? "var(--warning)" : "var(--faint)",
          }}
        >
          {planned ? "planned" : "no plan"}
        </span>
      </div>

      <span className="text-[12px] text-muted-foreground">
        {planned
          ? child.planTitle
          : child.ideas.length > 0
            ? `${child.ideas.length} ${child.ideas.length === 1 ? "idea" : "ideas"} in her bank`
            : "nothing in her bank yet"}
      </span>

      {child.lastContactAt ? (
        <span className="font-mono text-[11px] text-faint">
          last one {duration(child.lastContactAt, now)} ago
        </span>
      ) : null}

      {/* Her bank, offered exactly where the decision is. */}
      {!planned && child.ideas.length > 0 ? (
        <div className="mt-[3px] flex flex-wrap gap-[5px]">
          {child.ideas.map((idea) => (
            <form key={idea.id} action={usePersonIdea}>
              <input type="hidden" name="ideaId" value={idea.id} />
              <input type="hidden" name="personId" value={child.id} />
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

      <div className="mt-[4px] flex flex-wrap items-center gap-[7px]">
        {planned ? (
          <form action={completePlan}>
            <input type="hidden" name="id" value={child.id} />
            <Button type="submit" variant="secondary" size="sm">
              We did it
            </Button>
          </form>
        ) : null}

        <PlanDialog
          person={child}
          trigger={
            <Button variant="ghost" size="sm" className="text-faint">
              {planned ? "Change the plan" : "Plan something"}
            </Button>
          }
        />

        <PersonDialog
          person={child}
          circles={circles}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${child.name}`}>
              <Pencil size={13} strokeWidth={1.8} className="text-faint" />
            </Button>
          }
        />
      </div>

      {/* One field, inline. */}
      <form action={addIdea} className="mt-[2px] flex items-center gap-[6px]">
        <input type="hidden" name="personId" value={child.id} />
        <Input
          name="text"
          required
          placeholder="Park an idea for her"
          aria-label={`Idea for ${child.name}`}
          className="h-[30px] grow text-[12px]"
        />
      </form>
    </div>
  );
}

function Contact({
  person,
  now,
  circles,
}: {
  person: PersonView;
  now: Date;
  circles: string[];
}) {
  return (
    <div className="flex items-center gap-[13px] rounded-[9px] px-[10px] py-[9px] hover:bg-card-hover">
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
          {person.planTitle ? ` · ${person.planTitle}` : ""}
          {person.intention ? ` · ${person.intention}` : ""}
        </span>

        {/* A bar rather than a number: it says "it has been a while" without
            putting a count on a friendship. */}
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

      <PersonDialog
        person={person}
        circles={circles}
        trigger={
          <Button variant="ghost" size="icon-sm" aria-label={`Edit ${person.name}`}>
            <Pencil size={13} strokeWidth={1.8} className="text-faint" />
          </Button>
        }
      />

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

function Slot({ slot, ideas, names }: { slot: SlotRow; ideas: IdeaRow[]; names: Names }) {
  const status = STATUS[slot.status] ?? STATUS.open;
  const offerIdeas = slot.status === "open" && slot.mine && ideas.length > 0;

  return (
    <div className="flex flex-col gap-[8px] rounded-[10px] border bg-card px-[16px] py-[12px]">
      <div className="flex flex-wrap items-baseline justify-between gap-[10px]">
        <span className="flex min-w-0 items-baseline gap-[11px]">
          <span className="shrink-0 font-mono text-[13px] font-semibold uppercase">
            {monthLabel(slot.month)}
          </span>
          <span className="truncate text-[13px] text-muted-foreground">
            {slot.title ??
              (slot.mine ? "your month, no plan yet" : `${names.theirs}'s month`)}
          </span>
        </span>

        <span className="flex shrink-0 items-baseline gap-[9px]">
          <span className="text-[12px]" style={{ color: status.colour }}>
            {status.label}
          </span>
          <MonthDialog
            slot={slot}
            names={names}
            trigger={
              <Button variant="ghost" size="icon-sm" aria-label={`Edit ${slot.month}`}>
                <Pencil size={13} strokeWidth={1.8} className="text-faint" />
              </Button>
            }
          />
          <form action={deleteSlot}>
            <input type="hidden" name="id" value={slot.id} />
            <button
              type="submit"
              aria-label={`Remove ${slot.month}`}
              title="Remove"
              className="flex size-[24px] items-center justify-center rounded-[6px] text-faint transition-colors hover:bg-secondary hover:text-destructive"
            >
              <Trash2 size={13} strokeWidth={1.8} />
            </button>
          </form>
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

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[10px] border bg-card px-[16px] py-[14px]">{children}</div>;
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
