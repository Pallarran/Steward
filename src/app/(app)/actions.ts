"use server";

import { redirect } from "next/navigation";
import { deleteSession, validateSession } from "@/lib/auth/session";

export async function logout() {
  const session = await validateSession();
  if (session) await deleteSession(session.id);
  redirect("/login");
}
