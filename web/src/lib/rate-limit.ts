/**
 * Two-layer per-IP rate limiting for a fully public (no-login) app:
 *
 *   1. In-memory fixed window — instant, free, catches bursts, but resets
 *      whenever a new serverless instance spins up.
 *   2. Durable fixed window in Supabase via the `hit_rate_limit` RPC — one
 *      atomic upsert shared by every instance, so limits hold globally.
 *
 * State-changing endpoints are "critical": if the durable limiter cannot be
 * reached, the request is REJECTED (fail closed). Read endpoints fail open so
 * a transient database blip doesn't blank the dashboard.
 */

import { RateLimitError, HttpError } from './errors';
import { getClientIp } from './http';
import { supabaseAdmin } from './supabase';

export interface RateLimitOptions {
  /** Bucket name — keeps limits separate per endpoint group. */
  name: string;
  /** Max requests per window per IP. */
  limit: number;
  windowSeconds: number;
  /** Fail closed when the durable limiter is unavailable. */
  critical?: boolean;
}

/** Preset limits per endpoint group. */
export const LIMITS = {
  read: { name: 'read', limit: 120, windowSeconds: 60 },
  mutate: { name: 'mutate', limit: 30, windowSeconds: 60, critical: true },
  control: { name: 'control', limit: 20, windowSeconds: 60, critical: true },
  testConnection: { name: 'test-conn', limit: 8, windowSeconds: 300, critical: true },
} satisfies Record<string, RateLimitOptions>;

interface Bucket {
  count: number;
  resetAt: number;
}

const memory = new Map<string, Bucket>();
const MEMORY_MAX_KEYS = 5000;

function memoryHit(key: string, limit: number, windowSeconds: number): number {
  const now = Date.now();
  const bucket = memory.get(key);

  if (!bucket || bucket.resetAt <= now) {
    if (memory.size >= MEMORY_MAX_KEYS) {
      // Drop expired buckets; if everything is live we're under attack — reset all.
      for (const [k, b] of memory) {
        if (b.resetAt <= now) memory.delete(k);
      }
      if (memory.size >= MEMORY_MAX_KEYS) memory.clear();
    }
    memory.set(key, { count: 1, resetAt: now + windowSeconds * 1000 });
    return 0;
  }

  bucket.count += 1;
  return bucket.count > limit ? Math.ceil((bucket.resetAt - now) / 1000) : 0;
}

/**
 * Throws RateLimitError (→ HTTP 429 with Retry-After) when the caller's IP
 * exceeds the given limit.
 */
export async function enforceRateLimit(req: Request, opts: RateLimitOptions): Promise<void> {
  const ip = getClientIp(req);
  const key = `${opts.name}:${ip}`;

  const memoryRetryAfter = memoryHit(key, opts.limit, opts.windowSeconds);
  if (memoryRetryAfter > 0) {
    throw new RateLimitError(memoryRetryAfter);
  }

  try {
    const { data, error } = await supabaseAdmin().rpc('hit_rate_limit', {
      p_key: key,
      p_limit: opts.limit,
      p_window_seconds: opts.windowSeconds,
    });
    if (error) throw new Error(error.message);

    const result = data as { allowed: boolean; retry_after: number };
    if (!result.allowed) {
      throw new RateLimitError(result.retry_after || opts.windowSeconds);
    }
  } catch (error) {
    if (error instanceof RateLimitError) throw error;
    if (opts.critical) {
      console.error('[rate-limit] durable limiter unavailable, failing closed:', error);
      throw new HttpError(503, 'Service temporarily unavailable. Please try again shortly.');
    }
    console.warn('[rate-limit] durable limiter unavailable, allowing read:', error);
  }
}
