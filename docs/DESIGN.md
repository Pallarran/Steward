# Design

The visual language is settled and was approved from mockups. It is taken from Vincent's own apps rather than invented, so Steward reads as a sibling of The Adventurer's Chronicle and Horizon rather than a stranger beside them.

Mockups live in the Cowork artifact "Steward Dashboard". Home is drawn in both themes; the state boards and tab pages on the Structure page are still in a superseded palette and carry layout only.

## The one rule

**Colour only ever carries meaning**: category, status, gain or loss. Everything structural stays quiet. This is what makes it clean like the Calm direction and colourful like the Cockpit direction at the same time, which was the brief.

## Tokens, dark

| token | value | use |
|---|---|---|
| background | `#0a0a0f` | page ground |
| card | `#12121a` | every card |
| card-hover | `#16161f` | the queue's active row |
| sidebar | `#0e0e14` | the rail |
| sidebar-active | `#1a1a25` | selected nav item |
| border | `#1e1e2e` | card borders, dividers |
| border-strong | `#2a2a3a` | inputs |
| foreground | `#e8e6e3` | body text |
| muted-foreground | `#9a9aaa` | second lines, labels |
| faint | `#6a6a7a` | timestamps, dismiss icons |
| primary (gold) | `#c9aa55` | brand, money, warnings |
| arcane-teal | `#4a9a8a` | systems, gain, done |
| deep-blue | `#4a6a9a` | news, gaming |
| arcane-purple | `#7a5a9a` | family, school, couple |
| rose | `#9a5a6a` | people |
| slate | `#6a7a8a` | inbox, documents, launcher |
| destructive | `#9a4a4a` | down, loss |

Icon chip backgrounds are the accent at very low luminance: teal `#16241f`, gold `#1f1c12`, purple `#1e1a2a`, blue `#151d2a`, slate `#1a1f24`.

**Both tables are the whole palette.** `globals.css` carried ten tokens defined in both themes and referenced nowhere — `--accent`, `--accent-foreground`, `--card-foreground`, six `--sidebar-*` and a `--font-heading` that was an inert alias of `--font-sans`. They came in with shadcn and were removed on 2026-08-31. `--sidebar` and `--sidebar-accent` earned their place and stayed. **Do not add a token until something uses it**: an unused one is a decision nobody made, and the next person reads it as a decision somebody did.

## Tokens, light

| token | value |
|---|---|
| background | `#f6f4ef` |
| card | `#ffffff` |
| sidebar | `#eeebe3` |
| sidebar-active | `#e2dcd0` |
| border | `#ddd8cc` |
| foreground | `#1a1a2e` |
| muted-foreground | `#5a5a68` |
| faint | `#8a8698` |
| primary (gold) | `#9a7b2f` |
| teal | `#2e7a6a` |
| blue | `#3a5a8a` |
| purple | `#6a4a8a` |
| rose | `#8a4a5a` |

Icon chip backgrounds: teal `#dceee8`, gold `#f0e8d6`, purple `#e7e0ee`, blue `#dee5f0`, slate `#e6e4e0`.

Two values the mockup never drew, derived in `globals.css` by following the pattern the other accents use — each light accent is a darker, more saturated version of its dark counterpart. **Light destructive `#8a3a3a`** and **light slate `#4a5a6a`**. Flagged rather than slipped in: if either looks wrong beside the drawn ones, it is these two that are guesses.

A third, added 2026-08-31 with the People category: **`--chip-rose`, `#241a1d` dark and `#f0e2e5` light.** Nothing in the mockups used a rose chip, so this follows the stated rule — the accent at very low luminance — rather than a drawing. Same caveat: if the People chip looks off beside the others, this is why.

Warnings and the stale state use gold in both themes — `#c9aa55` dark, `#9a7b2f` light — since DESIGN.md gives gold "brand, money, warnings" and no separate amber exists.

Chronicle's own light ground is `#f5f0e8`, a touch more parchment. Steward sits slightly off it on purpose: parchment reads as thematic in a D&D app and costume-y in a utility one. One value to change if Vincent decides otherwise.

Theme switching is `next-themes` with `class` strategy, matching Chronicle's `.dark` convention.

## Type and shape

