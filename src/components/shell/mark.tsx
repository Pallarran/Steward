"use client";

import Image from "next/image";
import Link from "next/link";

/**
 * The mark, and the way home.
 *
 * **Stacked in the rail from 2026-09-03**, at Vincent's request: the icon
 * larger and centred with the name under it. It had been the horizontal lockup
 * purely for height — a stacked one costs about twice as much of the rail
 * before the first nav item — and that was a guess about what the room was
 * worth, made without him looking at it. It is his rail.
 *
 * **The icon is `steward-icon.png`, the 1254px square**, not the icon baked
 * into `steward-lockup.png` at 384. Both are drawn; only one has resolution to
 * spare at any size a rail or a phone might ask for.
 *
 * So the name is set rather than drawn, which is the one thing here that was
 * better before — `steward-lockup.png` draws it in the same gradient gold as
 * its icon. The two treatments do not mix, so this pairs the *flat* gold icon
 * with flat gold type, and the gradient lockup stays whole as the login hero.
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
  /** Icon size when stacked, lockup width when side. Both have sensible defaults. */
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

  const icon = size ?? 76;

  return (
    <Link
      href="/"
      onClick={onNavigate}
      aria-label="Steward, home"
      className="flex flex-col items-center gap-[8px] px-[16px]"
    >
      <Image
        src="/steward-icon.png"
        // Empty, and the link carries the label instead. The name is set
        // directly underneath, so describing the image as "Steward" would have
        // a screen reader say it twice.
        alt=""
        width={icon}
        height={icon}
        priority
        style={{ width: icon, height: icon }}
      />

      {/*
        18px, which is not on the type scale — deliberately. The scale runs
        22/16/15/14/13/12 for the app's own furniture, and this is a wordmark
        rather than a heading: 16 reads as a card title sitting under a picture,
        and 22 is the page-title size and would outrank every page it sits
        above. Gold because DESIGN.md gives gold "brand, money, warnings", and
        this is the brand.
      */}
      <span className="text-[18px] font-semibold tracking-[0.01em] text-primary">Steward</span>
    </Link>
  );
}
