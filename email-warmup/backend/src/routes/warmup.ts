/**
 * Warm-up Session API Routes.
 * Start, pause, resume, stop warm-up sessions and view status/logs.
 */

import { Router, Request, Response } from 'express';
import { sessionRepo, mailLogRepo, leadAccountRepo } from '../db';
import {
  startWarmup,
  pauseWarmup,
  resumeWarmup,
  stopWarmup,
  getActiveSessionStatus,
} from '../services/warmupOrchestrator';
import { ApiResponse, StartWarmupRequest } from '../types';
import { logger } from '../config/logger';

const router = Router();

/**
 * GET /api/warmup/sessions
 * List all sessions, optionally filtered by domain_account_id.
 */
router.get('/sessions', async (req: Request, res: Response) => {
  try {
    const domainAccountId = req.query.domain_account_id as string | undefined;
    const sessions = await sessionRepo.findAll(domainAccountId);
    res.json({ success: true, data: sessions } as ApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message } as ApiResponse);
  }
});

/**
 * GET /api/warmup/sessions/:id
 * Get session details.
 */
router.get('/sessions/:id', async (req: Request, res: Response) => {
  try {
    const session = await sessionRepo.findById(req.params.id);
    if (!session) {
      return res.status(404).json({ success: false, error: 'Session not found' } as ApiResponse);
    }
    res.json({ success: true, data: session } as ApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message } as ApiResponse);
  }
});

/**
 * GET /api/warmup/sessions/:id/logs
 * Get mail logs for a specific session.
 */
router.get('/sessions/:id/logs', async (req: Request, res: Response) => {
  try {
    const logs = await mailLogRepo.findBySession(req.params.id);
    res.json({ success: true, data: logs } as ApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message } as ApiResponse);
  }
});

/**
 * POST /api/warmup/start
 * Start a new warm-up session for a domain account.
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { domain_account_id }: StartWarmupRequest = req.body;

    if (!domain_account_id) {
      return res.status(400).json({
        success: false,
        error: 'domain_account_id is required',
      } as ApiResponse);
    }

    const session = await startWarmup(domain_account_id);
    res.json({
      success: true,
      data: session,
      message: 'Warm-up session started',
    } as ApiResponse);
  } catch (error: any) {
    logger.error('Failed to start warm-up', { error: error.message });
    res.status(400).json({ success: false, error: error.message } as ApiResponse);
  }
});

/**
 * POST /api/warmup/pause
 * Pause a running warm-up session.
 */
router.post('/pause', async (req: Request, res: Response) => {
  try {
    const { domain_account_id } = req.body;

    if (!domain_account_id) {
      return res.status(400).json({
        success: false,
        error: 'domain_account_id is required',
      } as ApiResponse);
    }

    const session = await pauseWarmup(domain_account_id);
    res.json({
      success: true,
      data: session,
      message: 'Warm-up session paused',
    } as ApiResponse);
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message } as ApiResponse);
  }
});

/**
 * POST /api/warmup/resume
 * Resume a paused warm-up session.
 */
router.post('/resume', async (req: Request, res: Response) => {
  try {
    const { domain_account_id } = req.body;

    if (!domain_account_id) {
      return res.status(400).json({
        success: false,
        error: 'domain_account_id is required',
      } as ApiResponse);
    }

    const session = await resumeWarmup(domain_account_id);
    res.json({
      success: true,
      data: session,
      message: 'Warm-up session resumed',
    } as ApiResponse);
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message } as ApiResponse);
  }
});

/**
 * POST /api/warmup/stop
 * Stop a running warm-up session.
 */
router.post('/stop', async (req: Request, res: Response) => {
  try {
    const { domain_account_id } = req.body;

    if (!domain_account_id) {
      return res.status(400).json({
        success: false,
        error: 'domain_account_id is required',
      } as ApiResponse);
    }

    await stopWarmup(domain_account_id);
    res.json({
      success: true,
      message: 'Warm-up session stopped',
    } as ApiResponse);
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message } as ApiResponse);
  }
});

/**
 * GET /api/warmup/status/:domainAccountId
 * Get real-time status of an active session.
 */
router.get('/status/:domainAccountId', async (req: Request, res: Response) => {
  try {
    const { domainAccountId } = req.params;

    // First check in-memory active sessions
    const activeStatus = getActiveSessionStatus(domainAccountId);

    // Also check DB for persisted session
    const dbSession = await sessionRepo.findActiveToday(domainAccountId);
    const completedSession = await sessionRepo.findCompletedToday(domainAccountId);

    // If session is completed but new leads were added, it's not truly completed
    let completedToday = !!completedSession;
    if (completedSession) {
      const leads = await leadAccountRepo.findAll();
      if (completedSession.current_lead_index < leads.length) {
        completedToday = false; // More leads available — allow restart
      }
    }

    res.json({
      success: true,
      data: {
        active: activeStatus,
        session: dbSession || completedSession,
        completedToday,
      },
    } as ApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message } as ApiResponse);
  }
});

/**
 * GET /api/warmup/logs
 * Get recent mail logs across all sessions.
 */
router.get('/logs', async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string, 10) || 50;
    const logs = await mailLogRepo.findRecent(limit);
    res.json({ success: true, data: logs } as ApiResponse);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message } as ApiResponse);
  }
});

export default router;
