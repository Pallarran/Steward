"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { markRead } from "@/app/(app)/news/actions";

/**
 * One article.
 *
 * Opening it marks it read, because opening it *is* reading it and making
 * Vincent tick a second control afterwards would be bookkeeping. The article
 * still opens in a new tab; the mark is fired alongside and its result is not
 * waited on — losing a click to a slow round trip would be a worse failure than
 * an article that stays unread one refresh longer.
 *
 * The X is for the other case: seen the headline, not going to read it. Same
 * effect, different intent, and both are "gone, true and final" under rule 3.
 */
export function ArticleRow({
  id,
  title,
  url,
  feedTitle,
  when,
}: {
  id: string;
  title: string;
  url: string;
  feedTitle: string;
  when: string;
}) {
  const [pending, start] = useTransition();

  function clear() {
    start(() => {
      void markRead(id);
    });
  }

  return (
    <div
      className={`flex items-center gap-[13px] rounded-[9px] px-[12px] py-[10px] hover:bg-card-hover ${
        pending ? "opacity-40" : ""
      }`}
    >
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={clear}
        className="flex min-w-0 grow flex-col gap-[2px]"
      >
        <span className="truncate text-[14px] font-medium hover:text-primary">{title}</span>
        <span className="truncate text-[12px] text-muted-foreground">
          {feedTitle} · {when}
        </span>
      </a>

      <button
        type="button"
        onClick={clear}
        aria-label={`Clear: ${title}`}
        title="Not reading this"
        className="flex size-[24px] shrink-0 items-center justify-center rounded-[6px] text-faint transition-colors hover:bg-secondary hover:text-foreground"
      >
        <X size={16} strokeWidth={1.8} />
      </button>
    </div>
  );
}
