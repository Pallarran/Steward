"use server";

import crypto from "crypto";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { checkRateLimit, resetRateLimit } from "@/lib/auth/rate-limit";
import { log } from "@/lib/log";

export type LoginState = { error: string | null };

/**
 * Verified against even when no user matches, so the response time does not
 * reveal whether an address exists. Built once per process, lazily.
 */
let decoyHash: Promise<string> | null = null;
function getDecoyHash(): Promise<string> {
  decoyHash ??= hashPassword(crypto.randomBytes(32).toString("hex"));
  return decoyHash;
}

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Email and password are both required." };
  }

  const ip = await clientIp();
  const { allowed, retryAfterMs } = checkRateLimit(ip);
  if (!allowed) {
    const minutes = Math.ceil(retryAfterMs / 60_000);
    return { error: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.` };
  }

  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await verifyPassword(user?.passwordHash ?? (await getDecoyHash()), password);

  if (!user || !ok) {
    log.warn({ email, ip }, "Failed login");
    return { error: "Wrong email or password." };
  }

  resetRateLimit(ip);

  const h = await headers();
  await createSession(user.id, h.get("user-agent") ?? undefined, ip === "unknown" ? undefined : ip);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  log.info({ userId: user.id, ip }, "Login");

  // Outside the checks above on purpose: redirect() works by throwing.
  redirect(user.mustChangePassword ? "/change-password" : "/");
}
