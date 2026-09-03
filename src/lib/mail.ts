import { readCollectors } from "@/lib/collectors";
import { readFact } from "@/lib/facts";
import { GMAIL_INBOX, gmailConfigured, type InboxFact } from "@/lib/adapters/gmail";

export type MailInbox = {
  /** Read and still in the inbox — the backlog nothing else on Home shows. */
  read: number;
  unread: number;
  /** False when Gmail has never been set up. Not the same as failing. */
  configured: boolean;
  stale: boolean;
};

/**
 * The inbox as two numbers, for Home's band.
 *
 * **Unread is already the queue**, one row per message, so it is not what the
 * band is for. Read-and-still-in-the-inbox is the number nothing shows: mail
 * Vincent has dealt with reading and has not filed, which is the pile that
 * grows quietly and is the actual measure of how the inbox is doing.
 *
 * A fact rather than rows, because it is current state that resolves when he
 * files something, not a list of things that arrived — and counts only, so no
 * subject or sender is stored anywhere by this path.
 */
export async function readMailInbox(now: Date = new Date()): Promise<MailInbox> {
  if (!gmailConfigured()) {
    return { read: 0, unread: 0, configured: false, stale: false };
  }

  const [fact, collectors] = await Promise.all([
    readFact<InboxFact>(GMAIL_INBOX),
    readCollectors(now),
  ]);

  const gmail = collectors.all.find((c) => c.source === "gmail") ?? null;

  return {
    read: fact?.value.read ?? 0,
    unread: fact?.value.unread ?? 0,
    configured: true,
    // A fact that has never been written is not a fact of zero — rule 2 at the
    // point it is easiest to get wrong. Treated as stale so the tile shows an
    // em dash rather than claiming an empty inbox.
    stale: fact === null || (gmail?.stale ?? true),
  };
}
