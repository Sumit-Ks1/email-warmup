/**
 * Database repository for domain_accounts table.
 * Handles CRUD operations with encryption for credentials.
 */

import { query } from './pool';
import { encrypt, decrypt } from '../utils/encryption';
import { DomainAccount, CreateDomainAccountRequest } from '../types';
import { logger } from '../config/logger';

export const domainAccountRepo = {
  /**
   * Get all domain accounts (with passwords decrypted).
   */
  async findAll(): Promise<DomainAccount[]> {
    const result = await query<DomainAccount>(
      'SELECT * FROM domain_accounts ORDER BY created_at DESC'
    );
    return result.rows.map(decryptPasswords);
  },

  /**
   * Get a single domain account by ID.
   */
  async findById(id: string): Promise<DomainAccount | null> {
    const result = await query<DomainAccount>(
      'SELECT * FROM domain_accounts WHERE id = $1',
      [id]
    );
    if (result.rows.length === 0) return null;
    return decryptPasswords(result.rows[0]);
  },

  /**
   * Create a new domain account with encrypted credentials.
   */
  async create(data: CreateDomainAccountRequest): Promise<DomainAccount> {
    const result = await query<DomainAccount>(
      `INSERT INTO domain_accounts
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
    logger.info(`Domain account created: ${data.email}`);
    return decryptPasswords(result.rows[0]);
  },

  /**
   * Update an existing domain account.
   */
  async update(id: string, data: Partial<CreateDomainAccountRequest>): Promise<DomainAccount | null> {
    const existing = await this.findById(id);
    if (!existing) return null;

    const updates: string[] = [];
    const values: any[] = [];
    let paramIndex = 1;

    const fields: (keyof CreateDomainAccountRequest)[] = [
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

    // Handle password fields separately (need encryption)
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
    const result = await query<DomainAccount>(
      `UPDATE domain_accounts SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      values
    );

    logger.info(`Domain account updated: ${id}`);
    return decryptPasswords(result.rows[0]);
  },

  /**
   * Delete a domain account.
   */
  async delete(id: string): Promise<boolean> {
    const result = await query('DELETE FROM domain_accounts WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  },

  /**
   * Update account status (idle | running | paused).
   */
  async updateStatus(id: string, status: DomainAccount['status']): Promise<void> {
    await query('UPDATE domain_accounts SET status = $1 WHERE id = $2', [status, id]);
    logger.info(`Domain account ${id} status updated to: ${status}`);
  },
};

/**
 * Decrypt password fields on a domain account record.
 */
function decryptPasswords(account: DomainAccount): DomainAccount {
  return {
    ...account,
    smtp_password: decrypt(account.smtp_password),
    imap_password: decrypt(account.imap_password),
  };
}
