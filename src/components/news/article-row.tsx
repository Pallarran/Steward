"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { markRead, unreadArticle } from "@/app/(app)/news/actions";
import { IconButton } from "@/components/shell/icon-button";
import { Dialog, DialogTrigger } from "@/components/ui/dialog";
import { ArticleDialog } from "./article-dialog";

/**
 * One article.
 *
 * **Pressing it opens a reader, and marks nothing** — changed 2026-09-05 at
 * Vincent's instruction. It used to open the article in a new tab and fire
 * `markRead` alongside, on the argument that opening it *is* reading it. That
 * conflated two decisions: a mis-click cleared a piece silently, and there was
 * no way to look at something and put it back. The dialog carries both actions
 * explicitly.
 *
 * The X stays direct. "Seen the headline, not reading it" is a real intent, it
 * is one press, and it has had an undo since 2026-09-04.
 */
export function ArticleRow({
  id,
  title,
  url,
  feedTitle,
  when,
  dek,
  body,
}: {
  id: string;
  title: string;
  url: string;
  feedTitle: string;
  when: string;
  /**
   * The feed's summary, trimmed to two clamped lines. What makes a column of
   * headlines decidable: a title says what a piece is called, a dek says
   * whether to open it.
   */
  dek?: string | null;
  /** The same summary uncapped, for the dialog. */
  body?: string | null;
}) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);

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
    <div
      className={`flex items-start gap-[10px] rounded-[9px] px-[12px] py-[10px] hover:bg-card-hover ${
        pending ? "opacity-40" : ""
      }`}
    >
      {/* Controlled, and the content only exists while open — the same reason
          the queue's rows are: an uncontrolled Radix dialog still runs its
          content component for every row on the page. */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <button type="button" className="flex min-w-0 grow flex-col gap-[2px] text-left outline-none">
            {/* Two lines rather than one truncated. In a column roughly 380px
                wide a headline does not fit on one line, and cutting it at the
                fold is what made the old full-width list unreadable. */}
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
          </button>
        </DialogTrigger>

        {open ? (
          <ArticleDialog
            id={id}
            title={title}
            url={url}
            feedTitle={feedTitle}
            when={when}
            body={body ?? null}
            onDone={() => setOpen(false)}
          />
        ) : null}
      </Dialog>

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
