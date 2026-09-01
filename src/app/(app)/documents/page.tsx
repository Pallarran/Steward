import { Trash2 } from "lucide-react";
import { requireAuth } from "@/lib/auth/require-auth";
import { PageHeader } from "@/components/shell/page-header";
import { Panel } from "@/components/shell/panel";
import { Section } from "@/components/shell/section";
import { readCheatSheet, type CheatSheetRow } from "@/lib/documents";
import { paperlessConfigured } from "@/lib/paperless";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchForm } from "./search-form";
import { addEntry, deleteEntry } from "./actions";
import { IconButton } from "@/components/shell/icon-button";

export const metadata = { title: "Documents · Steward" };

/**
 * Documents — PRD component 7.
 *
 * Two things now, not three. Renewals moved to Finance on 2026-09-01 —
 * a subscription is money leaving an account on a schedule, and it sat here
 * only because of where the PRD once imagined the data coming from. What is
 * left is the search, because it is why you open the page, and the cheat-sheet,
 * because it is reference you scroll to deliberately.
 *
 * **There is no artboard for this page.** The canvas has eight and none of them
 * is Documents, so the layout follows `docs/DESIGN.md` and what Systems and
 * Family established rather than a drawing. Full-width sections rather than
 * two columns, because unlike those two, nothing here is narrow.
 */
export default async function DocumentsPage() {
  await requireAuth();

  const cheatSheet = await readCheatSheet();
  const connected = paperlessConfigured();

  const things = cheatSheet.reduce((n, g) => n + g.entries.length, 0);

  return (
    <>
      <PageHeader
        title="Documents"
        subtitle={
          // Subscriptions used to be counted here, and they were the whole
          // subtitle. What is left on this page is the cheat-sheet and a search
          // box, so the verdict is about those.
          things === 0
            ? connected
              ? "nothing noted yet, Paperless connected"
              : "nothing noted yet"
            : `${things} ${things === 1 ? "thing" : "things"} noted${
                connected ? "" : ", Paperless not connected"
              }`
        }
      />

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
        detail={`${things} ${things === 1 ? "thing" : "things"}`}
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

          <p className="mt-[10px] max-w-[62ch] text-[13px] leading-[1.6] text-muted-foreground">
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

