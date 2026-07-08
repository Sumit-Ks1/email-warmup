/**
 * GET /api/warmup/status/[id] — live status of today's session for a
 * domain account (used by the warm-up page's polling).
 */

import { apiHandler, jsonOk } from '@/lib/http';
import { enforceRateLimit, LIMITS } from '@/lib/rate-limit';
import { uuidSchema } from '@/lib/validation';
import { getWarmupStatus } from '@/lib/warmup-engine';

export const dynamic = 'force-dynamic';

export const GET = apiHandler(async (req, ctx) => {
  await enforceRateLimit(req, LIMITS.read);
  const { id } = await ctx.params;
  const status = await getWarmupStatus(uuidSchema.parse(id));
  return jsonOk(status);
});
