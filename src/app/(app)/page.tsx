import { requireAuth } from "@/lib/auth/require-auth";

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
        The stat row, gate card, queue and Today card arrive with their own
        steps. Nothing stands in for them: an empty panel is never rendered as
        a healthy one, and a placeholder card is the same lie with nicer edges.
      */}
      <p className="text-[13px] text-faint">
        The shell is in place. Panels arrive with steps 3 to 5.
      </p>
    </>
  );
}
