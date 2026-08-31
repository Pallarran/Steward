"use client";

import Image from "next/image";
import Link from "next/link";

/**
 * The wordmark, and the way home.
 *
 * **The drawn lockup, not a reconstruction of one.** The rail used to place the
 * square mark beside a hand-set `<span>Steward</span>` — a lockup assembled in
 * CSS while a properly drawn one sat unused in `Art/`. This is that asset.
 *
 * The horizontal lockup rather than Vincent's chosen stacked one, and only
 * because of the space: the rail is 224px wide, so stacked would cost about
 * 197px of height before the first nav item, and the mobile bar is 54px tall
 * and could not take it at all. The stacked lockup is the hero on the login
 * page, where the shape fits and where a first impression is worth the room.
 *
 * `onNavigate` exists so the mobile sheet can close itself on a click rather
 * than through an effect on `pathname` — Chronicle uses the effect, and
 * `react-hooks/set-state-in-effect` has already caught this project once.
 */
export function Mark({
  onNavigate,
  width = 150,
}: {
  onNavigate?: () => void;
  width?: number;
}) {
  // 512 × 180 after trimming, so the height follows from the width.
  const height = Math.round((width * 180) / 512);

  return (
    <Link
      href="/"
      onClick={onNavigate}
      aria-label="Steward, home"
      className="flex flex-col gap-[1px] px-[18px]"
    >
      <Image
        src="/steward-side.png"
        alt="Steward"
        width={width}
        height={height}
        priority
        style={{ width, height }}
      />
      {/* Which house this is. Steward is single-instance by design, but it is
          reached over Tailscale from elsewhere, and the mockup puts the host
          here for exactly that reason. */}
      <span className="font-mono text-[11px] text-faint">whitetower</span>
    </Link>
  );
}
