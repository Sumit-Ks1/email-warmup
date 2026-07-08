/**
 * Factory for the four warm-up control endpoints (start/pause/resume/stop) —
 * same shape: rate-limited POST with a validated domain_account_id.
 */

import { apiHandler, jsonOk, readJson } from './http';
import { enforceRateLimit, LIMITS } from './rate-limit';
import { warmupControlSchema } from './validation';
import type { WarmupSessionRow } from './types';

export function warmupControlHandler(
  action: (domainAccountId: string) => Promise<WarmupSessionRow>,
  message: string,
) {
  return apiHandler(async (req) => {
    await enforceRateLimit(req, LIMITS.control);
    const { domain_account_id } = await readJson(req, warmupControlSchema);
    const session = await action(domain_account_id);
    return jsonOk(session, message);
  });
}
