import { ExternalLink } from "lucide-react";
import { Dot, TINT, type Tone } from "./dot";

/**
 * A dot, a name, and one line underneath.
 *
 * The unit for a grid of many small things: services and collectors on Systems,
 * and the shape Finance's renewal cards were measured from. **Extracted from
 * `systems/page.tsx` on 2026-09-03**, at the threshold the Finance comment named
 * — "if a third one appears, that is the point at which `Tile` earns
 * extraction".
 *
 * It carries its border all the time rather than on hover: a grid of things
 * that only become visible when the pointer is over them is a grid you have to
 * sweep.
 *
 * **Both new props are optional and both default to the old behaviour**, so the
 * Collectors grid — which wants neither a link nor a tinted ground — renders
 * exactly what it did before.
 */
export function Tile({
  tone,
  name,
  caption,
  alarming,
  href,
  tint = false,
  title,
}: {
  tone: Tone;
  name: string;
  caption: string;
  /** Colours the caption. Separate from `tint`: a collector says so without shouting. */
  alarming: boolean;
  /** Makes the whole tile a link out, in a new tab. */
  href?: string | null;
  /** Takes the tone's ground and border, per `TINT`. */
  tint?: boolean;
  /** Hover text for the tile as a whole — where the detail that does not fit goes. */
  title?: string;
}) {
  const toned = tint ? TINT[tone] : undefined;

  const className = [
    "flex min-w-0 flex-col gap-[6px] rounded-[9px] border px-[12px] py-[10px] transition-colors",
    // Untinted and unlinked, this is the original tile exactly: `bg-card` and
    // nothing that responds. A link always gets a hover, because a surface that
    // can be pressed has to say so — on a phone there is no pointer to discover
    // it with, but the affordance still belongs there.
    toned ?? (href ? "bg-card hover:bg-card-hover" : "bg-card"),
  ].join(" ");

  const inner = (
    <>
      <div className="flex items-center gap-[8px]">
        <Dot tone={tone} />
        <span className="min-w-0 grow truncate text-[14px]">{name}</span>
        {href ? (
          <ExternalLink size={12} strokeWidth={1.8} aria-hidden className="shrink-0 opacity-50" />
        ) : null}
      </div>

      {/* `title` on the caption as well as the tile: the caption is the thing
          that truncates, and a tooltip on the parent does not always surface
          for a clipped child. */}
      <span
        className={`truncate font-mono text-[12px] ${
          // A tinted tile has already coloured its text through TINT; saying it
          // again here would fight the inherited colour on a down service.
          toned ? "" : alarming ? "text-warning" : "text-faint"
        }`}
        title={caption}
      >
        {caption}
      </span>
    </>
  );

  if (!href) {
    return (
      <div className={className} title={title}>
        {inner}
      </div>
    );
  }

  return (
    <a href={href} target="_blank" rel="noreferrer" className={className} title={title}>
      {inner}
    </a>
  );
}
