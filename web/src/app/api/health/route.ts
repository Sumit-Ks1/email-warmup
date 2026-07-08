/**
 * GET /api/health — configuration and database reachability check.
 */

import { missingEnv } from '@/lib/env';
import { apiHandler, jsonOk } from '@/lib/http';
import { enforceRateLimit, LIMITS } from '@/lib/rate-limit';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

export const GET = apiHandler(async (req) => {
  await enforceRateLimit(req, LIMITS.read);

  const missing = missingEnv();
  let database: 'connected' | 'error' | 'not-configured' = 'not-configured';

  if (!missing.includes('SUPABASE_URL') && !missing.includes('SUPABASE_SERVICE_ROLE_KEY')) {
    try {
      const { error } = await supabaseAdmin()
        .from('domain_accounts')
        .select('id', { count: 'exact', head: true });
      database = error ? 'error' : 'connected';
      if (error) console.error('[health] database check failed:', error.message);
    } catch (error) {
      console.error('[health] database check failed:', error);
      database = 'error';
    }
  }

  const healthy = missing.length === 0 && database === 'connected';
  return jsonOk({
    status: healthy ? 'healthy' : 'degraded',
    database,
    missingEnv: missing,
    timestamp: new Date().toISOString(),
  });
});
