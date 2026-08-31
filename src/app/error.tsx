"use client";

import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Something outside the app shell threw — the login, the password change, or
 * the layout itself.
 *
 * No rail to fall back on here, so this one stands alone. It offers a retry and
 * nothing else: if the shell is broken, a link into it is not a way out.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[Steward]", error.digest ?? "", error.message);
  }, [error]);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-[24px] text-foreground">
      <div className="flex max-w-[420px] flex-col items-center gap-[6px] text-center">
        <span className="mb-[10px] flex size-[42px] items-center justify-center rounded-full bg-destructive/10">
          <TriangleAlert size={19} strokeWidth={1.7} className="text-destructive" />
        </span>

        <p className="text-[17px] font-semibold">Steward did not start</p>
        <p className="text-[13px] leading-[1.6] text-muted-foreground">
          Something failed before the page could render. Nothing has been lost. If this persists,
          the app container&rsquo;s log will say what it was.
        </p>

        {error.digest ? (
          <p className="mt-[4px] font-mono text-[11px] text-faint">reference {error.digest}</p>
        ) : null}

        <Button onClick={reset} className="mt-[12px]">
          Try again
        </Button>
      </div>
    </div>
  );
}
