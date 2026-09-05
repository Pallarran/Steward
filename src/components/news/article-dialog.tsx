"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { Check, ExternalLink } from "lucide-react";
import { markRead, unreadArticle } from "@/app/(app)/news/actions";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * An article, read as far as the feed will let you.
 *
 * **Clicking a headline no longer marks it read** — Vincent's instruction, and
 * he is right that it was a side effect rather than a decision. Opening a piece
 * in another tab is not the same as being done with it, and the old behaviour
 * meant a mis-click cleared something silently. Now the card opens this, and
 * the only two things that clear an article are the X on the row and *Mark
 * read* below.
 *
 * **What it shows is the feed's own words**, not the article. Steward stores
 * whatever the feed put in `<description>` or `content:encoded`; for some that
 * is the whole post and for others two sentences. It says which by simply
 * showing what there is — promising "the full article" and then rendering a
 * teaser would be worse than the teaser.
 *
 * The same 560px as the queue's `ItemDialog`, which is the app's reader width.
 */
export function ArticleDialog({
  id,
  title,
  url,
  feedTitle,
  when,
  body,
  onDone,
}: {
  id: string;
  title: string;
  url: string;
  feedTitle: string;
  when: string;
  /** The stored summary, cleaned and uncapped. Null when the feed gave none. */
  body: string | null;
  /** Closes the dialog after an action that removed the row behind it. */
  onDone: () => void;
}) {
  const [pending, start] = useTransition();

  function clear() {
    start(async () => {
      await markRead(id);
      onDone();

      toast("Marked read.", {
        action: {
          label: "Undo",
          onClick: () => start(() => void unreadArticle(id)),
        },
      });
    });
  }

  return (
    <DialogContent className="sm:max-w-[560px] [&>*]:min-w-0">
      <DialogHeader>
        <div className="flex min-w-0 flex-col gap-[4px]">
          <DialogTitle className="text-[17px] leading-[1.3] break-words">{title}</DialogTitle>
          <span className="font-mono text-[12px] break-words text-faint">
            {feedTitle} · {when}
          </span>
        </div>
      </DialogHeader>

      {body ? (
        // Its own scroller, so a feed that syndicates the whole post cannot
        // push the two buttons out of reach.
        <p className="max-h-[420px] overflow-y-auto text-[15px] leading-[1.6] break-words whitespace-pre-line text-muted-foreground">
          {body}
        </p>
      ) : (
        <p className="text-[14px] text-faint">
          This feed sends headlines only — there is nothing here but the title.
        </p>
      )}

      <footer className="-mx-[16px] -mb-[16px] flex flex-wrap items-center gap-[8px] rounded-b-[14px] border-t bg-muted/50 p-[16px]">
        {/* Opens and marks nothing. That separation is the whole point of the
            dialog: reading it and being done with it are two decisions. */}
        <Button asChild variant="secondary" size="sm">
          <a href={url} target="_blank" rel="noreferrer">
            Open the article
            <ExternalLink size={13} strokeWidth={1.8} data-icon="inline-end" />
          </a>
        </Button>

        <span className="ml-auto flex items-center gap-[8px]">
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm">
              Leave it
            </Button>
          </DialogClose>

          <Button type="button" size="sm" disabled={pending} onClick={clear}>
            <Check size={13} strokeWidth={2} data-icon="inline-start" />
            Mark read
          </Button>
        </span>
      </footer>
    </DialogContent>
  );
}
