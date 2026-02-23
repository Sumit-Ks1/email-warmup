/**
 * IMAP Email Listening Service using IMAP IDLE.
 *
 * Implements IMAP IDLE (RFC 2177) for real-time email arrival notification
 * instead of polling. This is critical for responsive warm-up flow.
 *
 * The service connects to an IMAP mailbox, opens INBOX, and enters IDLE mode.
 * When a new email arrives, it fetches the message headers and body,
 * then emits the parsed email via a callback.
 */

import Imap from 'imap';
import { simpleParser, ParsedMail } from 'mailparser';
import { logger } from '../config/logger';
import { IncomingEmail } from '../types';

interface ImapConfig {
  host: string;
  port: number;
  secure: boolean;
  password: string;
  email: string;
  filterFromEmail?: string; // Only fetch emails from this sender (IMAP SEARCH FROM filter)
}

type EmailCallback = (email: IncomingEmail) => void;

/**
 * IMAP IDLE listener class.
 * Maintains a persistent connection and listens for new messages.
 */
export class ImapListener {
  private imap: Imap;
  private config: ImapConfig;
  private onEmail: EmailCallback;
  private onTimeout?: () => void;
  private isConnected: boolean = false;
  private isDestroyed: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;
  private waitTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts: number = 0;
  private static readonly MAX_RECONNECT_ATTEMPTS = 5;
  private static readonly WAIT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

  constructor(config: ImapConfig, onEmail: EmailCallback, onTimeout?: () => void) {
    this.config = config;
    this.onEmail = onEmail;
    this.onTimeout = onTimeout;

    this.imap = new Imap({
      user: config.email,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.secure,
      tlsOptions: {
        rejectUnauthorized: false,
        servername: config.host,  // Required for SNI with Gmail
      },
      keepalive: {
        interval: 10000,    // Send NOOP every 10s to keep connection alive
        idleInterval: 300000, // Re-issue IDLE every 5 minutes
        forceNoop: true,
      },
      authTimeout: 30000,
      connTimeout: 30000,
    });

    this.setupEventHandlers();
  }

  /**
   * Wire up IMAP connection event handlers.
   */
  private setupEventHandlers(): void {
    this.imap.on('ready', () => {
      logger.info(`IMAP connected: ${this.config.email}`);
      this.isConnected = true;
      this.reconnectAttempts = 0; // Reset on successful connect
      this.openInbox();
    });

    this.imap.on('error', (err: Error) => {
      logger.error(`IMAP error for ${this.config.email}`, { error: err.message });
      if (!this.isDestroyed) {
        this.safeReconnect();
      }
    });

    this.imap.on('end', () => {
      logger.info(`IMAP connection ended: ${this.config.email}`);
      this.isConnected = false;
      if (!this.isDestroyed) {
        this.safeReconnect();
      }
    });

    this.imap.on('close', (hadError: boolean) => {
      logger.info(`IMAP connection closed: ${this.config.email}`, { hadError });
      this.isConnected = false;
      if (!this.isDestroyed) {
        this.safeReconnect();
      }
    });
  }

  /**
   * Open INBOX and start listening with IMAP IDLE.
   * Also performs an immediate UNSEEN search (race condition fix:
   * emails arriving before IDLE is entered would otherwise be missed).
   */
  private openInbox(): void {
    this.imap.openBox('INBOX', false, (err) => {
      if (err) {
        logger.error(`Failed to open INBOX for ${this.config.email}`, { error: err.message });
        return;
      }

      logger.info(`INBOX opened for ${this.config.email}, entering IDLE mode`);

      // Listen for new mail events (triggered by IDLE)
      this.imap.on('mail', (numNewMsgs: number) => {
        logger.info(`New mail detected for ${this.config.email}`, { count: numNewMsgs });
        this.fetchNewMessages();
      });

      // Immediately check for any UNSEEN messages that arrived
      // before IDLE was entered (race condition fix)
      setTimeout(() => {
        if (!this.isDestroyed && this.isConnected) {
          logger.info(`Initial UNSEEN check for ${this.config.email}`);
          this.fetchNewMessages();
        }
      }, 2000);

      // Set up periodic fallback polling every 30s as a safety net
      // (IMAP IDLE is not 100% reliable, especially with Gmail)
      this.startPolling();

      // Set up wait timeout — if no matching email arrives within 10 minutes,
      // fire the timeout callback so the orchestrator can skip to next lead
      this.startWaitTimeout();
    });
  }

