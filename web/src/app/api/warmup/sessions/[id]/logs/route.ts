/**
 * GET /api/warmup/sessions/[id]/logs — full mail trail of one session.
 */

import { apiHandler, jsonOk } from '@/lib/http';
import { enforceRateLimit, LIMITS } from '@/lib/rate-limit';
import { mailLogs } from '@/lib/repos';
import { uuidSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export const GET = apiHandler(async (req, ctx) => {
  await enforceRateLimit(req, LIMITS.read);
  const { id } = await ctx.params;
  const logs = await mailLogs.bySession(uuidSchema.parse(id));
  return jsonOk(logs);
});
