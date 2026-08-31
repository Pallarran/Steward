import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/shell/panel";
import { Section } from "@/components/shell/section";
import { clock, duration } from "@/lib/format";
import { money, percent, readFinance, type Finance } from "@/lib/finance";

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
  const finance = await readFinance(now);

  return (
    <>
      <PageHeader title="Finance" subtitle={verdict(finance)} />

      {/* The stamp is its own component because it says three different
          things — never answered, stale by this much, or as of this time. */}
      <Section title="Portfolio" action={<Stamp finance={finance} now={now} />}>
        {finance.summary === null ? (
          <Panel>
            <p className="text-[13px] leading-[1.6] text-muted-foreground">
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

      <Section
        title="Everything else"
        detail={process.env.HORIZON_BASE_URL ? "open Horizon" : undefined}
        href={process.env.HORIZON_BASE_URL}
      >
        <Panel>
          <p className="text-[13px] leading-[1.6] text-muted-foreground">
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
