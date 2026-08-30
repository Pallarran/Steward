import { redirect } from "next/navigation";
import { validateSession } from "./session";
import type { User, Session } from "@/generated/prisma/client";

export type AuthResult = {
  user: User;
  session: Session & { user: User };
};

/**
 * For pages and layouts. Redirects rather than throwing.
 *
 * Every page lives under the (app) route group, whose layout calls this, so a
 * new page is behind the login by construction rather than by remembering.
 */
export async function requireAuth(): Promise<AuthResult> {
  const session = await validateSession();

  if (!session) redirect("/login");
  if (session.user.mustChangePassword) redirect("/change-password");

  return { user: session.user, session };
}

/** For route handlers — returns null instead of redirecting. */
export async function getApiAuth(): Promise<AuthResult | null> {
  const session = await validateSession();
  if (!session) return null;
  return { user: session.user, session };
}

/** For route handlers — throws a 401 Response instead of redirecting. */
export async function requireApiAuth(): Promise<AuthResult> {
  const result = await getApiAuth();
  if (!result) throw new Response("Unauthorized", { status: 401 });
  return result;
}
