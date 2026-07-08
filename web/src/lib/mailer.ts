/**
 * SMTP sending via Nodemailer — one short-lived transport per operation,
 * which is exactly right for serverless.
 */

import nodemailer from 'nodemailer';
import { HttpError } from './errors';

export interface SmtpTarget {
  host: string;
  port: number;
  secure: boolean;
  email: string;
  password: string; // plaintext (decrypted just-in-time by the caller)
  senderName?: string;
}

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  inReplyTo?: string;
  references?: string;
}

function createTransport(target: SmtpTarget) {
  return nodemailer.createTransport({
    host: target.host,
    port: target.port,
    secure: target.port === 465,
    auth: { user: target.email, pass: target.password },
    tls: {
      // Many shared mail hosts present certs that don't match their hostname;
      // matches the legacy platform's behavior so existing providers keep working.
      rejectUnauthorized: false,
      servername: target.host,
    },
    connectionTimeout: 20_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
}

export async function sendMail(
  target: SmtpTarget,
  mail: OutgoingMail,
): Promise<{ messageId: string }> {
  const transport = createTransport(target);
  const domain = target.email.split('@')[1] || 'mail.invalid';
  const messageId = `<${crypto.randomUUID()}@${domain}>`;

  const headers: Record<string, string> = {};
  if (mail.inReplyTo) {
    headers['In-Reply-To'] = mail.inReplyTo;
    headers['References'] = mail.references || mail.inReplyTo;
  }

  try {
    await transport.sendMail({
      from: `"${target.senderName || target.email}" <${target.email}>`,
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      messageId,
      headers,
    });
    return { messageId };
  } finally {
    transport.close();
  }
}

export async function verifySmtp(target: SmtpTarget): Promise<void> {
  const transport = createTransport(target);
  try {
    await transport.verify();
  } catch (error) {
    throw new HttpError(400, `SMTP connection failed: ${(error as Error).message}`);
  } finally {
    transport.close();
  }
}
