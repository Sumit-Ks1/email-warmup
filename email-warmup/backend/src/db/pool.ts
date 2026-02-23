/**
 * PostgreSQL connection pool and query utilities.
 * Uses pg Pool for connection management with health checks.
 */

import { Pool, PoolConfig, QueryResult, QueryResultRow } from 'pg';
import { config } from '../config';
import { logger } from '../config/logger';

const poolConfig: PoolConfig = {
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  logger.error('Unexpected PostgreSQL pool error', { error: err.message });
});

pool.on('connect', () => {
  logger.debug('New PostgreSQL connection established');
});

/**
 * Execute a parameterized query against the database.
 */
export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug('Query executed', {
      text: text.substring(0, 100),
      duration: `${duration}ms`,
      rows: result.rowCount,
    });
    return result;
  } catch (error: any) {
    logger.error('Query failed', {
      text: text.substring(0, 100),
      error: error.message,
    });
    throw error;
  }
}

/**
 * Health check for the database connection.
 */
export async function checkDbHealth(): Promise<boolean> {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch {
    return false;
  }
}

/**
 * Close all pool connections (for graceful shutdown).
 */
export async function closePool(): Promise<void> {
  await pool.end();
  logger.info('PostgreSQL pool closed');
}

export { pool };
