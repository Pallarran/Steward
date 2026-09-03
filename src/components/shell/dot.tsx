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