  /**
   * Start periodic polling for UNSEEN messages as a safety net.
   */
  private startPolling(): void {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      if (!this.isDestroyed && this.isConnected) {
        logger.info(`Polling for UNSEEN messages: ${this.config.email}`);
        this.fetchNewMessages();
      }
    }, 30000); // Every 30 seconds
  }

  /**
   * Start a wait timeout. If no email is detected before it fires,
   * invoke the onTimeout callback so the orchestrator can skip.
   */
  private startWaitTimeout(): void {
    this.clearWaitTimeout();
    if (!this.onTimeout) return;

    this.waitTimer = setTimeout(() => {
      if (!this.isDestroyed) {
        logger.warn(`IMAP wait timeout (${ImapListener.WAIT_TIMEOUT_MS / 60000} min) reached for ${this.config.email}`);
        if (this.onTimeout) {
          this.onTimeout();
        }
      }
    }, ImapListener.WAIT_TIMEOUT_MS);
  }

  /**
   * Clear the wait timeout.
   */
  private clearWaitTimeout(): void {
    if (this.waitTimer) {
      clearTimeout(this.waitTimer);
      this.waitTimer = null;
    }
  }

  /**
   * Stop the periodic polling timer.
   */
  private stopPolling(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  }

  /**
   * Fetch and parse new (unseen) messages from INBOX.
   */
  private fetchNewMessages(): void {
    // Build search criteria: UNSEEN + optional FROM filter
    // The FROM filter is applied server-side by IMAP, so only matching
    // emails are returned — avoids fetching/parsing hundreds of unrelated emails
    const searchCriteria: any[] = ['UNSEEN'];
    if (this.config.filterFromEmail) {
      searchCriteria.push(['FROM', this.config.filterFromEmail]);
    }

    this.imap.search(searchCriteria, (err, uids) => {
      if (err) {
        logger.error(`IMAP search failed for ${this.config.email}`, { error: err.message });
        return;
      }

      if (!uids || uids.length === 0) {
        logger.debug(`No unseen messages for ${this.config.email}`);
        return;
      }

      const fetch = this.imap.fetch(uids, {
        bodies: '',         // Fetch entire message (headers + body)
        markSeen: true,     // Mark as read after fetching
        struct: true,
      });

      fetch.on('message', (msg) => {
        let buffer = '';

        msg.on('body', (stream) => {
          stream.on('data', (chunk: Buffer) => {
            buffer += chunk.toString('utf8');
          });
        });

        msg.once('end', () => {
          this.parseMessage(buffer);
        });
      });

      fetch.once('error', (fetchErr: Error) => {
        logger.error(`IMAP fetch error for ${this.config.email}`, { error: fetchErr.message });
      });
    });
  }

  /**
   * Parse a raw email message and emit via callback.
   */
  private async parseMessage(rawEmail: string): Promise<void> {
    try {
      const parsed: ParsedMail = await simpleParser(rawEmail);

      const email: IncomingEmail = {
        messageId: parsed.messageId || '',
        from: parsed.from?.value?.[0]?.address || '',
        to: Array.isArray(parsed.to)
          ? parsed.to[0]?.value?.[0]?.address || ''
          : parsed.to?.value?.[0]?.address || '',
        subject: parsed.subject || '',
        body: parsed.text || '',
        inReplyTo: parsed.inReplyTo || null,
        date: parsed.date || new Date(),
      };

      logger.info('Email parsed successfully', {
        messageId: email.messageId,
        from: email.from,
        subject: email.subject?.substring(0, 50),
      });

      this.onEmail(email);
    } catch (error: any) {
      logger.error('Failed to parse incoming email', { error: error.message });
    }
  }

  /**
   * Attempt reconnection with retry limit.
   */
  private safeReconnect(): void {
    if (this.isDestroyed) return;

    this.reconnectAttempts++;
    if (this.reconnectAttempts > ImapListener.MAX_RECONNECT_ATTEMPTS) {
      logger.error(`IMAP max reconnect attempts (${ImapListener.MAX_RECONNECT_ATTEMPTS}) reached for ${this.config.email}. Giving up.`);
      if (this.onTimeout) {
        this.onTimeout();
      }
      return;
    }

    const delay = 5000 * this.reconnectAttempts; // Exponential backoff: 5s, 10s, 15s...
    logger.info(`Reconnecting IMAP for ${this.config.email} in ${delay}ms (attempt ${this.reconnectAttempts}/${ImapListener.MAX_RECONNECT_ATTEMPTS})`);

    setTimeout(() => {
      if (!this.isDestroyed) {
        this.connect();
      }
    }, delay);
  }

  /**
   * Start the IMAP connection.
   */
  connect(): void {
    if (this.isDestroyed) return;

    logger.info(`Connecting IMAP for ${this.config.email}`);
    try {
      this.imap.connect();
    } catch (error: any) {
      logger.error(`IMAP connect error: ${this.config.email}`, { error: error.message });
      this.safeReconnect();
    }
  }

  /**
   * Gracefully disconnect and destroy the listener.
   */
  disconnect(): void {
    this.isDestroyed = true;
    this.isConnected = false;
    this.stopPolling();
    this.clearWaitTimeout();

    try {
      if (this.imap.state !== 'disconnected') {
        this.imap.end();
      }
    } catch (error: any) {
      logger.warn(`Error during IMAP disconnect for ${this.config.email}`, {
        error: error.message,
      });
    }

    logger.info(`IMAP listener destroyed: ${this.config.email}`);
  }

  /**
   * Check if actively connected.
   */
  get connected(): boolean {
    return this.isConnected;
  }
}

