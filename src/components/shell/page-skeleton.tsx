/**
 * What a page looks like while its query runs.
 *
 * Every page in Steward is a server component reading Postgres, so without a
 * `loading.tsx` a navigation sits on the previous page until the query returns —
 * silently, with no indication that anything is happening.
 *
 * **Deliberately generic, and that is the design.** Horizon's dashboard
 * skeleton draws a five-card strip its dashboard has not had for months, and
 * its own notes admit skeletons rot silently. A skeleton that mirrors a page is
 * a second copy of that page's layout, maintained by nobody; one that says "a
 * header and three blocks" cannot drift, and does the only job a skeleton has —
 * saying *something is coming, and roughly this much of it*.
 */
export function PageSkeleton({ sections = 3 }: { sections?: number }) {
  return (
    <div className="flex flex-col gap-[16px]" aria-busy aria-label="Loading">
      <div className="flex flex-col gap-[6px]">
        <Bar className="h-[24px] w-[180px]" />
        <Bar className="h-[14px] w-[260px]" />
      </div>

      {Array.from({ length: sections }, (_, i) => (
        <div key={i} className="flex flex-col gap-[10px]">
          <Bar className="h-[15px] w-[120px]" />
          <Bar className="h-[92px] w-full rounded-[10px]" />
        </div>
      ))}
    </div>
  );
}

function Bar({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[6px] bg-secondary ${className}`} />;
}
