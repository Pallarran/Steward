import { PageSkeleton } from "@/components/shell/page-skeleton";

/**
 * One file for the whole group.
 *
 * A `loading.tsx` covers its segment *and* every child that does not define its
 * own, so this one boundary serves all eight pages. That is deliberate rather
 * than lazy: eight per-page skeletons would be eight copies of eight layouts,
 * and Horizon proves what happens to those — its dashboard skeleton still draws
 * a five-card strip the dashboard has not had for months.
 *
 * The rail is outside this boundary, so it stays put while the content swaps.
 */
export default function Loading() {
  return <PageSkeleton />;
}
