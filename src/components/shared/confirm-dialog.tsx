"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/**
 * "Are you sure" — for the half of destructive actions that cannot be undone.
 *
 * **Steward's rule, applied here and nowhere else: undo where the row can come
 * back, confirm where it cannot.** A dismissal flips a column, so it gets an
 * undo toast. Deleting a person takes their ideas with it through a cascade,
 * and there is no source to re-fetch them from — so it asks first.
 *
 * Horizon puts a confirm dialog *and* an undo toast on the same delete, which
 * its own review calls pure friction. Nothing in Steward should do both.
 *
 * `description` is where the cascade is named. "Are you sure?" is not a
 * question anyone can answer; "this also removes her six ideas" is.
 */
export function ConfirmDialog({
  title,
  description,
  confirmLabel = "Remove",
  action,
  id,
  done,
  trigger,
}: {
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  /**
   * The server action itself, and the id to hand it — **not** a closure over
   * the id.
   *
   * The first version took `() => deletePerson(person.id)`, which every caller
   * built inline in a server component. Only a server-action *reference* can
   * cross that boundary; an arrow function cannot, and React refuses it at
   * request time with "Functions cannot be passed directly to Client
   * Components". `pnpm build` does not catch it, because these pages are
   * dynamic and are never rendered until someone asks for one.
   */
  action: (id: string) => Promise<{ error: string | null } | void>;
  id: string;
  /** The neutral toast after it worked. A delete is not a success. */
  done?: string;
  trigger: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>

      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
            Keep it
          </Button>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const result = await action(id);
                if (result && result.error) {
                  toast.error(result.error);
                  return;
                }
                setOpen(false);
                if (done) toast(done);
              })
            }
          >
            {pending ? "Removing…" : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
