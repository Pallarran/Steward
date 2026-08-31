import { Trash2 } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import {
  monthKey,
  monthLabel,
  OWNER,
  readFamily,
  type IdeaRow,
  type SlotRow,
} from "@/lib/family";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AddSlotForm } from "./add-slot-form";
import { addIdea, deleteIdea, deleteSlot, updateSlot, useIdea } from "./actions";

export const metadata = { title: "Family · Steward" };

const STATUS: Record<string, { label: string; colour: string }> = {
  open: { label: "needs an idea", colour: "var(--warning)" },
  planning: { label: "in planning", colour: "var(--blue)" },
  booked: { label: "booked", colour: "var(--teal)" },
  done: { label: "done", colour: "var(--faint)" },
};

/**
 * The couple planner — PRD component 5.
 *
 * **Steward owns this**, decided 2026-08-31. Cowork stays where Vincent
 * explores ideas and works out a plan; Steward holds what is parked and what is
 * booked, so there is always a view and a nudge. One consequence worth keeping:
 * the vault is still not mounted anywhere, so the regulatory question about
 * `Work-HQ` never arises.
 *
 * The alternating rule is the planner's own: Marylène takes odd months, Vincent
 * even ones, with slack around show dates that do not land neatly in a month.
 */
export default async function FamilyPage() {
  await requireAuth();

  const now = new Date();
  const { slots, ideas, openForVincent } = await readFamily(now);

  return (
    <>
      <header className="flex flex-col gap-[2px]">
        <h1 className="text-[21px] font-bold tracking-[-0.02em]">Family</h1>
        <p className="text-[13px] text-muted-foreground">
          {slots.length === 0
            ? "nothing planned yet"
            : openForVincent.length === 0
              ? "nothing of yours is open"
              : `${openForVincent.length} of your months ${openForVincent.length === 1 ? "needs" : "need"} an idea`}
        </p>
      </header>

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
              Nothing yet. Add the months you want on the plan — the one whose turn it is follows
              the odd and even rule, and you can change it, because you two swap.
            </p>
          </Panel>
        ) : (
          <div className="flex flex-col gap-[8px]">
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
              <p className="text-[13px] text-muted-foreground">
                Empty. This is where an idea goes when it is worth remembering but not yet worth
                planning — and it is what the queue counts when one of your months comes open.
              </p>
            ) : (
              <ul className="flex flex-col gap-[2px]">
                {ideas.map((idea) => (
                  <li
                    key={idea.id}
                    className="flex items-center gap-[11px] rounded-[8px] px-[10px] py-[7px] hover:bg-card-hover"
                  >
                    <span className="min-w-0 grow truncate text-[13px]">{idea.text}</span>
                    <form action={deleteIdea}>
                      <input type="hidden" name="id" value={idea.id} />
                      <button
                        type="submit"
                        aria-label={`Remove: ${idea.text}`}
                        title="Remove"
                        className="flex size-[22px] items-center justify-center rounded-[6px] text-faint transition-colors hover:bg-secondary hover:text-destructive"
                      >
                        <Trash2 size={14} strokeWidth={1.8} />
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Panel>
      </section>
    </>
  );
}

/**
 * One month.
 *
 * An open month of Vincent's shows the idea bank inline, because that is the
 * moment the bank exists for: the answer to "December is open" is usually
 * already parked, and picking it should be one click rather than a copy and a
 * paste.
 */
function Slot({ slot, ideas }: { slot: SlotRow; ideas: IdeaRow[] }) {
  const status = STATUS[slot.status] ?? STATUS.open;
  const mine = slot.planner === OWNER;
  const offerIdeas = slot.status === "open" && mine && ideas.length > 0;

  return (
    <div className="flex flex-col gap-[10px] rounded-[10px] border bg-card px-[16px] py-[13px]">
      <form action={updateSlot} className="flex flex-col gap-[9px]">
        <input type="hidden" name="id" value={slot.id} />

        <div className="flex flex-wrap items-baseline gap-[10px]">
          <span className="font-mono text-[13px] font-semibold">{monthLabel(slot.month)}</span>
          <span className="text-[12px] text-faint">{slot.planner}</span>
          <span className="text-[12px]" style={{ color: status.colour }}>
            {status.label}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-[8px]">
          <Input
            name="title"
            defaultValue={slot.title ?? ""}
            placeholder="What it is"
            aria-label={`Plan for ${slot.month}`}
            className="min-w-[220px] grow"
          />
          <Input
            name="eventDate"
            type="date"
            defaultValue={slot.eventDate ? slot.eventDate.toISOString().slice(0, 10) : ""}
            aria-label={`Date for ${slot.month}`}
            title="The real date, which need not be in this month"
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

        <Input
          name="detail"
          defaultValue={slot.detail ?? ""}
          placeholder="Anything worth remembering — bookings, times, what is still to decide"
          aria-label={`Detail for ${slot.month}`}
        />
      </form>

      {offerIdeas ? (
        <div className="flex flex-wrap items-center gap-[6px] border-t pt-[10px]">
          <span className="mr-[4px] text-[12px] text-muted-foreground">From the bank:</span>
          {ideas.map((idea) => (
            <form key={idea.id} action={useIdea}>
              <input type="hidden" name="ideaId" value={idea.id} />
              <input type="hidden" name="slotId" value={slot.id} />
              <button
                type="submit"
                className="rounded-[7px] border px-[9px] py-[4px] text-[12px] text-muted-foreground transition-colors hover:bg-card-hover hover:text-foreground"
              >
                {idea.text}
              </button>
            </form>
          ))}
        </div>
      ) : null}

      <form action={deleteSlot} className="flex justify-end">
        <input type="hidden" name="id" value={slot.id} />
        <button
          type="submit"
          className="text-[12px] text-faint transition-colors hover:text-destructive"
        >
          Remove this month
        </button>
      </form>
    </div>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="rounded-[10px] border bg-card px-[16px] py-[14px]">{children}</div>;
}
