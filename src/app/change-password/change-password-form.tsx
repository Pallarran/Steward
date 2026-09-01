"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/shell/field";
import { changePassword, type ChangePasswordState } from "./actions";

const initialState: ChangePasswordState = { error: null };

export function ChangePasswordForm({ requireCurrent }: { requireCurrent: boolean }) {
  const [state, formAction, pending] = useActionState(changePassword, initialState);

  return (
    <form action={formAction} className="flex w-full flex-col gap-[12px]">
      {requireCurrent ? (
        <Field label="Current password">
          <Input name="current" type="password" autoComplete="current-password" required autoFocus />
        </Field>
      ) : null}

      <Field label="New password">
        <Input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          autoFocus={!requireCurrent}
        />
      </Field>

      <Field label="Again">
        <Input name="confirm" type="password" autoComplete="new-password" required />
      </Field>

      {state.error ? (
        <p role="alert" className="text-[14px] text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="mt-[2px]">
        {pending ? "Saving…" : "Set password"}
      </Button>
    </form>
  );
}