- **Inter** for everything, **JetBrains Mono** for times, counts and anything tabular. `font-variant-numeric: tabular-nums` globally.
- Sizes actually used: 21px page title (700), 15-16px card titles (600), 14px body and row titles (500), 13px secondary, 12px labels and second lines, 11px timestamps and chip text.
- **Radius 10px** on cards, `0.625rem` in Tailwind terms, matching Chronicle. Inner pills 9px, icon chips 9-10px. Controls — button, input, select — 10px; a small button and an icon button 8px; a row-end icon button 6px.
- **Every control is 32px tall.** `Button`, `Input` and `Select` agree, which they did not until 2026-08-31: the `<select>` literal was copied six times at 36px and sat 4px proud of every input beside it.

## The spacing scale

**2, 4, 6, 8, 10, 12, 16, 20, 24**, then multiples of 8. Gaps, padding and margin only — a width, a height or an icon size is a measurement, not rhythm, and is free.

There were **19 gap values** before this — every integer from 1 to 16, plus 18, 20 and 24 — and 8 padding values with 15 vertical ones. Nobody chose 11px over 12px; it was typed, copied and inherited. Ninety-seven values moved by one or two pixels to land on the scale, which is invisible in any one place and is the whole grid everywhere.

**Where the scale would flatten a real distinction, the distinction wins.** Snapping `Panel`'s three paddings collapsed `row` and `default` into the same pair; they were re-separated by hand, on the scale. A scale that erases a decision is being applied rather than used.

## Two design systems, one

Everything hand-written spoke px. Everything under `src/components/ui/` — imported from shadcn at step 1 and never audited — spoke Tailwind's rem scale: `h-8`, `text-[0.8rem]`, `rounded-lg`, `p-4`. Every form in the app was a collision between the two, and neither number appeared anywhere the other could see it.

`button`, `input`, `label`, `dialog` and `sheet` are now in px with the same computed values, and the unused sizes and variants are gone — a dead variant on the rem scale is how the two systems grow back. `select` is new, and native on purpose: it opens the platform picker on a phone, which is the device Steward is most often read from.

The one deliberate rem-scale survivor is `Input`'s **16px below `md`**. iOS Safari zooms the page when a focused field's text is under 16px, and Steward is reached from a phone over Tailscale.

## Layout

Sidebar 224px fixed. Content fills the rest at 20-24px padding.

**Below `md` the rail is gone.** A slim top bar carries the mark and a hamburger; the same navigation lives in a sheet behind it, reusing `SidebarNav` and `NAV_ITEMS` rather than a second copy. Steward is reached from outside the house over Tailscale — PRD §4 — which means a phone, and 224px is 57% of one. **Undrawn**: no artboard covers a narrow viewport, so this follows the rules here rather than a mockup.

Two-column pages stack at the same breakpoint, and the fixed 340px column becomes full width. The stat row goes two across rather than four.

## The furniture

Four components in `src/components/shell/`, each of which was copied markup first:

- **`PageHeader`** — a 21px title and a 13px subtitle. **The subtitle is a verdict, not a description**: it is the one place a page summarises itself, and repeating the title in prose wastes it. "everything green, nothing to do", "3 renewing soon".
- **`Section`** and **`SectionHead`** — the heading row: title left, faint mono detail right, an action after it. **This entry used to say "not built"**, arguing that the rows genuinely differ per page and that a component with six optional props covering five variants is a switch statement wearing a component's clothes. That was wrong. The row had been written out by hand **seventeen times**, Systems had built the component locally anyway, and the copies had drifted on gap and on whether the detail links. The variants turned out to be one rule of precedence, not five: a staleness stamp beats the detail, the detail links when it names a source, the action follows it. Use `Section` where the heading sits above a panel and `Panel` + `SectionHead` where it sits inside one.
- **`Panel`** — the bordered card. Defined four times before it was one, and bypassed seventeen times with ten padding pairs before it had a `pad`. **Three paddings, no more**: `row` (16/12) for one record in a list, `default` (16/16) for a small card, `lg` (20/16) for the page's main furniture.
- **`Dot`** — the status dot, and the only place green, amber and red are named. Four private copies of the colour map existed and one had already drifted.
- **`IconButton`** — the square control at the end of a row. Eleven hand-written copies at 20, 22, 24 and 26px with 12, 13 and 14px glyphs. One size: 24px on a page, 26px in the rail.
- **`Field`** — a labelled control in a dialog: 12px muted label, control, optional 11px hint.
- **`EmptyState`** — dashed border, a haloed icon in the accent, title, description, and the action as children so it owns no logic.
- **`PageSkeleton`** — deliberately generic, one shape for every page. Horizon's dashboard skeleton still draws a five-card strip its dashboard has not had for months: a skeleton that mirrors a layout is a second copy of it, and it rots unwatched.

## Three kinds of empty

They mean different things and must not look the same.

