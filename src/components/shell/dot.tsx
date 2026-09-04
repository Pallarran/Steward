/**
 * The status dot, and the single source of the colour behind it.
 *
 * The map lived in four files — Systems, the gate card, the rail and the
 * launcher tile — and had already drifted: the launcher's copy keys off Uptime
 * Kuma's own words (`up`, `pending`, `maintenance`) while the other three use
 * Steward's (`ok`, `stale`). Both vocabularies are legitimate, so both are here
 * and `up` is simply another name for `ok`.
 *
 * Green, amber and red are the only colours in the app that carry meaning
 * rather than decoration — docs/DESIGN.md, *The one rule* — which makes four
 * private copies of them exactly the wrong thing to have.
 */
export const TONE = {
  ok: "var(--teal)",
  up: "var(--teal)",
  down: "var(--destructive)",
  stale: "var(--warning)",
  /** Working, on its spare. Amber like stale, and a different claim. */
  degraded: "var(--warning)",
  /**
   * A deadline you can still act on: a renewal in its notice window, someone
   * past the cadence you set. Gold, because it is not a fault — nothing is
   * broken and nothing is unknown, there is simply something to do.
   *
   * Added 2026-09-02 for Home's band. Nothing else passes it yet.
   */
  due: "var(--primary)",
  pending: "var(--warning)",
  maintenance: "var(--blue)",
} as const;

export type Tone = keyof typeof TONE;

/**
 * The same meanings, worn by a whole card rather than a dot.
 *
 * A 50%-alpha border, a 7%-alpha ground, and the text taking the colour instead
 * of staying faint. Linked cards deepen the tint on hover, through `[a&]:`.
 *
 * **Here rather than in the component that first needed it**, for exactly the
 * reason the map above is here: Home's band declared its own copy on
 * 2026-09-02, and by the time the Systems tiles wanted the same treatment that
 * was two components choosing status colours separately. Which is how a service
 * came to have a red dot over a gold caption.
 *
 * Partial on purpose. A tone with no entry is a card that stays `bg-card`, and
 * `ok` deliberately has none: everything being fine is the state a dashboard
 * spends most of its life in, and tinting it green would make the page shout
 * about nothing.
 */
export const TINT: Partial<Record<Tone, string>> = {
  down: "border-destructive/50 bg-destructive/[0.07] text-destructive [a&]:hover:bg-destructive/[0.12]",
  degraded: "border-warning/50 bg-warning/[0.07] text-warning [a&]:hover:bg-warning/[0.12]",
  stale: "border-warning/50 bg-warning/[0.07] text-warning [a&]:hover:bg-warning/[0.12]",
  pending: "border-warning/50 bg-warning/[0.07] text-warning [a&]:hover:bg-warning/[0.12]",
  due: "border-primary/50 bg-primary/[0.07] text-primary [a&]:hover:bg-primary/[0.12]",
};

export function Dot({
  tone,
  size = 7,
  /** The soft halo the gate card's dot carries, at 4px in 16% of the colour. */
  ring = false,
  className = "",
  ...props
}: {
  tone: Tone;
  size?: number;
  ring?: boolean;
} & React.ComponentProps<"span">) {
  const colour = TONE[tone];

  return (
    <span
      className={`shrink-0 rounded-full ${className}`}
      style={{
        width: size,
        height: size,
        background: colour,
        boxShadow: ring ? `0 0 0 4px color-mix(in srgb, ${colour} 16%, transparent)` : undefined,
      }}
      {...props}
    />
  );
}
