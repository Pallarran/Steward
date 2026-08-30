import crypto from "crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";

const SESSION_COOKIE = "steward_session";
const SESSION_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const REFRESH_THRESHOLD_MS = 24 * 60 * 60 * 1000; // extend when under 29 days left

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

  // Sliding expiry. Horizon measures this from createdAt, which means every
  // request after day one writes to the database; measuring the remaining
  // life instead extends at most once a day.
  const remainingMs = session.expiresAt.getTime() - Date.now();
  if (remainingMs < SESSION_MAX_AGE_MS - REFRESH_THRESHOLD_MS) {
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS) },
    });
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