- **A collection with nothing in it** — the full `EmptyState`, with the action that would fill it.
- **A field with no value** — an italic muted line *in place*, so the row keeps its slot and the layout does not jump.
- **A filter that matched nothing** — different wording from never-having-any. "Nothing matched *insurance*" and "no documents yet" are different facts, and conflating them makes working data look lost.

And the one that outranks all three: **`tone="warning"` when empty is not earned.** An empty queue with a failing collector is a failed load wearing an achievement's clothes.

## Undo, or confirm — never both

- **Undo** where the row can come back. Dismissing a queue item flips a status, so it raises a neutral toast with an Undo. Ticking reopens in Todoist, which is a second network write, so a failure says so rather than leaving the two disagreeing.
- **Confirm** where it cannot. A person takes their ideas, a topic takes its feeds and their articles. The dialog **names what goes with it** — "are you sure?" is not a question anyone can answer.
- Never both on one action. Horizon does, and its own review calls it pure friction.
- A delete is a neutral `toast()`, never `toast.success`. It is a thing that happened, not an achievement.

**One verb: remove.** Delete and remove were used interchangeably at the same nesting level, so a dialog titled "Remove Sarah?" had a **Delete** button. `ConfirmDialog`'s default `confirmLabel` is `"Remove"` and every title, toast, `aria-label` and trigger follows it.

**The dismissal verb depends on the genre.** A confirm dialog dismisses with the concrete outcome — **"Keep it"**, because that is what not-removing does. A form dialog dismisses with **"Cancel"**, the word everyone already knows. The single exception is the subscription dialog, where "cancel" already means *ending a subscription* on that page, so it says **"Discard"**.

## Forms are invoked, not embedded

Chronicle's pattern, adopted throughout: **the view shows records; a dialog adds and edits them.** An add form sitting permanently in the page is a form you scroll past every day to reach data you actually came for.

- **One component per record type, add and edit both** — `PersonDialog`, `PlanDialog`, `MonthDialog`, `SubscriptionDialog`. Editing is the same component with the record passed in; the title and the submit label are the only difference.
- **The trigger is passed in**, so a section heading's ghost `Add` and a row's faint `Edit` reach the same dialog.
- **`useTransition` calling the action directly, not `useActionState`** — closing on success needs the result in hand, and an effect watching state is how `react-hooks/set-state-in-effect` bit this project once already.
- **The action takes `FormData` and returns `{ error: string | null }`.** One action per record type; the presence of `id` decides create or update.
- Labelled controls use the shared `Field` in `components/shell/field.tsx` — 12px muted label, control, optional 11px hint.

Two forms stay inline and are the exception on purpose: the cheat-sheet's single row of inputs, which is one line and is the point of the panel, and quick capture, which has to be the fastest thing on the page.

## The pages

**Home**, top to bottom: greeting and capture field, a four-card stat row, the gate card, then a row of the queue card (fills) and the Today card (340px fixed).

**Component anatomy**

- **Stat card**: 38px icon chip, then a 20px/700 number with a 12px muted caption under it. Four across, equal width.
- **Gate card**: 9px status dot with a soft ring, a 16px/600 verdict, a 13px muted explanation, and an "as of" stamp right-aligned in mono. Green when clear. When not clear it becomes a column: a heading, then one line per problem. **Three kinds of problem, said three different ways on purpose**: down is red and names the service, stale is amber and blames the collector rather than the system, degraded is amber and names what is left.

  **`degraded` was added 2026-08-31, because green was wrong.** With an array disk disabled and its contents emulated from parity, the gate said "All clear" and the rail's Systems dot stayed green — the house was not broken, so nothing had a word for it running on its spare. The threshold is redundancy, not disk count: a disabled disk with a parity device still spare is amber, and one with none left is red and sits with the services that are down, because the next failure then costs data. `gateVerdict` in `lib/systems.ts` is the rule, on its own and tested.
- **Today card**: four sections and nothing outside them — **Schedule**, **Late**, **Due today**, **Upcoming** — each with an 11px uppercase label and its count. Only *Late* carries a colour, because "these have already slipped" is the one meaning on this card that has one; *Upcoming* is muted, because at full weight it out-shouts the two things actually due.

  It shipped as one date-ordered task list with a "late" tag per row, which buried the most actionable thing inside the least. The four sections then shipped with supper, the bins and tomorrow's school day in a **fifth block underneath** — four sections plus the things that had nowhere to go. **Every fact now sits in the section for the day it happens**: supper and tonight's bins are part of today's schedule, tomorrow's school day is part of what is coming. `Fact` carries the same 50px mono first column as a schedule row's time, which is what lets them sit in the list without a seam.

  **The next bin collection is the one deliberate exception**, appearing under *Upcoming* whenever it falls rather than only when it is tomorrow. It is one line, it is the answer to "when do the bins go out", and there is nowhere else for it; the weekday is named, so a Thursday collection cannot read as tomorrow.

  **No section is capped.** *Upcoming* reaches one day because the collector does — the volume is solved at the source, and a display cap on top of that would solve it twice, the second time by hiding rows. If a section does run long, the convention already exists: `lib/news.ts` caps at `PER_TOPIC` and the heading reads `N unread, M shown`.
