/**
 * GET /api/warmup/sessions?domain_account_id=… — session history for a
 * domain account (most recent first).
 */

import { HttpError } from '@/lib/errors';
import { apiHandler, jsonOk } from '@/lib/http';
import { enforceRateLimit, LIMITS } from '@/lib/rate-limit';
import { sessions } from '@/lib/repos';
import { uuidSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export const GET = apiHandler(async (req) => {
  await enforceRateLimit(req, LIMITS.read);

  const raw = new URL(req.url).searchParams.get('domain_account_id');
  if (!raw) throw new HttpError(400, 'domain_account_id query parameter is required');

  const list = await sessions.listForDomain(uuidSchema.parse(raw));
  return jsonOk(list);
});
