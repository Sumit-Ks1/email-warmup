/**
 * Database repository for mail_logs table.
 * Provides full audit trail of all email operations.
 */

import { query } from './pool';
import { MailLog } from '../types';
import { logger } from '../config/logger';

export const mailLogRepo = {
  /**
   * Get all mail logs for a session.
   */
  async findBySession(sessionId: string): Promise<MailLog[]> {
    const result = await query<MailLog>(
      'SELECT * FROM mail_logs WHERE session_id = $1 ORDER BY created_at ASC',
      [sessionId]
    );
    return result.rows;
  },

  /**
   * Find a mail log entry by message_id.
   */
  async findByMessageId(messageId: string): Promise<MailLog | null> {
    const result = await query<MailLog>(
      'SELECT * FROM mail_logs WHERE message_id = $1 LIMIT 1',
      [messageId]
    );
    return result.rows[0] || null;
  },

  /**
   * Log an email event (sent, received, or replied).
   */
  async create(data: {
    session_id: string;
    from_email: string;
    to_email: string;
    subject: string;
    body?: string;
    message_id?: string;
    in_reply_to?: string;
    direction: 'sent' | 'received' | 'replied';
    lead_index?: number;
  }): Promise<MailLog> {
    const result = await query<MailLog>(
      `INSERT INTO mail_logs
        (session_id, from_email, to_email, subject, body, message_id, in_reply_to, direction, lead_index)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        data.session_id,
        data.from_email,
        data.to_email,
        data.subject,
        data.body || null,
        data.message_id || null,
        data.in_reply_to || null,
        data.direction,
        data.lead_index ?? null,
      ]
    );
    logger.info(`Mail log created: ${data.direction} from ${data.from_email} to ${data.to_email}`);
    return result.rows[0];
  },

  /**
   * Get recent mail logs across all sessions.
   */
  async findRecent(limit: number = 50): Promise<MailLog[]> {
    const result = await query<MailLog>(
      'SELECT * FROM mail_logs ORDER BY created_at DESC LIMIT $1',
      [limit]
    );
    return result.rows;
  },

  /**
   * Count emails sent/received today for rate limiting.
   */
  async countToday(fromEmail: string): Promise<number> {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM mail_logs
       WHERE from_email = $1
         AND direction = 'sent'
         AND created_at >= CURRENT_DATE`,
      [fromEmail]
    );
    return parseInt(result.rows[0].count, 10);
  },
};
