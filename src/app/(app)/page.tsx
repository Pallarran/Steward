import { requireAuth } from "@/lib/auth/require-auth";
import { QueueCard } from "@/components/queue/queue-card";

const TZ = "America/Toronto";

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default async function HomePage() {
  await requireAuth();

  // Rendered in Steward's timezone, not the server's locale defaults, so the
  // greeting matches the house rather than UTC.
  const now = new Date();
  const hour = Number(
    new Intl.DateTimeFormat("en-CA", { hour: "numeric", hour12: false, timeZone: TZ }).format(now),
  );
  const date = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TZ,
  }).format(now);

  return (
    <>
      <header className="flex items-center justify-between">
        <div className="flex flex-col gap-[2px]">
          <h1 className="text-[21px] font-bold tracking-[-0.02em]">{greeting(hour)}</h1>
          <p className="text-[13px] text-muted-foreground">{date}</p>
        </div>
        {/* Quick capture lands here in step 8. */}
      </header>

      {/*
        The stat row and the gate card arrive with step 5, the Today card with
        step 6. Nothing stands in for them: a placeholder card is the same lie
        as stale data, with nicer edges. The queue fills the row until the
        Today card takes its 340px.
      */}
      <div className="flex grow gap-[16px]">
        <QueueCard />
      </div>
    </>
  );
}
