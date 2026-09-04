"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * The scroller says how much of itself is hidden.
 *
 * **`listQueue` has no cap** — deliberately, because the card scrolls — so a
 * busy morning is thirty rows in a window that holds fourteen, and until now
 * the only thing saying so was a native scrollbar. That is not an affordance on
 * a screen read at arm's length: the row you need can be the twenty-second and
 * the page looks complete without it.
 *
 * Rendered only while there is genuinely something below. A permanent fade
 * would be the same lie in the other direction — a list that fits, dressed as
 * one that does not.
 *
 * The count is measured rather than passed in: how many rows fit is a question
 * about this window at this size, which the server cannot answer.
 */
export function ScrollHint({ children, total }: { children: React.ReactNode; total: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [hidden, setHidden] = useState(0);

  useEffect(() => {
    const el = box.current;
    if (!el) return;

    // Rows are near enough uniform, so the share of the list that is out of
    // sight is the share of the scroll height that is. Rounded down: claiming
    // one more than there is would be worse than claiming one fewer.
    const measure = () => {
      const below = el.scrollHeight - el.clientHeight - el.scrollTop;
      const perRow = el.scrollHeight / Math.max(1, total);
      setHidden(below < 8 ? 0 : Math.floor(below / perRow));
    };

    measure();

    // A resize observer as well as the scroll listener: the card's height
    // changes with the window and with the right column's content, and neither
    // of those fires a scroll event.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.addEventListener("scroll", measure, { passive: true });

    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", measure);
    };
  }, [total]);

  return (
    <div className="relative flex min-h-0 flex-col">
      <div
        ref={box}
        className="flex flex-col gap-[2px] @min-[720px]:min-h-0 @min-[720px]:overflow-y-auto"
      >
        {children}
      </div>

      {hidden > 0 ? (
        // `pointer-events-none` so it cannot swallow a click on the row it is
        // sitting over, and the fade is the card's own ground rather than a
        // colour of its own.
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center bg-gradient-to-t from-card via-card/80 to-transparent pt-[20px] pb-[2px] font-mono text-[12px] text-faint"
        >
          <ChevronDown size={12} strokeWidth={1.8} className="mr-[4px]" />
          {hidden} more below
        </span>
      ) : null}
    </div>
  );
}
