"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Archive, Check, Trash2, TriangleAlert, X } from "lucide-react";
import {
  archiveMailItem,
  deleteMailItem,
  dismissItem,
  readMailItem,
  restoreMailItem,
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
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogTrigger } from "@/components/ui/dialog";
import { ItemDialog } from "./item-dialog";

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
  const [open, setOpen] = useState(false);

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

  /*
    Rule 3: dismissible is only for items where "gone" is true and final.

    A Todoist task is not gone because it is hidden — it is gone because it is
    done, so it gets a tick that completes it in Todoist rather than an X that
    would create a private notion of "cleared" Todoist never shares. Unread mail
    is the same: the collector searches `is:unread` and Steward's opinion is not
    part of that, so a dismissed message would return within five minutes. The
    tick sets the flag in Gmail and the row leaves because the message genuinely
    stopped matching.

    **Built once and rendered twice** — in the row, and in the dialog's footer.
    Two components deciding separately which sources get a tick is how the two
    drift, and this rule is not one to hold in two places.

    The tail row and the roll-ups written before 2026-09-02 stand for several
    messages and have no single flag to set, so they keep the X.
  */
  const mailWithAFlag =
    item.source === "gmail" &&
    item.externalId !== "unread:more" &&
    !item.externalId.startsWith("unread:rollup:");

  const control = mailWithAFlag ? (
    <IconButton
      type="button"
      disabled={pending}
      onClick={() =>
        run(() => readMailItem(item.id), "Marked read in Gmail.", () => unreadMailItem(item.id))
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
      onClick={() => run(() => tickItem(item.id), `Ticked ${item.title}.`, () => untickItem(item.id))}
      aria-label={`Tick: ${item.title}`}
      title="Tick — completes it in Todoist"
      hover="teal"
    >
      {/* 16px where every other icon button carries 14. The tick and the X are
          the two controls pressed every day, and they are the reason to open
          the page at all. */}
      <Check size={16} strokeWidth={2} />
    </IconButton>
  ) : (
    <IconButton
      type="button"
      disabled={pending}
      onClick={() => run(() => dismissItem(item.id), "Cleared.", () => undismissItem(item.id))}
      aria-label={`Dismiss: ${item.title}`}
      title="Dismiss"
    >
      <X size={16} strokeWidth={1.8} />
    </IconButton>
  );

  /*
    Filing and binning, for the dialog's footer only.

    **Not on the row**, which keeps one control. The row is a list you work down
    at a glance, and three buttons on every line would turn a scan into a
    choice — these are for when you have opened a message and decided about it.

    Both are moves in Gmail and neither destroys anything: archive keeps it in
    All Mail, delete keeps it in Trash for thirty days. So both get an undo
    rather than a confirmation, which is the app's rule for anything the row can
    come back from.
  */
  const filing = mailWithAFlag ? (
    <>
      {/* Both close the dialog: the row behind it is about to leave the queue,
          and a dialog left open over a row that no longer exists is a dialog
          describing nothing. */}
      <DialogClose asChild>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() =>
          run(
            () => archiveMailItem(item.id),
            "Archived.",
            () => restoreMailItem(item.id, "archive"),
          )
        }
      >
        <Archive size={13} strokeWidth={1.8} data-icon="inline-start" />
        Archive
      </Button>
      </DialogClose>

      <DialogClose asChild>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() =>
          run(
            () => deleteMailItem(item.id),
            "Moved to Gmail's Trash.",
            () => restoreMailItem(item.id, "trash"),
          )
        }
      >
        <Trash2 size={13} strokeWidth={1.8} data-icon="inline-start" />
        Delete
      </Button>
      </DialogClose>
    </>
  ) : null;

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
      {/*
        Controlled, and the content is not rendered until it is open.

        **Radix unmounts a closed dialog's *portal*, not the component that
        returns it** — so an uncontrolled `<Dialog>` still runs `ItemDialog`'s
        body and its effect for every row on the page, firing one detail query
        per row at load. That is precisely the cost this design exists to avoid,
        and it is invisible: the dialogs render nothing, so nothing looks wrong.
      */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
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
        </DialogTrigger>

        {/*
          The row's own control is handed to the dialog rather than duplicated
          there, so the tick in the footer is the same tick, with the same undo
          and the same rule 3 reasoning behind it. Two components deciding
          separately whether a source gets a tick or an X is how they drift.
        */}
        {open ? (
          <ItemDialog item={item}>
            {filing}
            <DialogClose asChild>{control}</DialogClose>
          </ItemDialog>
        ) : null}
      </Dialog>

      {control}
    </div>
  );
}
