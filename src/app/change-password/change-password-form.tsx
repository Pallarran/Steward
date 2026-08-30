"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changePassword, type ChangePasswordState } from "./actions";

const initialState: ChangePasswordState = { error: null };

export function ChangePasswordForm({ requireCurrent }: { requireCurrent: boolean }) {
  const [state, formAction, pending] = useActionState(changePassword, initialState);

  return (
    <form action={formAction} className="flex w-full flex-col gap-4">
      {requireCurrent ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor="current" className="text-xs text-muted-foreground">
            Current password
          </Label>
          <Input
            id="current"
            name="current"
            type="password"
            autoComplete="current-password"
            required
            autoFocus
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="password" className="text-xs text-muted-foreground">
          New password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus={!requireCurrent}
        />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="confirm" className="text-xs text-muted-foreground">
          Again
        </Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>

      {state.error ? (
        <p role="alert" className="text-[13px] text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="mt-1">
        {pending ? "Saving…" : "Set password"}
      </Button>
    </form>
  );
}
