import crypto from "crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";

const SESSION_COOKIE = "steward_session";

/**
 * Thirty days from sign-in, and deliberately not sliding.
 *
 * Horizon slides its expiry, but that only moves the row in the database: the
 * cookie's own maxAge is fixed when it is issued, so the browser discards it
 * on day 30 whatever the row says, and the sign-out looks like a bug. The
 * cookie cannot be re-issued from validateSession either, because that runs
 * inside Server Components where cookies().set() is a no-op.
 *
 * A flat lifetime the browser and the database agree on beats a sliding one
 * only half of them honour. Revisit with a middleware if 30 days chafes.
 */
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export async function createSession(userId: string, userAgent?: string, ipAddress?: string) {
  const token = generateSessionToken();
  const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);

  const session = await prisma.session.create({
    data: { userId, token, expiresAt, userAgent, ipAddress },
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    // ALLOW_HTTP is on while Steward is reached over plain HTTP on the LAN.
    // Turn it off once every route in is HTTPS — see docs/ARCHITECTURE.md.
    secure: process.env.NODE_ENV === "production" && process.env.ALLOW_HTTP !== "true",
    sameSite: "strict",
    path: "/",
    maxAge: SESSION_MAX_AGE_MS / 1000,
  });

  return session;
}

/**
 * Request-scoped. The (app) layout and the page beneath it both call this, and
 * without the cache that is two database round-trips and two sliding-expiry
 * writes for one render.
 */
export const validateSession = cache(async function validateSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session) return null;

  if (session.expiresAt < new Date()) {
    await prisma.session.delete({ where: { id: session.id } });
    return null;
  }

  return session;
});

export async function deleteSession(sessionId: string) {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
}

export async function deleteAllUserSessions(userId: string, exceptSessionId?: string) {
  await prisma.session.deleteMany({
    where: {
      userId,
      ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}),
    },
  });
}
