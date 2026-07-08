/**
 * Server-only Supabase admin client.
 *
 * Uses the SERVICE ROLE key, which must never be exposed to the browser.
 * All database access flows through Next.js route handlers using this client;
 * the client-side code only ever talks to /api/* endpoints.
 *
 * The singleton survives warm serverless invocations, so repeated requests
 * reuse the same connection pool.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { requireEnv } from './env';

let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!client) {
    client = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return client;
}
