"use client";

import { useState, useTransition } from "react";
import { Plus } from "lucide-react";
import { captureThought } from "@/app/(app)/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
 * A thought, into Todoist's Inbox.
 *
 * **Moved into the queue's header on 2026-09-04**, out of Home's page header —
 * the pairing with the greeting was arbitrary, and a captured thought comes
 * back as a row in this very list, so the control now sits on top of its own
 * consequence.
 *
 * **A button and a dialog since the same day, at Vincent's request.** It was a
 * 320px field living permanently in the header, which cost the queue card 16px
 * of head on every render — about a third of a row — to hold a control used a
 * few times a day. A 28px button costs nothing and gives the input room to be a
 * real one.
 *
 * The trade is honest and worth naming: capture was one keystroke away and is
 * now a click, then type, then Enter. Everything after the click is unchanged —
 * no category picker, no confirmation, and Enter submits.
 *
 * Todoist stays where Vincent captures on the go; this is for the thought that
 * arrives while he is already looking at Steward.
 */
export function CaptureBox() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();

  function submit(formData: FormData) {
    setError(null);
    start(async () => {
      // `captureThought` is a `useActionState` shape and takes the previous
      // state first. Called directly rather than through `useActionState`
      // because the dialog has to close on success, and that means reading the
      // result here rather than in an effect watching it.
      const result = await captureThought({ error: null }, formData);

      if (result.error) {
        // The text stays in the box. Losing a thought is the one thing a
        // capture control may never do.
        setError(result.error);
        return;
      }

      setText("");
      setOpen(false);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm">
          <Plus size={13} strokeWidth={2} data-icon="inline-start" />
          Capture
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Capture a thought</DialogTitle>
          <DialogDescription>
            Straight into Todoist&rsquo;s Inbox, and back here as a queue row within five minutes.
            It is not a task until you file it.
          </DialogDescription>
        </DialogHeader>

        <form action={submit} className="flex flex-col gap-[12px]">
          <Input
            name="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            required
            autoFocus
            maxLength={500}
            disabled={pending}
            placeholder="Book the car in for its inspection"
            aria-label="The thought"
            autoComplete="off"
          />

          {error ? (
            <span role="alert" className="text-[14px] text-destructive">
              {error}
            </span>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Discard
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Capturing…" : "Capture"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
