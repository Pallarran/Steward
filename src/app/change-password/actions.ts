"use server";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { hashPassword } from "@/lib/auth/password";
import { deleteAllUserSessions, validateSession } from "@/lib/auth/session";
import { log } from "@/lib/log";

export type ChangePasswordState = { error: string | null };

const MIN_LENGTH = 12;

export async function changePassword(
  _prev: ChangePasswordState,
  formData: FormData,
): Promise<ChangePasswordState> {
  const session = await validateSession();
  if (!session) redirect("/login");

  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < MIN_LENGTH) {
    return { error: `Use at least ${MIN_LENGTH} characters.` };
  }
  if (password !== confirm) {
    return { error: "The two passwords do not match." };
  }

  await prisma.user.update({
    where: { id: session.userId },
    data: { passwordHash: await hashPassword(password), mustChangePassword: false },
  });

  // Every other session was created under the old password.
  await deleteAllUserSessions(session.userId, session.id);
  log.info({ userId: session.userId }, "Password changed");

  redirect("/");
}
