/**
 * A bordered card. The most-copied literal in the app until 2026-08-31, when it
 * existed four times over in Systems, Finance, People and Documents.
 *
 * Radius 10px, `bg-card`, quiet border — docs/DESIGN.md.
 */
export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-[10px] border bg-card px-[16px] py-[14px] ${className}`}>
      {children}
    </div>
  );
}
