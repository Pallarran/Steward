"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { login, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

/**
 * In the app's px vocabulary, matching the `Field` in `person-dialog.tsx`
 * rather than Tailwind's rem scale.
 *
 * The password is what gets focus, not the email. There is exactly one account
 * and a browser fills the address; focusing the field that is already answered
 * put the keyboard up on a phone and re-centred the whole card against the
 * shrunken viewport, for nothing.
 */
export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <form action={formAction} className="flex w-full flex-col gap-[12px]">
      <label className="flex flex-col gap-[4px]">
        <Label htmlFor="email" className="text-[13px] text-muted-foreground">
          Email
        </Label>
        <Input id="email" name="email" type="email" autoComplete="username" required />
      </label>

      <label className="flex flex-col gap-[4px]">
        <Label htmlFor="password" className="text-[13px] text-muted-foreground">
          Password
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
        />
      </label>

      {state.error ? (
        <p role="alert" className="text-[14px] text-destructive">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" disabled={pending} className="mt-[2px]">
        {pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}
