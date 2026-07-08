/**
 * /api/cron/tick — the engine's heartbeat.
 *
 * Called once per minute by Supabase pg_cron (see supabase/setup-cron.sql)
 * and once per day by Vercel's built-in cron as a backstop. Protected by a
 * constant-time check of the CRON_SECRET bearer token; without it the
 * endpoint does nothing.
 */

import crypto from 'node:crypto';
import { requireEnv } from '@/lib/env';
import { apiHandler, jsonError, jsonOk } from '@/lib/http';
import { runTick } from '@/lib/warmup-engine';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function isAuthorized(req: Request): boolean {
  const expected = `Bearer ${requireEnv('CRON_SECRET')}`;
  const provided = req.headers.get('authorization') ?? '';
  // Hashing both sides gives equal-length buffers for timingSafeEqual
  const a = crypto.createHash('sha256').update(provided).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

const handler = apiHandler(async (req) => {
  if (!isAuthorized(req)) {
    return jsonError(401, 'Unauthorized');
  }
  const summary = await runTick();
  return jsonOk(summary);
});

export { handler as GET, handler as POST };
