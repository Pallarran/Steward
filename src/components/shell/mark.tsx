"use client";

import Image from "next/image";
import Link from "next/link";

/**
 * The wordmark, and the way home.
 *
 * `onNavigate` exists so the mobile sheet can close itself on a click rather
 * than through an effect on `pathname` — Chronicle uses the effect, and
 * `react-hooks/set-state-in-effect` has already caught this project once.
 */
export function Mark({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link href="/" onClick={onNavigate} className="flex items-center gap-[11px] px-[18px]">
      {/* The mockup drew a gold chip with a key glyph standing in for the real
          mark. This is the mark. */}
      <Image
        src="/steward-mark.png"
        alt=""
        width={30}
        height={30}
        priority
        className="size-[30px] shrink-0"
      />
      <span className="flex min-w-0 flex-col">
        <span className="text-[17px] font-bold leading-[1.15] tracking-[-0.01em]">Steward</span>
        {/* Which house this is. Steward is single-instance by design, but it is
            reached over Tailscale from elsewhere, and the mockup puts the host
            here for exactly that reason. */}
        <span className="font-mono text-[11px] text-faint">whitetower</span>
      </span>
    </Link>
  );
}
