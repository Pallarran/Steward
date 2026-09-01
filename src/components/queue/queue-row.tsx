"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check, ExternalLink, TriangleAlert, X } from "lucide-react";
import {
  dismissItem,
  readMailItem,
  tickItem,
  undismissItem,
  unreadMailItem,
  untickItem,
  type Undoable,
} from "@/app/(app)/actions";
import type { QueueItem } from "@/lib/queue";
import { ALARM_PRIORITY } from "@/lib/priority";
import { CATEGORY } from "./category";
import { SOURCE_LABEL } from "./source";
import { IconButton } from "@/components/shell/icon-button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { duration } from "@/lib/format";

/**
 * 34px category chip, the title, a `Source · detail` second line, and the
 * dismiss X — docs/DESIGN.md. No numbering and no tiers: position carries the
 * priority, so the number is never shown.
 *
 * The second line reads `Source · detail`, so `subtitle` must hold **only** the
 * detail. It used to lead with the category, which made Todoist's Inbox rows
 * say "Inbox · Inbox" — and the source is the more useful half anyway, since
 * the coloured chip already carries the category.
 *
 * **A client component since 2026-08-31, so that clearing a row can be undone.**
 * Working the queue to empty is the daily loop, which makes a mis-click on the
 * X the most likely destructive accident in the app; before this it was silent
 * and permanent. Both sibling apps landed on delete-with-undo and Horizon's
 * review calls it the best interaction it has.
 */
export function QueueRow({ item, first }: { item: QueueItem; first: boolean }) {
  const category = CATEGORY[item.category];
  const label = SOURCE_LABEL[item.source];

  /**
   * An alarm reads as an alarm.
   *
   * Every row looked the same, so "disk4 is disabled on WhiteTower" sat in the
   * list wearing the same calm teal as a pending add-on update. A queue is a
   * list of things to do; this is a list of things to do **and one thing that
   * is broken**, and the difference was invisible.
   *
   * So an alarm takes the destructive colour, a warning glyph in place of its
   * category icon, and a tinted ground — the one row on the page that is
   * allowed to shout. Red already means "down or loss" everywhere else in
   * Steward, so this borrows a meaning rather than inventing one.
   */
  const alarm = item.priority === ALARM_PRIORITY;
  const Icon = alarm ? TriangleAlert : category.icon;
  const accent = alarm ? "var(--destructive)" : category.accent;
  const chip = alarm
    ? "color-mix(in srgb, var(--destructive) 14%, transparent)"
    : category.chip;
  const [pending, start] = useTransition();

  /**
   * Undo is offered only when the action succeeded. Undoing something that did
   * not happen would be worse than no undo at all.
   *
   * A neutral `toast`, never `toast.success` — clearing a row is a thing that
   * happened, not an achievement, and the green tick would argue otherwise.
   */
  function run(action: () => Promise<Undoable>, done: string, undo: () => Promise<Undoable>) {
    start(async () => {
      const result = await action();
      if (result.error) {
        toast.error(result.error);
        return;
      }

      toast(done, {
        action: {
          label: "Undo",
          onClick: () =>
            start(async () => {
              const back = await undo();
              if (back.error) toast.error(back.error);
            }),
        },
      });
    });
  }

  return (
    /*
      The row that is next gets a gold rail, not a background.
      It used to wear `bg-card-hover` permanently — the same colour hover
      uses — so it read as "this one is hovered" rather than "this one is
      next", and the row you were actually pointing at had no response of any
      kind. On the surface the whole daily loop runs through.
    */
    <div
      className={`relative flex items-center gap-[12px] rounded-[9px] px-[12px] py-[10px] transition-colors hover:bg-card-hover ${
        alarm ? "bg-[color-mix(in_srgb,var(--destructive)_7%,transparent)]" : ""
      } ${pending ? "opacity-45" : ""}`}
    >
      {/* The alarm's rail outranks the gold "you are here" one: a broken thing
          is not a queue position. */}
      {alarm || first ? (
        <span
          aria-hidden
          className="absolute inset-y-[8px] left-0 w-[2px] rounded-full"
          style={{ background: alarm ? "var(--destructive)" : "var(--primary)" }}
        />
      ) : null}

      {/*
        The row body is the trigger, everything except the tick and the X.

        The title used to be the link out, which nothing on screen said: the
        only hint was a hover colour, and on a phone there is no hover. One
        obvious interaction now — press the row, read the whole of it, and
        leave through a button that names where it goes.
      */}
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="flex min-w-0 grow items-center gap-[12px] text-left outline-none"
          >
            <span
              className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px]"
              style={{ background: chip }}
            >
              <Icon size={17} strokeWidth={1.8} style={{ color: accent }} />
            </span>

            <span className="flex min-w-0 grow flex-col gap-[2px]">
              <span
                className={`truncate text-[15px] font-medium ${alarm ? "text-destructive" : ""}`}
              >
                {item.title}
              </span>
              <span className="truncate text-[13px] text-muted-foreground">
                {label}
                {item.subtitle ? ` · ${item.subtitle}` : ""}
              </span>
            </span>
          </button>
        </PopoverTrigger>

        <PopoverContent>
          <Detail item={item} label={label} alarm={alarm} />
        </PopoverContent>
      </Popover>

      {/*
        Rule 3: dismissible is only for items where "gone" is true and final.
        A Todoist task is not gone because it is hidden — it is gone because it
        is done, so it gets a tick that completes it in Todoist rather than an
        X that would create a private notion of "cleared" Todoist never shares.
      */}
      {item.source === "gmail" && !item.externalId.startsWith("unread:rollup:") ? (
        /*
          The same rule, for the same reason. An unread message dismissed here
          would come straight back on the next poll, because the collector's
          search is "is:unread" and Steward's opinion is not part of it. So the
          tick marks it read in Gmail, and the row leaves because the message
          genuinely stopped matching.

          A roll-up row stands for several messages and has no single flag to
          set, so it keeps the X — its externalId is the digest of exactly which
          messages, and it will be replaced or deleted on the next run anyway.
        */
        <IconButton
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => readMailItem(item.id),
              "Marked read in Gmail.",
              () => unreadMailItem(item.id),
            )
          }
          aria-label={`Mark read: ${item.title}`}
          title="Mark read — sets the flag in Gmail"
          hover="teal"
        >
          <Check size={16} strokeWidth={2} />
        </IconButton>
      ) : item.source === "todoist" ? (
        <IconButton
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => tickItem(item.id),
              `Ticked ${item.title}.`,
              () => untickItem(item.id),
            )
          }
          aria-label={`Tick: ${item.title}`}
          title="Tick — completes it in Todoist"
          hover="teal"
        >
          {/* 16px where every other icon button carries 14. The tick and
              the X are the two controls pressed every day, and they are the
              reason to open the page at all. */}
          <Check size={16} strokeWidth={2} />
        </IconButton>
      ) : (
        <IconButton
          type="button"
          disabled={pending}
          onClick={() =>
            run(
              () => dismissItem(item.id),
              "Cleared.",
              () => undismissItem(item.id),
            )
          }
          aria-label={`Dismiss: ${item.title}`}
          title="Dismiss"
        >
          <X size={16} strokeWidth={1.8} />
        </IconButton>
      )}
    </div>
  );
}

