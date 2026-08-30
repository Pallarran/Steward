/**
 * Reset the password when you have forgotten it.
 *
 *   docker compose run --rm app npx tsx scripts/reset-password.ts <email> <new-password>
 *
 * Clears every existing session, so anything already signed in is signed out.
 */
import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import argon2 from "argon2";

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const [email, password] = process.argv.slice(2);

  if (!email || !password) {
    throw new Error("Usage: tsx scripts/reset-password.ts <email> <new-password>");
  }
  if (password.length < 12) {
    throw new Error("Use at least 12 characters.");
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
  });

  const user = await prisma.user.update({
    where: { email: email.trim().toLowerCase() },
    data: { passwordHash, mustChangePassword: false },
  });

  const { count } = await prisma.session.deleteMany({ where: { userId: user.id } });
  console.log(`Password reset for ${user.email}. ${count} session(s) cleared.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
