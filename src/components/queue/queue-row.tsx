import { Check, X } from "lucide-react";
import { dismissItem, tickItem } from "@/app/(app)/actions";
import type { QueueItem } from "@/lib/queue";
import { CATEGORY } from "./category";
import { SOURCE_LABEL } from "./source";

/**
 * 34px category chip, the title, a `Category · detail` second line, and the
 * dismiss X — docs/DESIGN.md. No numbering and no tiers: position carries the
 * priority, so the number is never shown.
 *
 * The second line reads `Source · detail`, so `subtitle` must hold **only** the
 * detail. It used to lead with the category, which made Todoist's Inbox rows
 * say "Inbox · Inbox" — and the source is the more useful half anyway, since
 * the coloured chip already carries the category.
 */
export function QueueRow({ item, first }: { item: QueueItem; first: boolean }) {
  const { icon: Icon, accent, chip } = CATEGORY[item.category];
  const label = SOURCE_LABEL[item.source];

  return (
    <div
      className={`flex items-center gap-[13px] rounded-[9px] px-[12px] py-[11px] ${
        first ? "bg-card-hover" : ""
      }`}
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
        <form action={tickItem}>
          <input type="hidden" name="id" value={item.id} />
          <button
            type="submit"
            aria-label={`Tick: ${item.title}`}
            title="Tick — completes it in Todoist"
            className="flex size-[24px] items-center justify-center rounded-[6px] text-faint transition-colors hover:bg-secondary hover:text-teal"
          >
            <Check size={16} strokeWidth={2} />
          </button>
        </form>
      ) : (
        <form action={dismissItem}>
          <input type="hidden" name="id" value={item.id} />
          <button
            type="submit"
            aria-label={`Dismiss: ${item.title}`}
            title="Dismiss"
            className="flex size-[24px] items-center justify-center rounded-[6px] text-faint transition-colors hover:bg-secondary hover:text-foreground"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </form>
      )}
    </div>
  );
}
