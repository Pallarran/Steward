import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/shell/panel";
import { Section } from "@/components/shell/section";
import { clock, duration } from "@/lib/format";
import { money, moneyExact, percent, readFinance, type Finance } from "@/lib/finance";
import { CADENCE_LABEL, readSubscriptions, type SubscriptionView } from "@/lib/subscriptions";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shell/empty-state";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { CreditCard, ExternalLink, Plus } from "lucide-react";
import { SubscriptionDialog } from "./subscription-dialog";
import { deleteSubscription, toggleSubscription } from "./actions";

export const metadata = { title: "Finance · Steward" };

const TZ = "America/Toronto";

/**
 * The finance panel — PRD component 3, v2.
 *
 * A summary and a way through to Horizon, in the same shape as the Systems
 * page: Steward never becomes the place you manage money, only the place you
 * find out whether you need to.
 *
 * Aggregates only, because that is all the endpoint returns. No holdings, no
 * transactions, no account names ever reach this process.
 */
export default async function FinancePage() {
  await requireAuth();

  const now = new Date();
  const [finance, { subscriptions, monthlyCents }] = await Promise.all([
    readFinance(now),
    readSubscriptions(now),
  ]);

  return (
    <>
      <PageHeader title="Finance" subtitle={verdict(finance)} />

      {/* The stamp is its own component because it says three different
          things — never answered, stale by this much, or as of this time. */}
      <Section title="Portfolio" action={<Stamp finance={finance} now={now} />}>
        {finance.summary === null ? (
          <Panel>
            <p className="max-w-[62ch] text-[13px] leading-[1.6] text-muted-foreground">
              {finance.configured
                ? "Horizon has not answered yet. Nothing is shown rather than a figure Steward cannot back up."
                : (
                    <>
                      Not connected. Steward needs{" "}
                      <span className="font-mono text-[12px]">HORIZON_BASE_URL</span> and{" "}
                      <span className="font-mono text-[12px]">HORIZON_API_KEY</span>, and Horizon
                      needs the same key back.
                    </>
                  )}
            </p>
          </Panel>
        ) : (
          <div className="grid grid-cols-1 gap-[10px] sm:grid-cols-3">
            {/*
              "Portfolio", not "Invested" and not "Net worth". This is the
              market value of positions plus cash — Horizon's own comment warns
              that its `netWorthCents` excludes the house and every liability,
              so it is neither. "Invested" would be the cost basis, which is a
              different number that happens to sit right beside it.
            */}
            <Figure
              label="Portfolio"
              value={money(finance.summary.netWorthCents, finance.summary.currency)}
              detail="positions and cash"
              stale={finance.stale}
            />
            <Figure
              label={finance.priceDateIsToday ? "Today" : marketDay(finance.summary.priceDate)}
              value={percent(finance.summary.dayChangePercent)}
              detail={money(finance.summary.dayChangeCents, finance.summary.currency)}
              tone={finance.summary.dayChangeCents === 0 ? undefined : finance.summary.dayChangeCents > 0 ? "gain" : "loss"}
              stale={finance.stale}
            />
            <Figure
              label="Unrealised, against cost"
              value={percent(finance.summary.unrealizedGainPercent)}
              detail={money(finance.summary.unrealizedGainCents, finance.summary.currency)}
              tone={finance.summary.unrealizedGainCents >= 0 ? "gain" : "loss"}
              stale={finance.stale}
            />
          </div>
        )}
      </Section>

      {/*
        Moved here from Documents on 2026-09-01. It sat there because the PRD
        files it under Documentation, and the PRD does that because of where the
        data was once imagined coming from — not because a subscription is a
        document. It is money leaving an account on a schedule.
      */}
      <Section
        title="Subscriptions"
        detail={
          subscriptions.some((s) => s.active)
            ? `${money(monthlyCents)} a month · ${money(monthlyCents * 12)} a year`
            : "nothing active"
        }
        action={
          subscriptions.length > 0 ? (
            <SubscriptionDialog
              trigger={
                <Button variant="ghost" size="sm" className="text-faint">
                  <Plus size={13} strokeWidth={2} />
                  Add
                </Button>
              }
            />
          ) : null
        }
      >
        {subscriptions.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="Nothing tracked yet"
            description="A forgotten renewal is the only thing on this page that costs money without asking. Add one and Steward puts a line in the queue before it takes it."
          >
            <SubscriptionDialog
              trigger={
                <Button>
                  <Plus size={14} strokeWidth={2} />
                  Add a subscription
                </Button>
              }
            />
          </EmptyState>
        ) : (
          <Renewals subscriptions={subscriptions} />
        )}
      </Section>

      <Section
        title="Everything else"
        detail={process.env.HORIZON_BASE_URL ? "open Horizon" : undefined}
        href={process.env.HORIZON_BASE_URL}
      >
        <Panel>
          <p className="max-w-[62ch] text-[13px] leading-[1.6] text-muted-foreground">
            Holdings, transactions, allocation, dividends and the retirement projection live in
            Horizon, and stay there. So does true net worth: the figure above is the investable
            portfolio, and it counts neither the house nor any liability.
            <br />
            <br />
            Steward reads four aggregate numbers and nothing else. No holdings, no transactions and
            no account names ever reach this process, because the endpoint does not return them.
          </p>
        </Panel>
      </Section>
    </>
  );
}