/**
 * The row, in full, and the way out.
 *
 * **Deliberately modest.** An `Item` stores a title, a subtitle, a url, a
 * source and when it arrived, and the row already shows the first three — in
 * truncated form. So this card is not new information: it is the title
 * untruncated, the arrival time (stored since step 4 and shown nowhere until
 * now), and a button that says where "open" goes instead of hiding a link
 * inside a heading.
 *
 * If it should ever say more — a Todoist task's project, labels and description
 * all exist in the `Task` table — the adapter has to carry them onto the item
 * first. That is a collection change, not a rendering one, and it should be
 * made deliberately rather than by widening this card until it looks full.
 */
function Detail({
  item,
  label,
  alarm,
}: {
  item: QueueItem;
  label: string;
  alarm: boolean;
}) {
  return (
    <div className="flex flex-col gap-[10px]">
      <span className={`text-[15px] font-medium ${alarm ? "text-destructive" : ""}`}>
        {item.title}
      </span>

      {item.subtitle ? (
        <span className="text-[14px] leading-[1.5] text-muted-foreground">{item.subtitle}</span>
      ) : null}

      <div className="flex items-baseline justify-between gap-[10px] border-t pt-[10px]">
        <span className="font-mono text-[12px] text-faint">{label}</span>
        <span className="font-mono text-[12px] text-faint">
          {duration(item.occurredAt, new Date())} ago
        </span>
      </div>

      {item.url ? (
        <Button asChild variant="secondary" size="sm" className="w-full">
          <a href={item.url} target="_blank" rel="noreferrer">
            Open in {label}
            <ExternalLink size={13} strokeWidth={1.8} />
          </a>
        </Button>
      ) : (
        // Not every row has somewhere to go — an HA update and a people nudge
        // both live entirely inside Steward. Saying so beats a dead button.
        <span className="text-[13px] text-faint">Nothing to open — this one lives here.</span>
      )}
    </div>
  );
}
