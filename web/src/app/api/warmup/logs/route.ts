/**
 * GET /api/warmup/logs?limit=… — recent mail activity across all sessions.
 */

import { apiHandler, jsonOk } from '@/lib/http';
import { enforceRateLimit, LIMITS } from '@/lib/rate-limit';
import { mailLogs } from '@/lib/repos';
import { clampLimit } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export const GET = apiHandler(async (req) => {
  await enforceRateLimit(req, LIMITS.read);
  const limit = clampLimit(new URL(req.url).searchParams.get('limit'), 50, 200);
  return jsonOk(await mailLogs.recent(limit));
});
