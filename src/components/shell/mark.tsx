"use client";

import Image from "next/image";
import Link from "next/link";

/**
 * The mark, and the way home.
 *
 * **The drawn stacked lockup, at Vincent's instruction on 2026-09-03**, from
 * `Art/Steward Logo name below high.png` — 1024 × 1536, on real transparency,
 * with the name drawn in the same gradient gold as the mark.
 *
 * It replaces a reconstruction I had built the day before: the flat 1254px
 * square icon with "Steward" set in Inter underneath it. That was the right
 * call about *resolution* and the wrong one about the lockup — the drawn word
 * carries the gradient and the set one cannot, and pairing a flat icon with
 * flat type to stay internally consistent solved a problem that only existed
 * because the drawing had been taken apart. The higher-resolution art has both.
 *
 * **Two places deliberately do not use it**, and neither is an oversight:
 *
 * - The 54px mobile bar keeps the horizontal lockup. This is a 2:3 portrait
 *   shape; at 54px tall it would be 36px wide and the word would be four
 *   pixels high.
 * - The favicon and app icons keep the square mark. A lockup with a name under
 *   it is illegible at 32px, and cropping the word off would be inventing an
 *   asset rather than using one.
 *
 * `onNavigate` exists so the mobile sheet can close itself on a click rather
 * than through an effect on `pathname` — Chronicle uses the effect, and
 * `react-hooks/set-state-in-effect` has already caught this project once.
 */
export function Mark({
  onNavigate,
  /**
   * `side` is for the 54px mobile bar, which is a horizontal strip and cannot
   * take a stacked mark at any size worth having.
   */
  layout = "stacked",
  size,
}: {
  onNavigate?: () => void;
  layout?: "stacked" | "side";
  /** Width in pixels. The height follows from the art's own aspect. */
  size?: number;
}) {
  if (layout === "side") {
    const width = size ?? 120;
    // 512 × 180 after trimming, so the height follows from the width.
    const height = Math.round((width * 180) / 512);

    return (
      <Link href="/" onClick={onNavigate} aria-label="Steward, home" className="px-[16px]">
        <Image
          src="/steward-side.png"
          alt="Steward"
          width={width}
          height={height}
          priority
          style={{ width, height }}
        />
      </Link>
    );
  }

  // 1024 × 1536, so height is exactly one and a half times the width.
  const width = size ?? 88;
  const height = Math.round(width * 1.5);

  return (
    <Link
      href="/"
      onClick={onNavigate}
      aria-label="Steward, home"
      className="flex flex-col items-center px-[16px]"
    >
      <Image
        src="/steward-lockup.png"
        // Empty, because the link above already carries the accessible name.
        // The word is drawn inside the image, so describing it as "Steward"
        // would have a screen reader say it twice.
        alt=""
        width={width}
        height={height}
        priority
        style={{ width, height }}
      />
    </Link>
  );
}
