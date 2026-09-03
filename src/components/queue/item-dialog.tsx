"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, Sparkles } from "lucide-react";
import {
  itemDetail,
  summariseMail,
  type MailSummary,
} from "@/app/(app)/actions";
import type { ItemDetail } from "@/lib/item-detail";
import type { QueueItem } from "@/lib/queue";
import { CATEGORY } from "./category";
import { SOURCE_HOME, SOURCE_LABEL } from "./source";
import { Button } from "@/components/ui/button";
import {
  DialogClose,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { duration } from "@/lib/format";

/**
 * The whole of one queue row, and every way out of it.
 *
 * **A dialog, not the popover it replaces.** That popover showed the title
 * untruncated, the subtitle, an arrival time and one button — four things the
 * row had already said. It was honest about being thin, and the note in
 * `queue-row.tsx` said the fix was a collection change rather than a rendering
 * one. That collection change has now been made where it was needed, so this
 * can say what a row is actually about.
 *
 * **Facts arrive from the server when this opens**, never with the queue: most
 * rows are never opened, and joining every source for every row would be work
 * thrown away. Radix unmounts closed content, so the effect below runs once per
 * opening and the dialog is never showing another row's answer.
 *
 * **Two ways out, and they are different journeys.** `item.url` goes to the app
 * the thing lives in; `SOURCE_HOME` goes to the Steward page that shows it in
 * context. A subscription now offers both, which it could not before — `url`
 * held the cancel page or `/finance`, never the two.
 */
export function ItemDialog({
  item,
  children,
}: {
  item: QueueItem;
  /** The row's own affordances, rendered into the footer beside the links. */
  children?: React.ReactNode;
}) {
  const category = CATEGORY[item.category];
  const label = SOURCE_LABEL[item.source];
  const home = SOURCE_HOME[item.source];

  const [detail, setDetail] = useState<ItemDetail | null>(null);
  const [, startLoad] = useTransition();

  useEffect(() => {
    let live = true;
    startLoad(async () => {
      const answer = await itemDetail(item.id);
      // The dialog can close while this is in flight, and setting state on the
      // way out would show the next row a stale answer.
      if (live) setDetail(answer);
    });
    return () => {
      live = false;
    };
  }, [item.id]);

  return (
    <DialogContent className="sm:max-w-[440px]">
      <DialogHeader>
        <div className="flex items-start gap-[12px]">
          <span
            className="flex size-[34px] shrink-0 items-center justify-center rounded-[9px]"
            style={{ background: category.chip }}
          >
            <category.icon size={17} strokeWidth={1.8} style={{ color: category.accent }} />
          </span>

          <div className="flex min-w-0 flex-col gap-[4px]">
            {/* Untruncated, which is half the reason to open this at all: a
                subject line is routinely wider than the row. */}
            <DialogTitle className="text-[16px] leading-[1.35]">{item.title}</DialogTitle>
            <span className="font-mono text-[12px] text-faint">
              {label} · {duration(item.occurredAt, new Date())} ago
            </span>
          </div>
        </div>
      </DialogHeader>

      {item.subtitle ? (
        <p className="text-[14px] leading-[1.5] text-muted-foreground">{item.subtitle}</p>
      ) : null}

      {detail === null ? (
        // Deliberately not a spinner: the read is one or two indexed queries,
        // and a spinner that flashes for 30ms is noise. A quiet line that gets
        // replaced reads as the panel filling in, which is what happens.
        <p className="text-[13px] text-faint">Reading…</p>
      ) : (
        <Facts detail={detail} />
      )}

      {item.source === "gmail" && !item.externalId.startsWith("unread:rollup:") &&
      item.externalId !== "unread:more" ? (
        // Keyed on the cached summary so that when the detail arrives carrying
        // one, this remounts holding it rather than showing a Summarise button
        // for something already summarised. Nothing renders until the detail
        // has landed, so a message summarised five minutes ago never flashes a
        // button offering to do it again.
        detail === null ? null : (
          <>
            <Summarise
              key={detail.summary ?? "none"}
              id={item.id}
              cached={detail.summary}
              tried={detail.summaryTried}
            />

            {/* What the message itself says. For a notification that is only a
                pointer — the school portal's, say — this is the whole reason to
                open the row, and it saves the trip to Gmail that reading it
                used to mean. Its own scroller, so a promotional wall cannot
                push the footer's buttons out of reach. */}
            {detail.excerpt ? (
              <div className="flex flex-col gap-[4px]">
                <span className="text-[12px] text-faint">The message</span>
                <p className="max-h-[180px] overflow-y-auto rounded-[10px] border px-[12px] py-[10px] text-[14px] leading-[1.55] whitespace-pre-line text-muted-foreground">
                  {detail.excerpt}
                </p>
              </div>
            ) : null}
          </>
        )
      ) : null}

      <footer className="-mx-[16px] -mb-[16px] flex flex-wrap items-center gap-[8px] rounded-b-[14px] border-t bg-muted/50 p-[16px]">
        {item.url ? (
          <Button asChild variant="secondary" size="sm">
            <a href={item.url} target="_blank" rel="noreferrer">
              Open in {label}
              <ExternalLink size={13} strokeWidth={1.8} data-icon="inline-end" />
            </a>
          </Button>
        ) : null}

        {detail?.links.map((link) => (
          <Button key={link.href} asChild variant="outline" size="sm">
            <a href={link.href} target="_blank" rel="noreferrer">
              {link.label}
              <ExternalLink size={13} strokeWidth={1.8} data-icon="inline-end" />
            </a>
          </Button>
        ))}

        {home ? (
          // A client-side navigation, unlike the external links: this one stays
          // inside Steward and should not open a tab.
          <DialogClose asChild>
            <Button asChild variant="ghost" size="sm">
              <Link href={home}>
                {label === "Subscriptions" ? "Finance" : "See it in context"}
                <ArrowRight size={13} strokeWidth={1.8} data-icon="inline-end" />
              </Link>
            </Button>
          </DialogClose>
        ) : null}

        <span className="ml-auto flex items-center gap-[8px]">{children}</span>
      </footer>
    </DialogContent>
  );
}

function Facts({ detail }: { detail: ItemDetail }) {
  if (detail.facts.length === 0) {
    return detail.note ? <p className="text-[13px] text-faint">{detail.note}</p> : null;
  }

  return (
    <div className="flex flex-col gap-[8px]">
      <dl className="flex flex-col gap-[6px]">
        {detail.facts.map((fact, i) => (
          <div key={`${fact.label}-${i}`} className="flex items-baseline gap-[12px]">
            {/* A fixed first column, like the Today card's times: the labels
                are short and a ragged left edge makes four facts read as four
                unrelated sentences. */}
            <dt className="w-[104px] shrink-0 text-[13px] text-faint">{fact.label}</dt>
            <dd
              className={`min-w-0 grow ${fact.mono ? "font-mono text-[13px]" : "text-[14px]"} leading-[1.5]`}
            >
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      {detail.note ? <p className="text-[13px] text-faint">{detail.note}</p> : null}
    </div>
  );
}

/**
 * The local model, on one message.
 *
 * The body is fetched over IMAP when this is pressed, summarised, and dropped —
 * nothing is stored, which is what keeps Steward's promise that no mail
 * contents reach Postgres. **The mailbox is opened read-only**, so reading a
 * message here does not mark it read and does not clear its own row.
 *
 * First press of the day is slow — the model is 8 GB and Ollama evicts it after
 * fifteen minutes — so the pending label says what it is waiting for rather
 * than leaving a button that appears to have done nothing.
 */
function Summarise({
  id,
  cached,
  tried,
}: {
  id: string;
  cached: string | null;
  /** A summary was attempted. With no text, that means there was none to make. */
  tried: boolean;
}) {
  const [result, setResult] = useState<MailSummary | null>(
    cached ? { text: cached, error: null } : null,
  );
  const [pending, start] = useTransition();

  const run = (force: boolean) =>
    start(async () => setResult(await summariseMail(id, force)));

  // Tried, and there was nothing readable — a calendar invite, an image-only
  // newsletter. Offering the button here would offer an action that can only
  // fail, which is worse than saying so.
  if (tried && !cached && result === null) {
    return <p className="text-[13px] text-faint">Nothing readable in this one to summarise.</p>;
  }

  return (
    <div className="flex flex-col gap-[8px]">
      {result?.text ? (
        // Its own scroller as well as the dialog's, so a long answer cannot
        // push the footer's buttons out of reach even while the dialog itself
        // still fits.
        <p className="max-h-[220px] overflow-y-auto rounded-[10px] border bg-muted/40 px-[12px] py-[10px] text-[14px] leading-[1.55] whitespace-pre-line">
          {result.text}
        </p>
      ) : null}

      {result?.error ? (
        <p role="alert" className="text-[13px]" style={{ color: "var(--destructive)" }}>
          {result.error}
        </p>
      ) : null}

      {result?.text ? (
        // Quiet, because a cached summary is usually the end of it — but a bad
        // one should not be permanent, and the cache would otherwise make it so.
        <button
          type="button"
          disabled={pending}
          onClick={() => run(true)}
          className="self-start text-[13px] text-faint underline-offset-4 transition-colors hover:text-foreground hover:underline disabled:opacity-50"
        >
          {pending ? "Reading it again…" : "Summarise again"}
        </button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          className="self-start"
          onClick={() => run(false)}
        >
          <Sparkles size={13} strokeWidth={1.8} data-icon="inline-start" />
          {pending ? "Reading the message…" : "Summarise"}
        </Button>
      )}
    </div>
  );
}
