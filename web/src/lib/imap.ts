/**
 * IMAP access via ImapFlow — short polling connections instead of the legacy
 * IMAP IDLE listeners, because serverless functions cannot hold sockets open
 * between invocations. The engine polls each tick, which also looks more
 * human than instant reactions.
 */

import { ImapFlow } from 'imapflow';
import { simpleParser, type AddressObject } from 'mailparser';
import { HttpError } from './errors';
import type { IncomingEmail } from './types';

export interface ImapTarget {
  host: string;
  port: number;
  secure: boolean;
  email: string;
  password: string; // plaintext (decrypted just-in-time by the caller)
}

function createClient(target: ImapTarget): ImapFlow {
  return new ImapFlow({
    host: target.host,
    port: target.port,
    secure: target.secure,
    auth: { user: target.email, pass: target.password },
    logger: false,
    tls: {
      rejectUnauthorized: false,
      servername: target.host,
    },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });
}

function firstAddress(value: AddressObject | AddressObject[] | undefined): string {
  if (!value) return '';
  const obj = Array.isArray(value) ? value[0] : value;
  return obj?.value?.[0]?.address ?? '';
}

/**
 * Fetch (and mark seen) unread messages from a specific sender. The FROM
 * filter runs server-side in IMAP SEARCH, so unrelated inbox traffic is
 * never downloaded. Marking the warm-up mail as read doubles as an
 * engagement signal for deliverability.
 */
export async function fetchUnseenFrom(
  target: ImapTarget,
  fromEmail: string,
): Promise<IncomingEmail[]> {
  const client = createClient(target);
  const results: IncomingEmail[] = [];

  await client.connect();
  try {
    const lock = await client.getMailboxLock('INBOX');
    try {
      const uids = await client.search({ seen: false, from: fromEmail }, { uid: true });
      const recent = Array.isArray(uids) ? uids.slice(-5) : [];

      for (const uid of recent) {
        const message = await client.fetchOne(String(uid), { source: true }, { uid: true });
        if (!message || !message.source) continue;

        const parsed = await simpleParser(message.source);
        results.push({
          messageId: parsed.messageId ?? '',
          from: firstAddress(parsed.from),
          subject: parsed.subject ?? '',
          body: parsed.text ?? '',
          inReplyTo: parsed.inReplyTo ?? null,
        });

        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => client.close());
  }

  return results;
}

export async function verifyImap(target: ImapTarget): Promise<void> {
  const client = createClient(target);
  try {
    await client.connect();
    const lock = await client.getMailboxLock('INBOX');
    lock.release();
    await client.logout().catch(() => client.close());
  } catch (error) {
    try {
      client.close();
    } catch {
      // already closed
    }
    throw new HttpError(400, `IMAP connection failed: ${(error as Error).message}`);
  }
}
