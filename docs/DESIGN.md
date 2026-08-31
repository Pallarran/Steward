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
- **Radius 10px** on cards, `0.625rem` in Tailwind terms, matching Chronicle. Inner pills 9px, icon chips 9-10px.

## Layout

Sidebar 224px fixed. Content fills the rest at 22-24px padding.

**Below `md` the rail is gone.** A slim top bar carries the mark and a hamburger; the same navigation lives in a sheet behind it, reusing `SidebarNav` and `NAV_ITEMS` rather than a second copy. Steward is reached from outside the house over Tailscale — PRD §4 — which means a phone, and 224px is 57% of one. **Undrawn**: no artboard covers a narrow viewport, so this follows the rules here rather than a mockup.

Two-column pages stack at the same breakpoint, and the fixed 340px column becomes full width. The stat row goes two across rather than four.

## The furniture

Four components in `src/components/shell/`, each of which was copied markup first:

- **`PageHeader`** — a 21px title and a 13px subtitle. **The subtitle is a verdict, not a description**: it is the one place a page summarises itself, and repeating the title in prose wastes it. "everything green, nothing to do", "3 renewing soon".
- **`Section`** — *not built.* The heading rows genuinely differ per page — Systems formats its own staleness, People puts dialogs in the slot, Documents puts a link — and a component with six optional props covering five variants is a switch statement wearing a component's clothes. The **shape** is the convention instead: title left, faint mono detail right, and where a section has a source, that detail names it and links to it.
- **`Panel`** — the bordered card. Defined four times before it was one.
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
- **Gate card**: 9px status dot with a soft ring, a 16px/600 verdict, a 13px muted explanation, and an "as of" stamp right-aligned in mono. Green when clear. When not clear it becomes a column: a heading, then one line per problem. **Down and stale are said differently on purpose**: down is red and names the service, stale is amber and blames the collector rather than the system.
- **Queue row**: 34px category icon chip, a 14px/500 title, a 12px muted second line reading **`Source · detail`**, and a dismiss X at the right. The first row carries the `card-hover` background. No numbering, no tiers.

  The second line led with the *category* until 2026-08-30, which made Todoist's Inbox rows read "Inbox · Inbox". The source is the more useful half: the chip already carries the category in colour and icon, while "Todoist", "Home Assistant" or "News" says where the row came from. `subtitle` therefore holds only the detail after the middot.
- **Stale panel**: dims its numbers to about 45 percent opacity, shows an amber "as of" stamp, and states in words when the source last answered. It never shows old data as current.
- **The routine clock lives in the rail**, under the level block: `N sources · as of 14:32`, in faint mono, turning amber and naming the collector when one falls behind. Changed 2026-08-30. Panels no longer carry a stamp while they are fresh — two near-identical timestamps side by side earned their space only on the rare day something broke. Rule 2 is unweakened and sharper for it: the rail carries the always-ticking proof that anything is running, and a timestamp on a panel now means, without exception, that this panel's own data is old.
- **Stat card**, in practice: **three across, not four.** The mockup's fourth is the portfolio, which needs Horizon in v2. A slot advertising something Steward cannot show is worse than three that are all real. A stale card **replaces its number with an em dash** rather than dimming it — a faded but readable stale figure is still a stale figure being offered as the answer — and its caption turns amber and says how old the source is.

- **Systems page**: two bands and a footer, from the `TabSystems` artboard. *Services* fills the width with a **grid** of monitors — `auto-fill` at a 210px minimum rather than the artboard's fixed six across, because the monitor count is Vincent's to change in Uptime Kuma and the page should not care how many there are. Then a row of *Home Assistant* and *WhiteTower*. Then *Collectors*, also a grid. Then the links out.

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

Three jobs, following Horizon: `src/app/icon.png` for the browser tab, `public/steward-icon.png` for the `net.unraid.docker.icon` label on both containers, and the mark in the sidebar header and on the login page. The `side` lockup is the one that fits the 224px rail.

## Two things not to do

- **Do not show accumulated totals as the primary progress signal.** Progress framing licenses disengagement; commitment framing sustains it. The panel shows what is left this week, never what has been banked.
- **Do not add ornament.** An earlier draft with roman numerals, a monogram, a double rule and a seal was rejected as cheap. Character here comes from spacing, scale contrast and disciplined colour.
