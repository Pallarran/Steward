import { Slot } from "radix-ui";

/**
 * The small square control that sits at the end of a row: dismiss, tick,
 * remove, open.
 *
 * It was written by hand eleven times at **20, 22, 24 and 26px** with 12, 13
 * and 14px glyphs inside, so the dismiss X on a queue row and the remove X on a
 * cheat-sheet entry were different sizes for no reason either row could
 * explain. One size now: 24px on a page, 26px in the rail, because the rail's
 * own controls were consistent with each other and are the exception worth
 * keeping.
 *
 * **The `hover` tone is the point.** A control that turns red on hover is
 * telling you it destroys something before you press it, which is the only
 * warning a row-end X ever gives.
 */
const HOVER = {
  foreground: "hover:text-foreground",
  destructive: "hover:text-destructive",
  teal: "hover:text-teal",
} as const;

export function IconButton({
  hover = "foreground",
  surface = "page",
  asChild = false,
  className = "",
  ...props
}: {
  hover?: keyof typeof HOVER;
  /** `rail` is the sidebar's own 26px control, on the sidebar's hover colour. */
  surface?: "page" | "rail";
  /** For the one that is a `Link` — the rail's way through to Settings. */
  asChild?: boolean;
} & React.ComponentProps<"button">) {
  const Comp = asChild ? Slot.Root : "button";

  const base =
    surface === "rail"
      ? "size-[26px] rounded-[8px] hover:bg-sidebar-accent"
      : "size-[24px] rounded-[6px] hover:bg-secondary";

  return (
    <Comp
      className={`flex shrink-0 items-center justify-center text-faint transition-colors disabled:opacity-40 ${base} ${HOVER[hover]} ${className}`}
      {...props}
    />
  );
}
