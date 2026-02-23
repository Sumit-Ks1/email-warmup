/**
 * Database repository for lead_accounts table.
 * Handles CRUD operations with encryption for credentials.
 */

import { query } from './pool';
import { encrypt, decrypt } from '../utils/encryption';
import { LeadAccount, CreateLeadAccountRequest } from '../types';
import { logger } from '../config/logger';

export const leadAccountRepo = {
  /**
   * Get all lead accounts (with passwords decrypted).
   */
  async findAll(): Promise<LeadAccount[]> {
    const result = await query<LeadAccount>(
      'SELECT * FROM lead_accounts ORDER BY created_at ASC'
    );
    return result.rows.map(decryptPasswords);
  },

  /**
   * Get a single lead account by ID.
   */
  async findById(id: string): Promise<LeadAccount | null> {
    const result = await query<LeadAccount>(
      'SELECT * FROM lead_accounts WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return null;
    return decryptPasswords(result.rows[0]);
  },

  /**
   * Find a lead account by email address.
   */
  async findByEmail(email: string): Promise<LeadAccount | null> {
    const result = await query<LeadAccount>(
      'SELECT * FROM lead_accounts WHERE email = $1',
      [email]
    );
    if (result.rows.length === 0) return null;
    return decryptPasswords(result.rows[0]);
  },

  /**
   * Create a new lead account with encrypted credentials.
   */
  async create(data: CreateLeadAccountRequest): Promise<LeadAccount> {
    const result = await query<LeadAccount>(
      `INSERT INTO lead_accounts
        (sender_name, email, smtp_host, smtp_port, smtp_secure, smtp_password,
         imap_host, imap_port, imap_secure, imap_password)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        data.sender_name,
        data.email,
        data.smtp_host,
        data.smtp_port,
        data.smtp_secure,
        encrypt(data.smtp_password),
        data.imap_host,
        data.imap_port,
        data.imap_secure,
        encrypt(data.imap_password),
      ]
    );
    logger.info(`Lead account created: ${data.email}`);
    return decryptPasswords(result.rows[0]);
  },

  /**
   * Update an existing lead account.
   */
  async update(id: string, data: Partial<CreateLeadAccountRequest>): Promise<LeadAccount | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fields: (keyof CreateLeadAccountRequest)[] = [
      'sender_name', 'email', 'smtp_host', 'smtp_port', 'smtp_secure',
      'imap_host', 'imap_port', 'imap_secure',
    ];

    for (const field of fields) {
      if (data[field] !== undefined) {
        updates.push(`${field} = $${paramIndex}`);
        values.push(data[field]);
        paramIndex++;
      }
    }

    if (data.smtp_password) {
      updates.push(`smtp_password = $${paramIndex}`);
      values.push(encrypt(data.smtp_password));
      paramIndex++;
    }
    if (data.imap_password) {
      updates.push(`imap_password = $${paramIndex}`);
      values.push(encrypt(data.imap_password));
      paramIndex++;
    }

    if (updates.length === 0) return existing;

    values.push(id);
    const result = await query<LeadAccount>(
      `UPDATE lead_accounts SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    logger.info(`Lead account updated: ${id}`);
    return decryptPasswords(result.rows[0]);
  },

  /**
   * Delete a lead account.
   */
  async delete(id: string): Promise<boolean> {
    const result = await query('DELETE FROM lead_accounts WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },
};

function decryptPasswords(account: LeadAccount): LeadAccount {
  return {
    ...account,
    smtp_password: decrypt(account.smtp_password),
    imap_password: decrypt(account.imap_password),
  };
}
