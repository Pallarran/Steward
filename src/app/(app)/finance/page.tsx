import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/shell/panel";
import { Section } from "@/components/shell/section";
import { money, moneyExact, percent, readFinance, type Finance } from "@/lib/finance";
import { CADENCE_LABEL, readSubscriptions, type SubscriptionView } from "@/lib/subscriptions";
import { rateLabel, type Fx } from "@/lib/fx";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shell/empty-state";
import { NotKnown } from "@/components/shell/not-known";
import { TILE_SHELL } from "@/components/shell/tile";
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
  const [finance, { subscriptions, monthlyCents, unconverted, fx }] = await Promise.all([
    readFinance(now),
    readSubscriptions(now),
  ]);

  return (
    <>
      <PageHeader title="Finance" subtitle={verdict(finance)} />

      {/*
        `stale` and `detail`, not a bespoke stamp.

        This built its own — landing in the `action` slot with the same classes
        `SectionHead` already uses, and a third wording for a sentence the app
        says two other ways. `SectionHead`'s own precedence handles it: the
        stale line beats the detail, so a behind collector says so and a fresh
        one whose prices are from an earlier session says *that* instead.
      */}
      <Section
        title="Portfolio"
        stale={finance.configured && finance.stale ? finance.asOf : undefined}
        now={now}
        detail={
          finance.summary?.priceDate && !finance.priceDateIsToday
            ? `prices from ${finance.summary.priceDate}`
            : undefined
        }
      >
        {finance.summary === null ? (
          <Panel>
            <NotKnown>
              {finance.configured
                ? "Horizon has not answered yet. Nothing is shown rather than a figure Steward cannot back up."
                : (
                    <>
                      Not connected. Steward needs{" "}
                      <span className="font-mono text-[13px]">HORIZON_BASE_URL</span> and{" "}
                      <span className="font-mono text-[13px]">HORIZON_API_KEY</span>, and Horizon
                      needs the same key back.
                    </>
                  )}
            </NotKnown>
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
            ? subscriptionTotal(monthlyCents, unconverted)
            : "nothing active"
        }
        action={
          subscriptions.length > 0 ? (
            <SubscriptionDialog
              trigger={
                // `secondary`, not `ghost text-faint`. Adding is the commonest
                // constructive act in the app and it was wearing its faintest
                // style here, on People twice and on Launcher twice — while
                // rarer actions beside them were solid.
                <Button variant="secondary" size="sm">
                  <Plus size={13} strokeWidth={2} data-icon="inline-start" />
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
          <Renewals subscriptions={subscriptions} fx={fx} />
        )}
      </Section>

      <Section
        title="Everything else"
        detail={process.env.HORIZON_BASE_URL ? "open Horizon" : undefined}
        href={process.env.HORIZON_BASE_URL}
      >
        {/* No `Panel`. It was a 1648 × 272px bordered card wrapping 484px of
            prose, so its right two-thirds was an empty filled rectangle — and
            it was the tallest section on the page, tied with the one holding
            every live subscription. A disclaimer is not a card. */}
        <NotKnown>
          Holdings, transactions, allocation, dividends and the retirement projection live in
          Horizon, and stay there. So does true net worth: the figure above is the investable
          portfolio, and it counts neither the house nor any liability.
          <br />
          <br />
          Steward reads four aggregate numbers and nothing else. No holdings, no transactions and no
          account names ever reach this process, because the endpoint does not return them.
        </NotKnown>
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
 * **Every card names its own month**, from 2026-09-02. It was named only on the
 * first card of each month's run, which is a single-column idea: in a grid that
 * wraps, the card before a given one can be at the end of the row above, so a
 * day number with no month has nothing nearby to read it against.
 *
 * Nothing truncates. Horizon's densest card silently drops everything past the
 * third row with no affordance, which is the one thing here worth not copying.
 */
function Renewals({ subscriptions, fx }: { subscriptions: SubscriptionView[]; fx: Fx | null }) {
  const active = subscriptions.filter((s) => s.active);
  const cancelled = subscriptions.filter((s) => !s.active);

  return (
    <div className="flex flex-col gap-[16px]">
      <div className="grid grid-cols-2 gap-[8px] sm:grid-cols-3 lg:grid-cols-4">
        {active.map((sub) => (
          <Renewal key={sub.id} sub={sub} fx={fx} />
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
          <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-faint">
            Cancelled
          </span>
          <div className="grid grid-cols-2 gap-[8px] opacity-45 sm:grid-cols-3 lg:grid-cols-4">
            {cancelled.map((sub) => (
              <Renewal key={sub.id} sub={sub} fx={fx} />
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
 *
 * **Regrouped on 2026-09-02, at Vincent's proposal**, once a subscription could
 * be billed in US dollars. The name and its date are one line and the money is
 * the other, which is what the card was reaching for anyway: the amount used to
 * sit beside the name and the cadence beside the date, so the two halves of the
 * price were on opposite lines and diagonally apart. A US row adds its original
 * figure in the same group as the converted one, in the position a currency
 * conversion is read everywhere else — the true number, then the one it came
 * from, in brackets.
 */
function Renewal({ sub, fx }: { sub: SubscriptionView; fx: Fx | null }) {
  const tone = renewalTone(sub);
  const foreign = sub.currency !== "CAD";

  /*
    Canadian first, because the whole page totals in Canadian and a column of
    figures nobody can compare down is worth less than one they can.

    The exception is a US row with no rate collected: there is no Canadian
    figure to lead with, so the card leads with the only true one it has and
    says what is missing. Never the US amount printed as though it were CAD.
  */
  const primary =
    sub.cadCents === null
      ? moneyExact(sub.amountCents, sub.currency)
      : moneyExact(sub.cadCents);

  const original = !foreign
    ? null
    : sub.cadCents === null
      ? "no CAD rate"
      : `(${moneyExact(sub.amountCents, sub.currency)})`;

  return (
    <Popover>
      <PopoverTrigger asChild>
        {/*
          A real `<button>`, not `Panel`. `PopoverTrigger asChild` clones its
          immediate child to attach the handlers, and a component swallows them
          — the element has to be the DOM node itself.

          The measurements come from `TILE_SHELL` rather than being typed here.
          They were copied from the Systems tile by hand and this comment used
          to say that a third copy would earn the extraction; `Tile` was then
          extracted without taking this one with it, which left the geometry
          duplicated in exactly the place that had predicted it.
        */}
        <button
          type="button"
          className={`${TILE_SHELL} bg-card text-left outline-none hover:bg-card-hover`}
        >
          <span className="flex min-w-0 items-baseline justify-between gap-[8px]">
            <span className="min-w-0 truncate text-[15px] font-medium">{sub.name}</span>
            <span className="shrink-0 font-mono text-[12px]" style={{ color: tone }}>
              {sub.active ? renewsIn(sub) : "cancelled"}
            </span>
          </span>

          <span className="flex min-w-0 items-baseline justify-between gap-[8px]">
            <span className="flex min-w-0 items-baseline gap-[5px]">
              <span className="shrink-0 font-mono text-[14px]">{primary}</span>
              {/* The only thing on the card allowed to clip. Four across it
                  never does; two across on a phone the line can run out, and
                  what gives way has to be the figure you are not budgeting in.
                  The full amount is in the popover. */}
              {original ? (
                <span className="min-w-0 truncate font-mono text-[12px] text-faint">
                  {original}
                </span>
              ) : null}
            </span>

            <span className="shrink-0 font-mono text-[12px] text-faint">
              {CADENCE_LABEL[sub.cadence]}
            </span>
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent>
        <RenewalDetail sub={sub} fx={fx} />
      </PopoverContent>
    </Popover>
  );
}

function RenewalDetail({ sub, fx }: { sub: SubscriptionView; fx: Fx | null }) {
  return (
    <div className="flex flex-col gap-[10px]">
      <span className="text-[15px] font-medium">{sub.name}</span>

      <span className="text-[14px] leading-[1.5] text-muted-foreground">
        {moneyExact(sub.amountCents, sub.currency)} {CADENCE_LABEL[sub.cadence]}
        {sub.card ? ` · ${sub.card}` : ""}
      </span>

      {/* Where the converted figure comes from. The card has room for the
          number and not for its provenance, and a rate is only meaningful with
          the day it is for — the same reason the portfolio carries a market
          date rather than just a percentage. */}
      {sub.currency !== "CAD" ? (
        <span className="font-mono text-[12px] text-faint">
          {sub.cadCents === null || fx === null
            ? "No exchange rate collected yet — Horizon has not sent one."
            : `${moneyExact(sub.cadCents)} ${rateLabel(fx)}`}
        </span>
      ) : null}

      {sub.notes ? <span className="text-[14px] text-faint">{sub.notes}</span> : null}

      <div className="flex items-baseline justify-between gap-[10px] border-t pt-[10px] font-mono text-[12px] text-faint">
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
            className="text-[13px] text-faint transition-colors hover:text-foreground"
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
                className="text-[13px] text-faint transition-colors hover:text-foreground"
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
                className="text-[13px] text-faint transition-colors hover:text-destructive"
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
 * "$164 a month · $1,968 a year", in CAD.
 *
 * **The count of what is missing is not optional.** With a US subscription and
 * no rate collected, the total is genuinely an understatement, and a figure
 * shown as the whole of something it is not is the exact failure rule 2 exists
 * to prevent. Naming the gap costs four words and makes the number honest.
 */
function subscriptionTotal(monthlyCents: number, unconverted: number): string {
  const total = `${money(monthlyCents)} a month · ${money(monthlyCents * 12)} a year`;
  if (unconverted === 0) return total;
  return `${total} · ${unconverted} not converted, no rate`;
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

/**
 * "NOV 3 · 33d".
 *
 * **Every card names its month, from 2026-09-02.** It used to be named only on
 * the first card of each month's run, on the argument that this made the months
 * read as bands across the flow without any of them owning a row. That works in
 * a single column and not in a wrapping grid: the card before a given one may
 * be at the end of the row above, so a bare `3 · 33d` sends you hunting for the
 * last card that did name a month. Vincent found exactly that. Four characters
 * on a line the name already yields to is a cheap price for a date that reads
 * on its own.
 */
function renewsIn(sub: SubscriptionView): string {
  const when = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: TZ })
    .format(sub.next)
    .toUpperCase();

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
      <span className="font-mono text-[22px] font-bold leading-[1.1]" style={{ color: stale ? undefined : colour }}>
        {stale ? "—" : value}
      </span>
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {detail && !stale ? <span className="font-mono text-[12px] text-faint">{detail}</span> : null}
    </Panel>
  );
}
