/**
 * Wherever Steward has no answer.
 *
 * **One of the app's two ways of saying "nothing here", and they are different
 * claims.** `EmptyState` is for a collection with nothing in it — a dashed card
 * with the action that would fill it. This is for a check that could not be
 * made: a collector behind, a source unconfigured, a figure Steward will not
 * guess. A quiet paragraph, because it is not an invitation to do anything.
 *
 * Getting them the wrong way round is the failure rule 2 exists to prevent, in
 * both directions — an empty dashed card over a failing collector congratulates
 * you for a list you did not clear, and a quiet grey line over a genuinely
 * empty collection hides the button that would fill it.
 *
 * **Capped at a readable measure.** `main` has no max-width, so a 28-word
 * sentence rendered as a single 1648px line of about 250 characters — three and
 * a half times a readable measure.
 *
 * **Extracted 2026-09-04.** It was defined on `/systems` and hand-copied into
 * Finance twice, People five times and Launcher once: eight copies of one
 * paragraph, which is how the wording and the cap drift apart.
 */
export function NotKnown({ children }: { children: React.ReactNode }) {
  return <p className="max-w-[62ch] text-[14px] leading-[1.6] text-muted-foreground">{children}</p>;
}
