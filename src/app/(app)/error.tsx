"use client";

import { useEffect } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A page threw.
 *
 * Inside the route group on purpose, so the rail survives and there is a way
 * out. An error boundary that replaces the whole shell strands you.
 *
 * The reassurance is the point, and Chronicle's is the model: **say the data is
 * safe.** Steward is a dashboard over sources it does not own — a failed render
 * has not lost a task, a calendar or a dismissal, and that is the first thing
 * anyone wants to know.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The server log has the stack; this puts the digest where the browser
    // console can be matched against it.
    console.error("[Steward]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <div className="flex grow flex-col items-center justify-center gap-[6px] rounded-[10px] border border-dashed bg-card/50 px-[24px] py-[64px] text-center">
      <span className="mb-[10px] flex size-[42px] items-center justify-center rounded-full bg-destructive/10">
        <TriangleAlert size={19} strokeWidth={1.7} className="text-destructive" />
      </span>

      <p className="text-[17px] font-semibold">This page did not load</p>
      <p className="max-w-[460px] text-[13px] leading-[1.6] text-muted-foreground">
        Something went wrong rendering it. Nothing has been lost — Steward reads from its own
        database and from Todoist, Home Assistant and the rest, and a failed page does not write
        anything.
      </p>

      {error.digest ? (
        <p className="mt-[4px] font-mono text-[11px] text-faint">reference {error.digest}</p>
      ) : null}

      <div className="mt-[14px] flex items-center gap-[8px]">
        <Button onClick={reset}>Try again</Button>
        <Button variant="secondary" asChild>
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    </div>
  );
}