- **Queue row**: 34px category icon chip, a 14px/500 title, a 12px muted second line reading **`Source · detail`**, and a dismiss X at the right. The row that is next carries a gold rail at its left edge — not a background, which read as "this one is hovered". No numbering, no tiers.

  **The row body is a button.** Pressing it opens a small card with the title untruncated, the arrival time, and a button that names where "open" goes. The title used to be the link out and nothing said so — the only hint was a hover colour, and on a phone there is no hover. A popover rather than a hover card for the same reason.

  **An alarm reads as an alarm.** A row at `priority: 0` — only a monitor that stopped responding and an array disk Unraid has disabled write it — takes the destructive colour, a warning glyph in place of its category icon, a faintly tinted ground and a red rail that outranks the gold one. Every row looked identical until 2026-08-31, so "disk4 is disabled on WhiteTower" sat in the list wearing the same calm teal as a pending add-on update. A queue is a list of things to do; that was a list of things to do *and one thing that is broken*, and the difference was invisible. `lib/priority.ts` carries the constant and the test for adding a third thing to it.

  The second line led with the *category* until 2026-08-30, which made Todoist's Inbox rows read "Inbox · Inbox". The source is the more useful half: the chip already carries the category in colour and icon, while "Todoist", "Home Assistant" or "News" says where the row came from. `subtitle` therefore holds only the detail after the middot.
- **Stale panel**: dims its numbers to about 45 percent opacity, shows an amber "as of" stamp, and states in words when the source last answered. It never shows old data as current.
- **The routine clock lives in the rail**, under the level block: `N sources · as of 14:32`, in faint mono, turning amber and naming the collector when one falls behind. Changed 2026-08-30. Panels no longer carry a stamp while they are fresh — two near-identical timestamps side by side earned their space only on the rare day something broke. Rule 2 is unweakened and sharper for it: the rail carries the always-ticking proof that anything is running, and a timestamp on a panel now means, without exception, that this panel's own data is old.
- **Stat card**, in practice: **three across, not four.** The mockup's fourth is the portfolio, which needs Horizon in v2. A slot advertising something Steward cannot show is worse than three that are all real. A stale card **replaces its number with an em dash** rather than dimming it — a faded but readable stale figure is still a stale figure being offered as the answer — and its caption turns amber and says how old the source is.

- **A `Fact` row that wants something** carries an amber `Dot` and its value at full weight; every other row reserves the dot's width so the labels stay aligned. Added 2026-09-01, because "42 waiting" and "none" sat in the same position in the same muted grey and the card had to be read rather than glanced at. The tone is `pending` deliberately — already the app's word for waiting, and an update is not a fault: red would cry wolf and green would be a lie. **Not** applied to a standing figure that is lit every day, like the unavailable-entity count: a row always lit teaches you to stop seeing lit rows.
- **Systems page**: two bands and a footer, from the `TabSystems` artboard. *Services* fills the width with a **grid** of monitors — `auto-fill` at a 210px minimum rather than the artboard's fixed six across, because the monitor count is Vincent's to change in Uptime Kuma and the page should not care how many there are. Then a row of *Server*, *WhiteTower* and *Home Assistant* — the artboard drew two, and the machine joined its own array on 2026-09-01. Then *Collectors*, **seven across — one column per collector**. It shares Services' ladder up to `lg` and diverges above it on purpose: Services counts whatever is in Uptime Kuma and must stay responsive to a number set elsewhere, while the collectors are the adapter list, fixed in code, so a grid that fits them exactly leaves no orphan on a second row. An eighth collector means changing the number, which is cheaper than the orphan. Then the links out.

  The artboard gives WhiteTower the growing column because it is full of array figures; here it holds one sentence saying Unraid is not connected, so Home Assistant takes the space and WhiteTower gets the fixed 340px the Today card uses on Home.

  Each card carries **its own source's staleness**, because Uptime Kuma failing must not put the Home Assistant card in doubt. *WhiteTower* and the two Home Assistant checks Steward cannot reach say **not connected**, never "none". *Collectors* lists every source with its last success and its last error in words, which is where an amber rail goes to be explained.

  **Uptime durations are not drawn**, though the mockup drew them. `/metrics` carries no incident history, so a monitor's `changedAt` is only ever when Steward watched it change — on one that has always been up, that is when Steward first looked. Down says how long; up says "up".