/**
 * Test IMAP connection to verify credentials.
 */
export async function testImapConnection(config: ImapConfig): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.email,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.secure,
      tlsOptions: {
        rejectUnauthorized: false,
        servername: config.host,  // Required for SNI with Gmail
      },
      authTimeout: 30000,
      connTimeout: 30000,
    });

    let settled = false;
    const settle = (fn: () => void) => {
      if (!settled) {
        settled = true;
        fn();
      }
    };

    const timeout = setTimeout(() => {
      settle(() => {
        try { imap.destroy(); } catch {}
        reject(new Error('IMAP connection timeout'));
      });
    }, 35000);

    imap.once('ready', () => {
      clearTimeout(timeout);
      // Open INBOX briefly to fully verify credentials + access
      imap.openBox('INBOX', true, (err) => {
        if (err) {
          settle(() => {
            try { imap.end(); } catch {}
            reject(new Error(`IMAP mailbox error: ${err.message}`));
          });
          return;
        }
        settle(() => {
          imap.end();
          logger.info(`IMAP connection verified: ${config.email}`);
          resolve(true);
        });
      });
    });

    imap.once('error', (err: Error) => {
      clearTimeout(timeout);
      settle(() => {
        logger.error(`IMAP connection failed: ${config.email}`, { error: err.message });
        reject(new Error(`IMAP connection failed: ${err.message}`));
      });
    });

    imap.once('end', () => {
      clearTimeout(timeout);
      // If we haven't settled yet, treat unexpected end as error
      settle(() => {
        reject(new Error('IMAP connection ended unexpectedly'));
      });
    });

    imap.connect();
  });
}
