/**
 * Lead Accounts API Routes.
 * CRUD operations for lead Gmail accounts with connectivity validation.
 */

import { Router, Request, Response } from 'express';
import { leadAccountRepo } from '../db';
import { testSmtpConnection } from '../services/smtpService';
import { testImapConnection } from '../services/imapService';
import { CreateLeadAccountRequest, ApiResponse, ConnectionTestRequest } from '../types';
import { logger } from '../config/logger';

const router = Router();

/**
 * GET /api/lead-accounts
 * List all lead accounts.
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const accounts = await leadAccountRepo.findAll();
    const safe = accounts.map(({ smtp_password, imap_password, ...rest }) => rest);
    res.json({ success: true, data: safe } as ApiResponse);
  } catch (error: any) {
    logger.error('Failed to list lead accounts', { error: error.message });
    res.status(500).json({ success: false, error: error.message } as ApiResponse);
  }
});

/**
 * GET /api/lead-accounts/:id
 * Get a single lead account.
 */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const account = await leadAccountRepo.findById(req.params.id);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' } as ApiResponse);
    }
    const { smtp_password, imap_password, ...safe } = account;
    res.json({ success: true, data: safe } as ApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message } as ApiResponse);
  }
});

/**
 * POST /api/lead-accounts
 * Create a new lead Gmail account.
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const data: CreateLeadAccountRequest = req.body;

    const required: (keyof CreateLeadAccountRequest)[] = [
      'sender_name', 'email', 'smtp_host', 'smtp_port',
      'smtp_password', 'imap_host', 'imap_port', 'imap_password',
    ];
    for (const field of required) {
      if (!data[field] && data[field] !== false && data[field] !== 0) {
        return res.status(400).json({
          success: false,
          error: `Missing required field: ${field}`,
        } as ApiResponse);
      }
    }

    const account = await leadAccountRepo.create(data);
    const { smtp_password, imap_password, ...safe } = account;
    res.status(201).json({ success: true, data: safe } as ApiResponse);
  } catch (error: any) {
    if (error.message?.includes('duplicate key')) {
      return res.status(409).json({
        success: false,
        error: 'An account with this email already exists',
      } as ApiResponse);
    }
    res.status(500).json({ success: false, error: error.message } as ApiResponse);
  }
});

/**
 * PUT /api/lead-accounts/:id
 * Update a lead account.
 */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const account = await leadAccountRepo.update(req.params.id, req.body);
    if (!account) {
      return res.status(404).json({ success: false, error: 'Account not found' } as ApiResponse);
    }
    const { smtp_password, imap_password, ...safe } = account;
    res.json({ success: true, data: safe } as ApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message } as ApiResponse);
  }
});

/**
 * DELETE /api/lead-accounts/:id
 * Delete a lead account.
 */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const deleted = await leadAccountRepo.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ success: false, error: 'Account not found' } as ApiResponse);
    }
    res.json({ success: true, message: 'Account deleted' } as ApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message } as ApiResponse);
  }
});

/**
 * POST /api/lead-accounts/test-connection
 * Test SMTP or IMAP connectivity before saving.
 */
router.post('/test-connection', async (req: Request, res: Response) => {
  try {
    const data: ConnectionTestRequest = req.body;

    if (data.type === 'smtp') {
      await testSmtpConnection({
        host: data.host,
        port: data.port,
        secure: data.secure,
        password: data.password,
        email: data.email,
        senderName: '',
      });
    } else if (data.type === 'imap') {
      await testImapConnection({
        host: data.host,
        port: data.port,
        secure: data.secure,
        password: data.password,
        email: data.email,
      });
    } else {
      return res.status(400).json({
        success: false,
        error: 'Invalid type. Must be "smtp" or "imap".',
      } as ApiResponse);
    }

    res.json({ success: true, message: `${data.type.toUpperCase()} connection successful` } as ApiResponse);
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message } as ApiResponse);
  }
});

export default router;
