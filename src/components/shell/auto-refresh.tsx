"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps the page true while it is left open all day — PRD §4.
 *
 * `router.refresh()` re-renders the server components against the database and
 * streams the result in, so every panel's contents and its "as of" stamp move
 * together. Client state and scroll position survive it.
 *
 * Not React Query, which `CLAUDE.md` names for polling. That assumes client
 * components calling API routes; these are server components reading Postgres
 * directly, so React Query would mean building an API surface and duplicating
 * state to solve a problem the router already solves.
 *
 * Nothing here is visible. The "as of" stamps already say how fresh a panel is,
 * and a spinner would be the ornament docs/DESIGN.md warns against.
 */
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();

  useEffect(() => {
    // Matches the fastest collector, Uptime Kuma at 60s. Refreshing more often
    // than the data can change is just load.
    const tick = setInterval(() => {
      // A hidden tab is a tab nobody is being misled by, and the visibility
      // handler below catches it up the moment it is looked at again.
      if (document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);

    // The moment that matters most: coming back to a tab left open for hours.
    // Waiting up to a minute to correct it would be the exact failure this
    // exists to prevent.
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds]);

  return null;
}
