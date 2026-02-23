/**
 * Database repository for warmup_sessions table.
 * Manages warm-up session state transitions and queries.
 */

import { query } from './pool';
import { WarmupSession } from '../types';
import { logger } from '../config/logger';

export const sessionRepo = {
  /**
   * Get all sessions, optionally filtered by domain account.
   */
  async findAll(domainAccountId?: string): Promise<WarmupSession[]> {
    if (domainAccountId) {
      const result = await query<WarmupSession>(
        'SELECT * FROM warmup_sessions WHERE domain_account_id = $1 ORDER BY created_at DESC',
        [domainAccountId]
      );
      return result.rows;
    }
    const result = await query<WarmupSession>(
      'SELECT * FROM warmup_sessions ORDER BY created_at DESC'
    );
    return result.rows;
  },

  /**
   * Get a session by ID.
   */
  async findById(id: string): Promise<WarmupSession | null> {
    const result = await query<WarmupSession>(
      'SELECT * FROM warmup_sessions WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  },

  /**
   * Get active session for a domain account today.
   */
  async findActiveToday(domainAccountId: string): Promise<WarmupSession | null> {
    const result = await query<WarmupSession>(
      `SELECT * FROM warmup_sessions
       WHERE domain_account_id = $1
         AND session_date = CURRENT_DATE
         AND status NOT IN ('completed', 'failed')
       ORDER BY created_at DESC
       LIMIT 1`,
      [domainAccountId]
    );
    return result.rows[0] || null;
  },

  /**
   * Get completed session for today.
   */
  async findCompletedToday(domainAccountId: string): Promise<WarmupSession | null> {
    const result = await query<WarmupSession>(
      `SELECT * FROM warmup_sessions
       WHERE domain_account_id = $1
         AND session_date = CURRENT_DATE
         AND status = 'completed'
       LIMIT 1`,
      [domainAccountId]
    );
    return result.rows[0] || null;
  },

  /**
   * Create a new warm-up session.
   * If a failed session already exists for today, reset it instead of inserting.
   */
  async create(domainAccountId: string): Promise<WarmupSession> {
    // First check if there's an existing failed session for today we can reset
    const existing = await query<WarmupSession>(
      `SELECT * FROM warmup_sessions
       WHERE domain_account_id = $1
         AND session_date = CURRENT_DATE
       LIMIT 1`,
      [domainAccountId]
    );

    if (existing.rows.length > 0) {
      // Reset the existing session
      const result = await query<WarmupSession>(
        `UPDATE warmup_sessions
         SET status = 'pending',
             current_lead_index = 0,
             last_message_id = NULL,
             error_message = NULL,
             completed_at = NULL,
             started_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING *`,
        [existing.rows[0].id]
      );
      logger.info(`Warmup session reset for domain account: ${domainAccountId} (session ${existing.rows[0].id})`);
      return result.rows[0];
    }

    const result = await query<WarmupSession>(
      `INSERT INTO warmup_sessions (domain_account_id, status, current_lead_index)
       VALUES ($1, 'pending', 0)
       RETURNING *`,
      [domainAccountId]
    );
    logger.info(`Warmup session created for domain account: ${domainAccountId}`);
    return result.rows[0];
  },

  /**
   * Update session status.
   */
  async updateStatus(
    id: string,
    status: WarmupSession['status'],
    extras?: {
      current_lead_index?: number;
      last_message_id?: string;
      error_message?: string | null;
      completed_at?: string | null;
    }
  ): Promise<WarmupSession | null> {
    const updates: string[] = ['status = $1'];
    const values: any[] = [status];
    let paramIndex = 2;

    if (extras?.current_lead_index !== undefined) {
      updates.push(`current_lead_index = $${paramIndex}`);
      values.push(extras.current_lead_index);
      paramIndex++;
    }

    if (extras?.last_message_id !== undefined) {
      updates.push(`last_message_id = $${paramIndex}`);
      values.push(extras.last_message_id);
      paramIndex++;
    }

    if (extras && 'error_message' in extras) {
      updates.push(`error_message = $${paramIndex}`);
      values.push(extras.error_message);
      paramIndex++;
    }

    if (extras && 'completed_at' in extras) {
      updates.push(`completed_at = $${paramIndex}`);
      values.push(extras.completed_at);
      paramIndex++;
    }

    values.push(id);
    const result = await query<WarmupSession>(
      `UPDATE warmup_sessions SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    if (result.rows.length === 0) return null;

    logger.info(`Session ${id} status updated to: ${status}`);
    return result.rows[0];
  },
};