/**
 * The renewals, as a calendar that rotates from today.
 *
 * **Months do not own rows.** Two earlier shapes were wrong for this data: a
 * line each under a month divider gave nearly as many headings as rows, and
 * giving each month its own grid meant a month with one subscription took a
 * whole row and left the rest of the width empty. So the cards simply flow in
 * date order and wrap where they wrap, and a month boundary landing mid-row is
 * the point rather than a flaw.
 *
 * The month stays legible without owning anything: a card that opens a new
 * month names it, and cards continuing a month show the day alone.
 *
 * Nothing truncates. Horizon's densest card silently drops everything past the
 * third row with no affordance, which is the one thing here worth not copying.
 */
function Renewals({ subscriptions }: { subscriptions: SubscriptionView[] }) {
  const active = subscriptions.filter((s) => s.active);
  const cancelled = subscriptions.filter((s) => !s.active);

  // Worked out before the JSX rather than by carrying a variable through the
  // map: mutating during render is exactly what `react-hooks/immutability`
  // forbids, and it caught this one.
  //
  // Already sorted soonest-first by `readSubscriptions`, so the month changes
  // exactly where the flow crosses one.
  const flow = active.map((sub, i) => ({
    sub,
    opensMonth: i === 0 || monthKey(sub.next) !== monthKey(active[i - 1].next),
  }));

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-3 lg:grid-cols-4">
        {flow.map(({ sub, opensMonth }) => (
          <Renewal key={sub.id} sub={sub} opensMonth={opensMonth} />
        ))}
      </div>

      {/*
        Their own group, and no month. A cancelled subscription takes no money,
        so letting one sit in the flow would put it in a month it does not
        belong to. The record is kept deliberately — that is what "mark
        cancelled" is for, rather than removing it.
      */}
      {cancelled.length > 0 ? (
        <div className="flex flex-col gap-[8px]">
          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
            Cancelled
          </span>
          <div className="grid grid-cols-2 gap-[8px] opacity-45 sm:grid-cols-3 lg:grid-cols-4">
            {cancelled.map((sub) => (
              <Renewal key={sub.id} sub={sub} opensMonth={false} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Two lines: name and amount, then cadence and when it next goes.
 *
 * It was three lines plus a strip of four controls — cancel link, mark
 * cancelled, edit, remove — and that strip is the only reason it needed the
 * height. The controls moved into the popover, which is what makes the card
 * small enough to sit four across.
 *
 * **The cadence cannot be dropped to save the line.** `$18.99` monthly and
 * `$18.99` yearly are different facts, and the amount alone flattens them.
 */
function Renewal({ sub, opensMonth }: { sub: SubscriptionView; opensMonth: boolean }) {
  const tone = renewalTone(sub);

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/*
          A real `<button>`, not `Panel`. `PopoverTrigger asChild` clones its
          immediate child to attach the handlers, and a component swallows them
          — the element has to be the DOM node itself.

          The measurements are the Systems page's `Tile`, not `Panel`'s: this is
          a tile, and 12/10 is what a compact tile takes there. If a third one
          appears, that is the point at which `Tile` earns extraction.
        */}
        <button
          type="button"
          className="flex min-w-0 flex-col gap-[6px] rounded-[9px] border bg-card px-[12px] py-[10px] text-left transition-colors outline-none hover:bg-card-hover"
        >
          <span className="flex min-w-0 items-baseline justify-between gap-[8px]">
            <span className="min-w-0 truncate text-[14px] font-medium">{sub.name}</span>
            <span className="shrink-0 font-mono text-[13px]">
              {moneyExact(sub.amountCents, sub.currency)}
            </span>
          </span>

          <span className="flex min-w-0 items-baseline justify-between gap-[8px]">
            <span className="shrink-0 font-mono text-[11px] text-faint">
              {CADENCE_LABEL[sub.cadence]}
            </span>
            <span className="min-w-0 truncate font-mono text-[11px]" style={{ color: tone }}>
              {sub.active ? renewsIn(sub, opensMonth) : "cancelled"}
            </span>
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent>
        <RenewalDetail sub={sub} />
      </PopoverContent>
    </Popover>
  );
}

function RenewalDetail({ sub }: { sub: SubscriptionView }) {
  return (
    <div className="flex flex-col gap-[10px]">
      <span className="text-[14px] font-medium">{sub.name}</span>

      <span className="text-[13px] leading-[1.5] text-muted-foreground">
        {moneyExact(sub.amountCents, sub.currency)} {CADENCE_LABEL[sub.cadence]}
        {sub.card ? ` · ${sub.card}` : ""}
      </span>

      {sub.notes ? <span className="text-[13px] text-faint">{sub.notes}</span> : null}

      <div className="flex items-baseline justify-between gap-[10px] border-t pt-[10px] font-mono text-[11px] text-faint">
        <span>{sub.active ? fullDate(sub.next) : "cancelled"}</span>
        <span>
          {sub.noticeDays === null
            ? "no reminder"
            : `warns ${sub.noticeDays} ${sub.noticeDays === 1 ? "day" : "days"} ahead`}
        </span>
      </div>

      {sub.cancelUrl ? (
        <Button asChild variant="secondary" size="sm" className="w-full">
          <a href={sub.cancelUrl} target="_blank" rel="noreferrer">
            Cancel page
            <ExternalLink size={13} strokeWidth={1.8} />
          </a>
        </Button>
      ) : null}

      <div className="flex items-center justify-between gap-[10px]">
        <form action={toggleSubscription}>
          <input type="hidden" name="id" value={sub.id} />
          <button
            type="submit"
            className="text-[12px] text-faint transition-colors hover:text-foreground"
          >
            {sub.active ? "Mark cancelled" : "Reactivate"}
          </button>
        </form>

        <span className="flex items-center gap-[12px]">
          <SubscriptionDialog
            sub={sub}
            trigger={
              <button
                type="button"
                className="text-[12px] text-faint transition-colors hover:text-foreground"
              >
                Edit
              </button>
            }
          />

          <ConfirmDialog
            title={`Remove the ${sub.name} record?`}
            description="What it cost, when it renewed and where to cancel it all go. Marking it cancelled keeps the record, which is usually what you want."
            action={deleteSubscription}
            id={sub.id}
            done={`Removed ${sub.name}.`}
            trigger={
              <button
                type="button"
                className="text-[12px] text-faint transition-colors hover:text-destructive"
              >
                Remove
              </button>
            }
          />
        </span>
      </div>
    </div>
  );
}

/**
 * The colour of a renewal date, in one place.
 *
 * Gold inside its own notice window — which is exactly what `soon` means, so
 * the rule is not re-derived here. Horizon inlines this shape of decision in
 * four components and extracts it in one; the extracted one reads far better,
 * and this is invented rather than ported since Horizon has no countdown at all.
 */
function renewalTone(sub: SubscriptionView): string {
  if (!sub.active) return "var(--faint)";
  return sub.soon ? "var(--primary)" : "var(--muted-foreground)";
}

/** `YYYY-MM` in the house, so the flow knows where a month begins. */
function monthKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: TZ,
  }).format(date);
}

/**
 * "6 · 5d", or "NOV 3 · 33d" on the card that opens a month.
 *
 * The month name is the only thing left of grouping by month, and it is enough:
 * naming it on the first card of each run makes the months read as bands across
 * the flow without any of them owning a row.
 */
function renewsIn(sub: SubscriptionView, opensMonth: boolean): string {
  const when = opensMonth
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: TZ })
        .format(sub.next)
        .toUpperCase()
    : new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: TZ }).format(sub.next);

  if (sub.daysAway <= 0) return `${when} · today`;
  return `${when} · ${sub.daysAway}d`;
}

function fullDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TZ,
  }).format(date);
}

/* ---------------------------------------------------------------- helpers */

function verdict(finance: Finance): string {
  if (!finance.configured) return "not connected to Horizon yet";
  if (finance.stale || finance.summary === null) return "Horizon is not answering, so this is not known";
  if (!finance.priceDateIsToday) return "the market is closed — these are the last close";
  return finance.summary.dayChangeCents >= 0 ? "up today" : "down today";
}

/** "Friday" reads better than a date for something two days old. */
function marketDay(priceDate: string | null): string {
  if (!priceDate) return "Last close";

  // priceDate is a calendar day, so it is read at noon UTC to keep it on that
  // day in every timezone rather than slipping back one.
  const day = new Date(`${priceDate}T12:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: TZ }).format(day);
}

/**
 * Rule 2. Two different clocks, and they mean different things.
 *
 * Amber and loud when the collector is behind: Steward does not know Horizon's
 * current figures. Quiet when the collector is fine but the market is closed:
 * nothing is wrong, the numbers are simply Friday's, and the panel says so
 * rather than implying they are today's.
 */
function Stamp({ finance, now }: { finance: Finance; now: Date }) {
  if (!finance.configured) return null;

  if (finance.stale) {
    return (
      <span className="font-mono text-[11px] text-warning">
        {finance.asOf
          ? `Horizon last answered at ${clock(finance.asOf)}, ${duration(finance.asOf, now)} ago`
          : "Horizon has never answered"}
      </span>
    );
  }

  if (finance.summary?.priceDate && !finance.priceDateIsToday) {
    return (
      <span className="font-mono text-[11px] text-faint">
        prices from {finance.summary.priceDate}
      </span>
    );
  }

  return null;
}


function Figure({
  label,
  value,
  detail,
  tone,
  stale,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: "gain" | "loss";
  stale: boolean;
}) {
  const colour = tone === "gain" ? "var(--teal)" : tone === "loss" ? "var(--destructive)" : undefined;

  return (
    <Panel className="flex flex-col gap-[4px]">
      {/* Replaced, not dimmed: a faded but readable stale figure is still being
          offered as the answer. */}
      <span className="font-mono text-[20px] font-bold leading-[1.1]" style={{ color: stale ? undefined : colour }}>
        {stale ? "—" : value}
      </span>
      <span className="text-[12px] text-muted-foreground">{label}</span>
      {detail && !stale ? <span className="font-mono text-[11px] text-faint">{detail}</span> : null}
    </Panel>
  );
}
