"use client";

import { useEffect, useState } from "react";
import { Check, Trash2 } from "lucide-react";
import {
  dropInboxItem,
  fileInboxItem,
  todoistTargets,
  unfileInboxItem,
} from "@/app/(app)/actions";
import type { TodoistLists } from "@/lib/adapters/todoist";
import { dueDateFor, OWNER_LABEL, WHEN, WHEN_LABEL, type When } from "@/lib/triage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { DialogClose } from "@/components/ui/dialog";
import { useUndoable } from "./use-undoable";

/**
 * Deciding about a captured thought, without opening Todoist.
 *
 * The Inbox sits at the bottom of the queue because nothing in it has been
 * judged yet, and until now the only way out of a row was the tick — which
 * *completes* the task. That is right for a thought acted on and a lie about
 * one decided against, and it left the actual triage, giving something an owner
 * and a date, as a trip to Todoist.
 *
 * Three verbs now: file it, reword it, drop it. Only filing takes a decision,
 * so only filing gets controls; the other two are buttons.
 */
export function TodoistActions({ id }: { id: string }) {
  const { pending, run } = useUndoable();
  const [lists, setLists] = useState<TodoistLists | null | undefined>(undefined);

  const [project, setProject] = useState("");
  const [who, setWho] = useState(OWNER_LABEL);
  const [when, setWhen] = useState<When>("tomorrow");
  const [picked, setPicked] = useState("");

  useEffect(() => {
    let live = true;
    void todoistTargets().then((answer) => {
      if (!live) return;
      setLists(answer);
      // The first project rather than a remembered one: with a single
      // destination this is the whole choice, and with several the topmost is
      // Todoist's own order.
      if (answer?.projects.length) setProject(answer.projects[0].id);
    });
    return () => {
      live = false;
    };
  }, []);

  // `undefined` is still loading, `null` is a collector that has never run.
  // Rule 2: those are different, and neither is an account with no projects.
  if (lists === undefined) return null;
  if (lists === null || lists.projects.length === 0) {
    return (
      <p className="text-[13px] text-faint">
        Filing needs the project list, which arrives with the next Todoist poll.
      </p>
    );
  }

  const dueDate = when === "pick" ? picked || null : dueDateFor(when, new Date());
  const target = lists.projects.find((p) => p.id === project);

  return (
    <div className="flex flex-col gap-[10px] rounded-[10px] border p-[12px]">
      <span className="text-[12px] text-faint">File it</span>

      <div className="flex flex-wrap items-end gap-[8px]">
        {/* Only when there is a choice to make. One destination rendered as a
            dropdown is a control that cannot do anything, and this account has
            exactly one — but the day there are three, this is ready. */}
        {lists.projects.length > 1 ? (
          <Labelled label="Where">
            <Select
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="w-[130px]"
            >
              {lists.projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Labelled>
        ) : null}

        <Labelled label="Who">
          <Select value={who} onChange={(e) => setWho(e.target.value)} className="w-[120px]">
            {/* Nobody is a real answer: a shared chore belongs to the house
                rather than to a person. It is not the default, because the
                project it is going to has nothing untagged in it. */}
            <option value="">Nobody</option>
            {lists.labels.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </Select>
        </Labelled>

        <Labelled label="When">
          <Select
            value={when}
            onChange={(e) => setWhen(e.target.value as When)}
            className="w-[120px]"
          >
            {WHEN.map((w) => (
              <option key={w} value={w}>
                {WHEN_LABEL[w]}
              </option>
            ))}
          </Select>
        </Labelled>

        {when === "pick" ? (
          <Labelled label="Date">
            <Input
              type="date"
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              className="w-[150px]"
            />
          </Labelled>
        ) : null}

        {/* Closes the dialog: the row behind it is about to leave the queue,
            and a dialog left open over a row that no longer exists describes
            nothing. */}
        <DialogClose asChild>
          <Button
            type="button"
            size="sm"
            className="ml-auto"
            disabled={pending || (when === "pick" && !picked)}
            onClick={() =>
              run(
                () => fileInboxItem(id, { projectId: project, label: who || null, dueDate }),
                `Filed to ${target?.name ?? "Todoist"}.`,
                () => unfileInboxItem(id),
              )
            }
          >
            <Check size={13} strokeWidth={2} data-icon="inline-start" />
            File it
          </Button>
        </DialogClose>
      </div>
    </div>
  );
}

function Labelled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="flex flex-col gap-[3px]">
      <span className="text-[12px] text-faint">{label}</span>
      {children}
    </span>
  );
}

/**
 * Throwing a thought away, for the dialog's footer.
 *
 * **A two-step in place, not `ConfirmDialog`.** The rule is the app's — undo
 * where the row can come back, confirm where it cannot — and Todoist has no API
 * to undelete, so this is the confirm side. But `ConfirmDialog` is itself a
 * `Dialog`, and this already lives inside one; nesting two Radix dialogs is a
 * stacking and focus problem to discover on the server, where the first render
 * of anything here happens. A button that changes its mind costs nothing.
 */
export function DropButton({ id }: { id: string }) {
  const { pending, run } = useUndoable();
  const [armed, setArmed] = useState(false);

  // Disarms itself. An armed destructive button left sitting there is a trap
  // for the next press, and there is no other click on this dialog that would
  // clear it.
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  if (!armed) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={() => setArmed(true)}>
        <Trash2 size={13} strokeWidth={1.8} data-icon="inline-start" />
        Drop it
      </Button>
    );
  }

  return (
    <DialogClose asChild>
      <Button
        type="button"
        variant="destructive"
        size="sm"
        disabled={pending}
        onClick={() => run(() => dropInboxItem(id), "Deleted in Todoist.")}
      >
        <Trash2 size={13} strokeWidth={1.8} data-icon="inline-start" />
        Really drop it?
      </Button>
    </DialogClose>
  );
}
