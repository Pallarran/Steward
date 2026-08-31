import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * A route that does not exist.
 *
 * Chronicle has six routes calling `notFound()` and no page for it, so its
 * users land on Next's default outside the shell with no way back. That is the
 * gap this fills rather than the pattern it follows.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-[24px] text-foreground">
      <div className="flex max-w-[420px] flex-col items-center gap-[6px] text-center">
        <span className="mb-[10px] flex size-[42px] items-center justify-center rounded-full bg-primary/10">
          <Compass size={19} strokeWidth={1.7} className="text-primary" />
        </span>

        <p className="text-[17px] font-semibold">Nothing lives here</p>
        <p className="text-[13px] leading-[1.6] text-muted-foreground">
          That address is not a page in Steward. It may have moved, or it may never have been
          one.
        </p>

        <Button asChild className="mt-[12px]">
          <Link href="/">Back to Home</Link>
        </Button>
      </div>
    </div>
  );
}
