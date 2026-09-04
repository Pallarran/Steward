import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/shell/panel";
import { Section } from "@/components/shell/section";
import { NotKnown } from "@/components/shell/not-known";
import { EmptyState } from "@/components/shell/empty-state";
import { readPeople, type PersonView } from "@/lib/people";
import { monthKey, monthLabel, mineFor, readCouple, type IdeaRow, type Names, type SlotRow } from "@/lib/couple";
import { duration } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { PersonDialog } from "./person-dialog";
import { MonthDialog } from "./month-dialog";
import { PlanDialog } from "./plan-dialog";
import { completePlan, deletePerson, recordContact, undoContact } from "./actions";
import { addIdea, deleteIdea, deleteSlot, useIdea, usePersonIdea } from "./planner-actions";
import { IconButton } from "@/components/shell/icon-button";

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
      <PageHeader
        title="People"
        subtitle={verdict(couple.openMine.length, overdue, everyone.length)}
        action={
          <PersonDialog
            circles={circleNames}
            trigger={
              <Button variant="secondary" size="sm">
                <Plus size={14} strokeWidth={2} />
                Add someone
              </Button>
            }
          />
        }
      />

      {/* A mis-tap would otherwise destroy the real date silently, and this
          list exists nowhere else to recover it from. */}
      {justContacted ? (
        <div className="flex items-center justify-between gap-[12px] rounded-[10px] border border-primary/40 bg-card px-[16px] py-[10px]">
          <span className="text-[14px]">Marked as time with {justContacted.name}.</span>
          <form action={undoContact}>
            <input type="hidden" name="id" value={justContacted.id} />
            <Button type="submit" variant="secondary" size="sm">
              Undo
            </Button>
          </form>
        </div>
      ) : null}

      {/*
        **The two columns swapped weights on 2026-09-04.** This was `grow`
        beside a hard `lg:w-[340px]`, which put the page's densest and most
        interactive content in its narrowest column and its one-line rows in the
        widest. Inside a `Panel` at 340px the children's card had 308px for a
        truncating name, a wrapping plan title, a chip row that put every idea
        on its own line, and a three-button row that wrapped as soon as a plan
        had a title. Meanwhile a couple slot spent about 850px on the gap in the
        middle of `justify-between`.

        A container query rather than `lg:`, for the reason `docs/DESIGN.md`
        gives: the rail is inside the viewport, so `lg:` fires 304px early.
      */}
      <div className="grid grid-cols-1 items-start gap-[16px] @min-[900px]:grid-cols-[1fr_1.15fr]">
        <div className="flex min-w-0 flex-col gap-[20px]">
          <Section
            title="Couple nights"
            detail={`${couple.names.theirs} takes odd months`}
            action={
              <MonthDialog
                names={couple.names}
                suggestedMonth={nextMonth}
                suggestedMine={mineFor(nextMonth)}
                trigger={
                  <Button variant="secondary" size="sm">
                    <Plus size={13} strokeWidth={2} />
                    Month
                  </Button>
                }
              />
            }
          >

            {spouse ? (
              <Spouse spouse={spouse} now={now} circles={circleNames} />
            ) : (
              <Panel>
                <NotKnown>
                  No spouse recorded yet. Add one with <em>Add someone</em> above and the planner
                  uses their real name instead of guessing — the months, the idea bank and the
                  nudges all follow.
                </NotKnown>
              </Panel>
            )}

            {couple.slots.length === 0 ? (
              <Panel>
                <NotKnown>
                  Nothing yet. Add the months you want on the plan; whose turn it is follows the
                  odd and even rule, and you can change it, because you two swap.
                </NotKnown>
              </Panel>
            ) : (
              <div className="flex flex-col gap-[6px]">
                {couple.slots.map((slot) => (
                  <Slot key={slot.id} slot={slot} ideas={couple.ideas} names={couple.names} />
                ))}
              </div>
            )}
          </Section>

          <Section
            title="Idea bank"
            detail={`${couple.ideas.length} ${couple.ideas.length === 1 ? "idea" : "ideas"} waiting`}
          >

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
                  <NotKnown>
                    Empty. This is where an idea goes when it is worth remembering but not yet
                    worth planning — and it is what the queue counts when one of your months
                    comes open.
                  </NotKnown>
                ) : (
                  <ul className="flex flex-col gap-[2px]">
                    {couple.ideas.map((idea) => (
                      <IdeaRowView key={idea.id} idea={idea} />
                    ))}
                  </ul>
                )}
              </div>
            </Panel>
          </Section>
        </div>

        <Section
          title="One on one"
          className="min-w-0"
          action={
            <PersonDialog
              circles={circleNames}
              defaultKind="child"
              trigger={
                <Button variant="secondary" size="sm">
                  <Plus size={13} strokeWidth={2} />
                  Add
                </Button>
              }
            />
          }
        >

          {/* A collection with nothing in it takes `EmptyState` and carries
              the action itself, the way Finance's subscriptions do — rather
              than a grey line inside a card, which is what a *check that could
              not be made* looks like. Two different claims, and this page made
              them look identical. */}
          {children.length === 0 ? (
            <EmptyState
              icon={Users}
              accent="var(--purple)"
              title="Nobody yet"
              description="Add each girl and Steward keeps one question in view: is something planned, and if not, what is in the bank."
            >
              <PersonDialog
                circles={circleNames}
                defaultKind="child"
                trigger={
                  <Button>
                    <Plus size={14} strokeWidth={2} />
                    Add a daughter
                  </Button>
                }
              />
            </EmptyState>
          ) : (
            <Panel>
              <div className="flex flex-col gap-[12px]">
                {children.map((child, i) => (
                  <div key={child.id} className="flex flex-col gap-[10px]">
                    {i > 0 ? <span className="h-px w-full bg-border" /> : null}
                    <Child child={child} now={now} circles={circleNames} />
                  </div>
                ))}
              </div>
            </Panel>
          )}
        </Section>
      </div>

      <Section
        title="Everyone else"
        detail={`${circles.reduce((n, c) => n + c.people.length, 0)} people`}
      >

        {circles.length === 0 ? (
          // Both this and the children's used to open "Nobody yet." in the same
          // grey, and both could be on screen at once.
          <EmptyState
            icon={Users}
            accent="var(--rose)"
            title="Nobody outside the house yet"
            description="Parents, friends, anyone worth not losing touch with. Give each one a number of days and Steward puts a single quiet line in the queue when it has been longer than that — leave it blank and it never will."
          >
            <PersonDialog
              circles={circleNames}
              trigger={
                <Button>
                  <Plus size={14} strokeWidth={2} />
                  Add someone
                </Button>
              }
            />
          </EmptyState>
        ) : (
          circles.map((circle) => (
            <Panel key={circle.name}>
              <div className="flex flex-col gap-[8px]">
                <h3 className="text-[14px] font-semibold text-muted-foreground">{circle.name}</h3>
                {/*
                  A grid, not a stack.

                  Each row was 1596px of track carrying a name, a meta line and
                  a 220px bar — about a thousand pixels of nothing per person,
                  with the delete button 1400px from the name it deletes. Twelve
                  contacts came to 804px and began at 980px down the page, so
                  the section with the most rows and the most clicks was never
                  seen without scrolling.

                  At 1616px this is four columns and the same twelve take about
                  210px, entirely above the fold.
                */}
                <div className="grid grid-cols-[repeat(auto-fill,minmax(360px,1fr))] gap-[2px]">
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
      </Section>
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
    <div className="flex flex-col gap-[4px]">
      <div className="flex items-baseline justify-between gap-[10px]">
        <span className="truncate text-[15px]">{child.name}</span>
        <span
          className="shrink-0 text-[14px]"
          style={{
            color: planned ? "var(--teal)" : child.overdue ? "var(--warning)" : "var(--faint)",
          }}
        >
          {planned ? "planned" : "no plan"}
        </span>
      </div>

      <span className="text-[13px] text-muted-foreground">
        {planned
          ? // `planDate` is collected by `PlanDialog` under a field labelled
            // "When" and was rendered nowhere at all — on the one page whose
            // whole subject is when you are next doing something.
            `${child.planTitle}${child.planDate ? ` · ${planDay(child.planDate)}` : ""}`
          : child.ideas.length > 0
            ? `${child.ideas.length} ${child.ideas.length === 1 ? "idea" : "ideas"} in the bank`
            : "nothing in the bank yet"}
      </span>

      {child.lastContactAt ? (
        <span className="font-mono text-[12px] text-faint">
          last one {duration(child.lastContactAt, now)} ago
        </span>
      ) : null}

      {/* Her bank, offered exactly where the decision is. */}
      {!planned && child.ideas.length > 0 ? (
        <div className="mt-[2px] flex flex-wrap items-baseline gap-[4px]">
          <span className="mr-[2px] text-[13px] text-muted-foreground">Plan one:</span>
          {child.ideas.map((idea) => (
            <form key={idea.id} action={usePersonIdea}>
              <input type="hidden" name="ideaId" value={idea.id} />
              <input type="hidden" name="personId" value={child.id} />
              <button
                type="submit"
                aria-label={`Plan "${idea.text}" with ${child.name}`}
                title={`Plan this with ${child.name}`}
                className="rounded-[7px] border px-[8px] py-[2px] text-[13px] text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground"
              >
                {idea.text}
              </button>
            </form>
          ))}
        </div>
      ) : null}

      <div className="mt-[4px] flex flex-wrap items-center gap-[6px]">
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
            <Button variant="secondary" size="sm">
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

      {/* One field, inline — and a button, from 2026-09-04. It had none: the
          only way to submit was Enter, with a `gap-[6px]` left over from a
          button that had gone, while the couple-level twin of this exact form
          carried "Park it". Same action, two affordances. */}
      <form action={addIdea} className="mt-[2px] flex items-center gap-[6px]">
        <input type="hidden" name="personId" value={child.id} />
        <Input
          name="text"
          required
          placeholder="Park an idea"
          aria-label={`Idea for ${child.name}`}
          className="h-[30px] grow text-[13px]"
        />
        <Button type="submit" variant="secondary" size="sm">
          Park it
        </Button>
      </form>
    </div>
  );
}

/**
 * The spouse, at the head of the section that is about her.
 *
 * **She was read and never drawn.** `readPeople` returns her, the page used her
 * only to look up a name for the planner's copy, and no dialog trigger was ever
 * bound to her — so once created, her relation, intention, cadence, last
 * contact and idea bank were unreachable and uneditable, and adding her again
 * refused with *"already recorded as your spouse"*. A first-class `PersonKind`
 * with no way back to it, and the largest content gap in the app.
 *
 * Here rather than in *One on one*, which is the daughters: the section she
 * belongs to is the one that already had an empty state about her.
 */
function Spouse({
  spouse,
  now,
  circles,
}: {
  spouse: PersonView;
  now: Date;
  circles: string[];
}) {
  return (
    <Panel pad="row">
      <div className="flex items-center gap-[12px]">
        <span className="flex min-w-0 grow flex-col gap-[2px]">
          <span className="flex items-baseline gap-[8px]">
            <span className="truncate text-[15px] font-medium">{spouse.name}</span>
            {spouse.relation ? (
              <span className="shrink-0 text-[13px] text-faint">{spouse.relation}</span>
            ) : null}
          </span>

          <span className="truncate text-[13px] text-muted-foreground">
            {[
              spouse.lastContactAt
                ? `last time together ${duration(spouse.lastContactAt, now)} ago`
                : "no time together recorded",
              // `cadenceDays` drives `overdue` and has never been shown as a
              // number anywhere, so the mark he set was invisible even while it
              // was writing queue rows.
              spouse.cadenceDays !== null ? `every ${spouse.cadenceDays} days` : null,
              spouse.intention,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>

        <form action={recordContact} className="shrink-0">
          <input type="hidden" name="id" value={spouse.id} />
          <Button type="submit" variant="secondary" size="sm">
            Time together
          </Button>
        </form>

        <PersonDialog
          person={spouse}
          circles={circles}
          trigger={
            <Button variant="ghost" size="icon-sm" aria-label={`Edit ${spouse.name}`}>
              <Pencil size={13} strokeWidth={1.8} className="text-faint" />
            </Button>
          }
        />
      </div>
    </Panel>
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
    <div className="flex items-center gap-[12px] rounded-[9px] px-[10px] py-[8px]">
      <div className="flex min-w-0 grow flex-col gap-[2px]">
        <span className="flex items-baseline gap-[8px]">
          <span className="truncate text-[15px] font-medium">{person.name}</span>
          {person.relation ? (
            <span className="shrink-0 text-[13px] text-faint">{person.relation}</span>
          ) : null}
        </span>

        <span className="truncate text-[13px] text-muted-foreground">
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

      <ConfirmDialog
        title={`Remove ${person.name}?`}
        description={
          person.ideas.length > 0
            ? `This also removes the ${person.ideas.length} ${person.ideas.length === 1 ? "idea" : "ideas"} parked for them. Nothing else keeps a copy.`
            : "Nothing else keeps a copy of them."
        }
        action={deletePerson}
        id={person.id}
        done={`Removed ${person.name}.`}
        trigger={
          <IconButton
            type="button"
            aria-label={`Remove ${person.name}`}
            title="Remove"
            hover="destructive"
          >
            <Trash2 size={14} strokeWidth={1.8} />
          </IconButton>
        }
      />
    </div>
  );
}

function Slot({ slot, ideas, names }: { slot: SlotRow; ideas: IdeaRow[]; names: Names }) {
  const status = STATUS[slot.status] ?? STATUS.open;
  const offerIdeas = slot.status === "open" && slot.mine && ideas.length > 0;

  return (
    <Panel pad="row" className="flex flex-col gap-[8px]">
      <div className="flex flex-wrap items-baseline justify-between gap-[10px]">
        <span className="flex min-w-0 items-baseline gap-[10px]">
          <span className="shrink-0 font-mono text-[14px] font-semibold uppercase">
            {monthLabel(slot.month)}
          </span>
          <span className="truncate text-[14px] text-muted-foreground">
            {slot.title ??
              (slot.mine ? "your month, no plan yet" : `${names.theirs}'s month`)}
          </span>

          {/* `eventDate` is collected by `MonthDialog` under a field labelled
              "The real date", with a hint saying it need not fall inside the
              month itself — and it was rendered nowhere. A booked night whose
              date the page will not say is the one thing this planner exists
              to answer. */}
          {slot.eventDate ? (
            <span className="shrink-0 font-mono text-[13px] text-faint">
              {planDay(slot.eventDate)}
            </span>
          ) : null}
        </span>

        <span className="flex shrink-0 items-baseline gap-[8px]">
          <span className="text-[13px]" style={{ color: status.colour }}>
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
          <ConfirmDialog
            title={`Remove ${monthLabel(slot.month)}?`}
            description={
              slot.title
                ? `“${slot.title}” and everything noted against it go with it.`
                : "It goes off the plan entirely."
            }
            action={deleteSlot}
            id={slot.id}
            done={`Removed ${monthLabel(slot.month)}.`}
            trigger={
              <IconButton
                type="button"
                aria-label={`Remove ${slot.month}`}
                title="Remove"
                hover="destructive"
              >
                <Trash2 size={14} strokeWidth={1.8} />
              </IconButton>
            }
          />
        </span>
      </div>

      {slot.detail ? <span className="text-[13px] text-faint">{slot.detail}</span> : null}

      {offerIdeas ? (
        <div className="flex flex-wrap items-center gap-[4px]">
          <span className="mr-[2px] text-[13px] text-muted-foreground">From the bank:</span>
          {ideas.map((idea) => (
            <form key={idea.id} action={useIdea}>
              <input type="hidden" name="ideaId" value={idea.id} />
              <input type="hidden" name="slotId" value={slot.id} />
              <button
                type="submit"
                aria-label={`Plan ${idea.text} for ${monthLabel(slot.month)}`}
                title={`Plan this for ${monthLabel(slot.month)}`}
                className="rounded-[7px] border px-[8px] py-[2px] text-[13px] text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground"
              >
                {idea.text}
              </button>
            </form>
          ))}
        </div>
      ) : null}
    </Panel>
  );
}

function IdeaRowView({ idea }: { idea: IdeaRow }) {
  return (
    <li className="flex items-center gap-[8px] rounded-[8px] px-[8px] py-[6px]">
      <span className="min-w-0 grow truncate text-[14px]">{idea.text}</span>
      <form action={deleteIdea}>
        <input type="hidden" name="id" value={idea.id} />
        <IconButton
          type="submit"
          aria-label={`Remove: ${idea.text}`}
          title="Remove"
          hover="destructive"
        >
          <Trash2 size={14} strokeWidth={1.8} />
        </IconButton>
      </form>
    </li>
  );
}


/**
 * "14 Sep" — a planned day, short enough to sit beside a title.
 *
 * Formatted in the house's timezone. Both dates this renders are stored at noon
 * UTC precisely so a calendar day cannot slip backwards when read from a zone
 * behind it, and reading them in the browser's own zone would undo that.
 */
function planDay(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "America/Toronto",
  }).format(date);
}

function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
