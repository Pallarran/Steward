"use client";

import { useTransition } from "react";
import { X } from "lucide-react";
import { markRead } from "@/app/(app)/news/actions";
import { IconButton } from "@/components/shell/icon-button";

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
      className={`flex items-center gap-[12px] rounded-[9px] px-[12px] py-[10px] hover:bg-card-hover ${
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
        <span className="truncate text-[15px] font-medium hover:text-primary">{title}</span>
        <span className="truncate text-[13px] text-muted-foreground">
          {feedTitle} · {when}
        </span>
      </a>

      <IconButton
        type="button"
        onClick={clear}
        aria-label={`Clear: ${title}`}
        title="Not reading this"
      >
        <X size={14} strokeWidth={1.8} />
      </IconButton>
    </div>
  );
}
