"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check, X } from "lucide-react";
import {
  dismissItem,
  tickItem,
  undismissItem,
  untickItem,
  type Undoable,
} from "@/app/(app)/actions";
import type { QueueItem } from "@/lib/queue";
import { CATEGORY } from "./category";
import { SOURCE_LABEL } from "./source";

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
  const { icon: Icon, accent, chip } = CATEGORY[item.category];
  const label = SOURCE_LABEL[item.source];
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
    <div
      className={`flex items-center gap-[13px] rounded-[9px] px-[12px] py-[11px] ${
        first ? "bg-card-hover" : ""
      } ${pending ? "opacity-45" : ""}`}
    >
      <div
        className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px]"
        style={{ background: chip }}
      >
        <Icon size={17} strokeWidth={1.8} style={{ color: accent }} />
      </div>

      <div className="flex min-w-0 grow flex-col gap-[2px]">
        {item.url ? (
          <a
            href={item.url}
            target="_blank"
            rel="noreferrer"
            className="truncate text-[14px] font-medium hover:text-primary"
          >
            {item.title}
          </a>
        ) : (
          <span className="truncate text-[14px] font-medium">{item.title}</span>
        )}
        <span className="truncate text-[12px] text-muted-foreground">
          {label}
          {item.subtitle ? ` · ${item.subtitle}` : ""}
        </span>
      </div>

      {/*
        Rule 3: dismissible is only for items where "gone" is true and final.
        A Todoist task is not gone because it is hidden — it is gone because it
        is done, so it gets a tick that completes it in Todoist rather than an
        X that would create a private notion of "cleared" Todoist never shares.
      */}
      {item.source === "todoist" ? (
        <button
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
          className="flex size-[24px] items-center justify-center rounded-[6px] text-faint transition-colors hover:bg-secondary hover:text-teal disabled:opacity-40"
        >
          <Check size={16} strokeWidth={2} />
        </button>
      ) : (
        <button
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
          className="flex size-[24px] items-center justify-center rounded-[6px] text-faint transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-40"
        >
          <X size={16} strokeWidth={1.8} />
        </button>
      )}
    </div>
  );
}
