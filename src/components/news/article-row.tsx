"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { markRead, unreadArticle } from "@/app/(app)/news/actions";
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
  dek,
}: {
  id: string;
  title: string;
  url: string;
  feedTitle: string;
  when: string;
  /**
   * The feed's own summary, trimmed. **Collected since the parser was written
   * and rendered nowhere until 2026-09-04** — `readNews` does a bare `findMany`,
   * so it was fetched from Postgres, typed, carried through the render and
   * dropped at this prop boundary.
   *
   * It is what makes a column of headlines decidable: a title alone tells you
   * what a piece is called, and two lines of dek tell you whether to open it.
   */
  dek?: string | null;
}) {
  const [pending, start] = useTransition();

  /**
   * Opening it needs no undo — you meant to read it, and a toast over an
   * article you have just opened in another tab is noise you will never see.
   */
  function opened() {
    start(() => {
      void markRead(id);
    });
  }

  /**
   * The X does, and did not until 2026-09-04. Marking a whole topic read has
   * offered an undo since it was built; clearing one article — the commoner
   * act, and the one done by mistake — offered nothing.
   */
  function dismiss() {
    start(async () => {
      await markRead(id);

      toast("Cleared.", {
        action: {
          label: "Undo",
          onClick: () => start(() => void unreadArticle(id)),
        },
      });
    });
  }

  return (
    // `items-start`, not centre: the row is three lines now and the X belongs
    // at the top of it rather than floating halfway down a dek.
    <div
      className={`flex items-start gap-[10px] rounded-[9px] px-[12px] py-[10px] hover:bg-card-hover ${
        pending ? "opacity-40" : ""
      }`}
    >
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        onClick={opened}
        className="flex min-w-0 grow flex-col gap-[2px]"
      >
        {/* Two lines rather than one truncated. In a column roughly 380px wide
            a headline does not fit on one line, and cutting it at the fold is
            what made the old full-width list unreadable at a glance. */}
        <span className="line-clamp-2 text-[15px] leading-[1.35] font-medium hover:text-primary">
          {title}
        </span>

        {dek ? (
          <span className="line-clamp-2 text-[13px] leading-[1.45] text-muted-foreground">
            {dek}
          </span>
        ) : null}

        <span className="truncate font-mono text-[12px] text-faint">
          {feedTitle} · {when}
        </span>
      </a>

      <IconButton
        type="button"
        onClick={dismiss}
        aria-label={`Clear: ${title}`}
        title="Not reading this"
      >
        <X size={14} strokeWidth={1.8} />
      </IconButton>
    </div>
  );
}
