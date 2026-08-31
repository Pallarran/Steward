import { CreditCard, ExternalLink, Plus, Trash2 } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/shell/panel";
import { Section } from "@/components/shell/section";
import {
  CADENCE_LABEL,
  readDocuments,
  type CheatSheetRow,
  type SubscriptionView,
} from "@/lib/documents";
import { money } from "@/lib/finance";
import { paperlessConfigured } from "@/lib/paperless";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { EmptyState } from "@/components/shell/empty-state";
import { SubscriptionDialog } from "./subscription-dialog";
import { SearchForm } from "./search-form";
import { addEntry, deleteEntry, deleteSubscription, toggleSubscription } from "./actions";
import { IconButton } from "@/components/shell/icon-button";

export const metadata = { title: "Documents · Steward" };

const TZ = "America/Toronto";

/**
 * Documents — PRD component 7.
 *
 * Three unrelated things the PRD bundles together, ordered by usefulness rather
 * than by the order it lists them: renewals first because they are the only
 * part with news, the search second because it is why you opened the page, the
 * cheat-sheet last because it is reference you scroll to deliberately.
 *
 * **There is no artboard for this page.** The canvas has eight and none of them
 * is Documents, so the layout follows `docs/DESIGN.md` and what Systems and
 * Family established rather than a drawing. Full-width sections rather than
 * two columns, because unlike those two, nothing here is narrow.
 */
export default async function DocumentsPage() {
  await requireAuth();

  const now = new Date();
  const { subscriptions, monthlyCents, cheatSheet } = await readDocuments(now);
  const connected = paperlessConfigured();

  const active = subscriptions.filter((s) => s.active);
  const due = subscriptions.filter((s) => s.soon);

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle={
          active.length === 0
            ? "nothing tracked yet"
            : due.length === 0
              ? `${active.length} ${active.length === 1 ? "subscription" : "subscriptions"}, none renewing soon`
              : `${due.length} renewing soon`
        }
      />

      {/* The detail is the number nobody has: a year of small monthly
          charges is invisible until something adds them up. */}
      <Section
        title="Renewals"
        detail={
          active.length === 0
            ? "nothing active"
            : `${money(monthlyCents)} a month · ${money(monthlyCents * 12)} a year`
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
            description="A forgotten renewal is the only thing on this page that costs money. Add one and Steward puts a line in the queue before it takes it."
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
          <div className="flex flex-col gap-[6px]">
            {subscriptions.map((sub) => (
              <Subscription key={sub.id} sub={sub} />
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Find a document"
        detail={connected ? "Paperless" : "Paperless · not connected"}
        href={connected ? process.env.PAPERLESS_BASE_URL : undefined}
      >
        <Panel>
          <SearchForm connected={connected} />
        </Panel>
      </Section>

      <Section
        title="Cheat-sheet"
        detail={`${cheatSheet.reduce((n, g) => n + g.entries.length, 0)} things`}
      >
        {cheatSheet.map((group) => (
          <Panel key={group.area}>
            <div className="flex flex-col gap-[8px]">
              <h3 className="text-[13px] font-semibold text-muted-foreground">{group.area}</h3>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-[16px]">
                {group.entries.map((entry) => (
                  <Entry key={entry.id} entry={entry} />
                ))}
              </div>
            </div>
          </Panel>
        ))}

        <Panel>
          <form action={addEntry} className="flex flex-wrap items-center gap-[8px]">
            <Input name="area" placeholder="House, Car, Network…" aria-label="Area" className="w-[150px]" />
            <Input name="label" required placeholder="Living room paint" aria-label="Label" className="w-[190px]" />
            <Input name="value" required placeholder="Cloud White OC-130" aria-label="Value" className="min-w-[190px] grow" />
            <label className="flex items-center gap-[6px] text-[12px] text-muted-foreground">
              <input type="checkbox" name="secret" className="size-[14px]" />
              hide it
            </label>
            <Button type="submit" variant="secondary">
              Add
            </Button>
          </form>

          <p className="mt-[10px] text-[13px] leading-[1.6] text-muted-foreground">
            &ldquo;Hide it&rdquo; keeps a value off screen until you click to show it.{" "}
            <strong className="font-medium text-foreground">It is not encryption</strong> — these
            are stored as plain text, so this is a cheat-sheet and never a password manager.
          </p>
        </Panel>
      </Section>
    </>
  );
}

/* ---------------------------------------------------------------- pieces */

function Subscription({ sub }: { sub: SubscriptionView }) {
  const renews = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TZ,
  }).format(sub.next);

  return (
    <Panel pad="row" className={`flex flex-col gap-[8px] ${sub.active ? "" : "opacity-45"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-[10px]">
        <span className="flex min-w-0 items-baseline gap-[10px]">
          <span className="truncate text-[14px] font-medium">{sub.name}</span>
          <span className="shrink-0 font-mono text-[12px] text-muted-foreground">
            {money(sub.amountCents, sub.currency)} {CADENCE_LABEL[sub.cadence]}
          </span>
          {sub.card ? <span className="shrink-0 text-[12px] text-faint">{sub.card}</span> : null}
        </span>

        <span
          className="shrink-0 font-mono text-[12px]"
          style={{ color: sub.soon ? "var(--primary)" : "var(--faint)" }}
        >
          {!sub.active
            ? "cancelled"
            : sub.daysAway <= 0
              ? "renews today"
              : `${renews} · in ${sub.daysAway} ${sub.daysAway === 1 ? "day" : "days"}`}
        </span>
      </div>

      {sub.notes ? <span className="text-[12px] text-faint">{sub.notes}</span> : null}

      <div className="flex items-center gap-[12px]">
        {sub.cancelUrl ? (
          <a
            href={sub.cancelUrl}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-[4px] text-[12px] text-faint transition-colors hover:text-primary"
          >
            Cancel page
            <ExternalLink size={11} strokeWidth={1.8} />
          </a>
        ) : null}

        <form action={toggleSubscription}>
          <input type="hidden" name="id" value={sub.id} />
          <button
            type="submit"
            className="text-[12px] text-faint transition-colors hover:text-foreground"
            title={
              sub.active
                ? "Mark cancelled — the record stays, the queue row goes"
                : "Mark active again"
            }
          >
            {sub.active ? "Mark cancelled" : "Reactivate"}
          </button>
        </form>

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
      </div>
    </Panel>
  );
}

function Entry({ entry }: { entry: CheatSheetRow }) {
  return (
    <div className="flex items-baseline justify-between gap-[10px] border-b py-[6px] last:border-b-0">
      <span className="shrink-0 text-[13px] text-muted-foreground">{entry.label}</span>

      <span className="flex min-w-0 items-baseline gap-[8px]">
        {entry.secret ? (
          // A native disclosure: no JavaScript, and the value is genuinely not
          // rendered until it is opened.
          <details className="min-w-0">
            <summary className="cursor-pointer font-mono text-[12px] text-faint">show</summary>
            <span className="block truncate pt-[2px] font-mono text-[13px]">{entry.value}</span>
          </details>
        ) : (
          <span className="truncate font-mono text-[13px]">{entry.value}</span>
        )}

        <form action={deleteEntry}>
          <input type="hidden" name="id" value={entry.id} />
          <IconButton
            type="submit"
            aria-label={`Remove ${entry.label}`}
            title="Remove"
            hover="destructive"
          >
            <Trash2 size={14} strokeWidth={1.8} />
          </IconButton>
        </form>
      </span>
    </div>
  );
}