- **Sidebar item**: 17px icon in the section's accent colour, 14px label, and an optional right-side badge — a dot for status, a word for a state that needs naming. `stale` is the word rather than an amber dot: a coloured dot says "something", the word says which kind of something, and rule 2 is about being told rather than warned.

- **The gate card carries no collector chips.** One artboard draws a row of them inside it. The clock moved to the rail on 2026-08-30 and this is the same decision: on a normal day the rail is the only timestamp on screen. Recorded so it is not restored later as something that was missed.
- **Level block**: pinned to the bottom of the sidebar. Icon chip, "Level N", "X of Y left", and a bar that **drains** as the week is worked, so it agrees with the words beside it.

## The nav items

Recorded here because they existed only in the `Main.dc.html` artboard and step 2 needs them in writing. In order, top to bottom:

**Home · Systems · Finance · People · News · Documents · Launcher**

**Seven, not the mockup's eight.** Family and People merged on 2026-08-31, at Vincent's call that it was one subject. They were only ever separate because their sources were — one vault markdown, one a manual list — and Steward owns both now. The survivor is **People, in rose**: the page holds parents and friends as well as a spouse and children, and "Family" would misname a third of it. Purple stays where it belongs, on the couple and family chips in the queue, where colour is per-row and still carries meaning.

Each is a 17px icon in its section's accent, a 14px label, and an optional right-side badge. In the mockup Systems and Family carry one; Home is the selected item, on `sidebar-active` with `foreground` at 600 weight while the rest sit at `muted-foreground`. The level block goes below them, pinned to the bottom.

## Branding

The mark lives in `Art/` and is already in the palette: a gold key fused with a white tower over an arcane-teal band and an arcane-purple base — `#c9aa55`, `#4a9a8a`, `#7a5a9a`. The mark alone at 1254², a `side` lockup at 2172×724, two stacked lockups (`below`, `name below high`), and `concept`.

All except `concept` are RGBA with a genuinely transparent ground, so they drop straight onto `#0a0a0f` with no export step. `concept.png` is RGB with no alpha and is a reference image, not an asset.

**The drawn lockups are used, not rebuilt in CSS.** The rail and the login page each assembled their own — the square mark beside or above a hand-set `Steward` — while properly drawn ones sat unused in `Art/`. Which asset goes where is decided by shape:

- **Login** — `steward-lockup.png`, the stacked one Vincent chose. It contains the wordmark, so there is no `<h1>`; that also removes two different golds stacked on each other in light mode.
- **The rail and the mobile bar** — `steward-side.png`. Horizontal, because stacked would cost about 197px of rail height before the first nav item and the mobile bar is 54px tall. `whitetower` sits under it in faint mono: single-instance by design, but reached over Tailscale from elsewhere.
- **Icons** — the square mark, trimmed of its 24% dead margin. `src/app/icon.png` for the tab, `src/app/apple-icon.png` at 180² **opaque on `#0a0a0f`** because iOS composites transparency badly, and `public/icon-{192,512}.png` plus maskable variants inset to the safe circle for the manifest.
- **Unraid** — `public/steward-icon.png`, the untrimmed master, for the `net.unraid.docker.icon` label on both containers. It needs `STEWARD_ICON_URL` set in the server's `.env`.

`scripts/build-icons.ps1` regenerates every one of them from `Art/` with `System.Drawing` — `sharp` is not installed and does not need to be.

**The honest limit:** no resize makes strokes that are 1.6% of the artwork's width survive at 16px. Trimming the dead margin and shipping real small sizes makes the tab icon read as a gold shape on a teal-and-purple base rather than as a key and a tower. Going further means redrawing the mark as a simplified glyph, which is design work on the artwork rather than on its use, and there is no vector source here.

## Two things not to do

- **Do not show accumulated totals as the primary progress signal.** Progress framing licenses disengagement; commitment framing sustains it. The panel shows what is left this week, never what has been banked.
- **Do not add ornament.** An earlier draft with roman numerals, a monogram, a double rule and a seal was rejected as cheap. Character here comes from spacing, scale contrast and disciplined colour.
