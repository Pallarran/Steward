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
import { ConfirmDialog } from "@/components/shared/confirm-dialog";
import { NotKnown } from "@/components/shell/not-known";

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
        title="Cheat-sheet"
        detail={`${things} ${things === 1 ? "thing" : "things"}`}
      >
        {/* There was none. An empty cheat-sheet rendered a heading, nothing,
            and then the add form — the only collection in the app with no
            empty state at all. */}
        {cheatSheet.length === 0 ? (
          <NotKnown>
            Nothing noted yet. This is for the things you look up and never
            remember: the paint colour, the filter size, which socket the
            garden light is on. The form below is the whole of it.
          </NotKnown>
        ) : null}

        {cheatSheet.map((group) => (
          <Panel key={group.area}>
            <div className="flex flex-col gap-[8px]">
              <h3 className="text-[14px] font-semibold text-muted-foreground">{group.area}</h3>
              {/*
                Columns, not a grid, and the difference is the reading
                direction.

                A CSS grid flows row-major, so an alphabetical lookup list laid
                out five across read **across** — label 1, label 2, label 3 —
                which is not how anyone scans a reference table. `columns` flows
                down each column and then across, which is what a list of
                labelled values wants and what a phone book has always done.
              */}
              <div className="columns-[260px] gap-x-[20px]">
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
            <label className="flex items-center gap-[6px] text-[13px] text-muted-foreground">
              <input type="checkbox" name="secret" className="size-[14px]" />
              hide it
            </label>
            <Button type="submit" variant="secondary">
              Add
            </Button>
          </form>

          <p className="mt-[10px] max-w-[62ch] text-[14px] leading-[1.6] text-muted-foreground">
            &ldquo;Hide it&rdquo; keeps a value off screen until you click to show it.{" "}
            <strong className="font-medium text-foreground">It is not encryption</strong> — these
            are stored as plain text, so this is a cheat-sheet and never a password manager.
          </p>
        </Panel>
      </Section>

      {/*
        **The search moved below the cheat-sheet on 2026-09-04.** It led the
        page on the argument that it is "why you open the page" — but Paperless
        is unconnected, so what actually led was a 560px paragraph of env-var
        instructions inside a 1616px card, presented as the page's reason to
        exist. The cheat-sheet is what is on this page today, so it goes first.

        The section is not rendered at all when Paperless is absent. A heading
        over an explanation of how to make the heading true is the shape of a
        todo list, and `CLAUDE.md` is explicit that the UI never names a spec or
        a protocol — the one exception being an env var Vincent must set, which
        is what `SearchForm` still says once it is reached.
      */}
      {connected ? (
        <Section
          title="Find a document"
          detail="Paperless"
          href={process.env.PAPERLESS_BASE_URL}
        >
          <Panel>
            <SearchForm connected />
          </Panel>
        </Section>
      ) : null}
    </>
  );
}

/* ---------------------------------------------------------------- pieces */

function Entry({ entry }: { entry: CheatSheetRow }) {
  return (
    // `break-inside-avoid` so a row cannot be split across two columns, and
    // every row is ruled rather than all-but-the-last. `last:border-b-0` was
    // DOM-last, not per-column: in a five-column layout it un-ruled exactly one
    // entry and left up to four dangling hairlines at the foot of the others.
    <div className="flex break-inside-avoid items-baseline justify-between gap-[10px] border-b py-[6px]">
      <span className="shrink-0 text-[14px] text-muted-foreground">{entry.label}</span>

      <span className="flex min-w-0 items-baseline gap-[8px]">
        {entry.secret ? (
          // A native disclosure: no JavaScript, and the value is genuinely not
          // rendered until it is opened.
          <details className="min-w-0">
            <summary className="cursor-pointer font-mono text-[13px] text-faint">show</summary>
            <span className="block truncate pt-[2px] font-mono text-[14px]">{entry.value}</span>
          </details>
        ) : (
          <span className="truncate font-mono text-[14px]">{entry.value}</span>
        )}

        {/* The action reference and the id separately, never a closure over
            it — a client component's props may be data, nodes or server-action
            references, and `() => deleteEntry(id)` type-checks and then fails
            at request time. */}
        <ConfirmDialog
          title={`Remove ${entry.label}?`}
          description="Nothing else keeps a copy. This is typed by hand rather than collected, so there is no source to fetch it back from."
          action={deleteEntry}
          id={entry.id}
          done={`Removed ${entry.label}.`}
          trigger={
            <IconButton
              type="button"
              aria-label={`Remove ${entry.label}`}
              title="Remove"
              hover="destructive"
            >
              <Trash2 size={14} strokeWidth={1.8} />
            </IconButton>
          }
        />
      </span>
    </div>
  );
}

