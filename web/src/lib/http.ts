/**
 * HTTP helpers shared by all route handlers: JSON responses, safe body
 * parsing, client IP extraction, and a wrapper that converts typed errors
 * into consistent API responses.
 */

import { NextResponse } from 'next/server';
import { ZodError, type ZodType } from 'zod';
import { HttpError } from './errors';

const BASE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};

export function jsonOk<T>(data: T, message?: string, status = 200): NextResponse {
  return NextResponse.json(
    { success: true, data, ...(message ? { message } : {}) },
    { status, headers: BASE_HEADERS },
  );
}

export function jsonError(status: number, error: string, retryAfter?: number): NextResponse {
  const headers: Record<string, string> = { ...BASE_HEADERS };
  if (retryAfter && retryAfter > 0) {
    headers['Retry-After'] = String(Math.ceil(retryAfter));
  }
  return NextResponse.json({ success: false, error }, { status, headers });
}

/**
 * Client IP as reported by the Vercel proxy layer. `x-forwarded-for` is set
 * by the platform (the left-most entry is the real client), so it is a
 * trustworthy rate-limit key in production.
 */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) {
    const first = fwd.split(',')[0]?.trim();
    if (first) return first;
  }
  return req.headers.get('x-real-ip') ?? 'unknown';
}

const MAX_BODY_BYTES = 64 * 1024; // no endpoint needs more than 64 KB

/** Read + validate a JSON body with a hard size cap. */
export async function readJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let raw: string;
  try {
    raw = await req.text();
  } catch {
    throw new HttpError(400, 'Could not read request body');
  }
  if (raw.length > MAX_BODY_BYTES) {
    throw new HttpError(413, 'Request body too large');
  }

  let parsed: unknown;
  try {
    parsed = raw ? JSON.parse(raw) : {};
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON');
  }

  return schema.parse(parsed);
}

type RouteContext = { params: Promise<Record<string, string>> };
type Handler = (req: Request, ctx: RouteContext) => Promise<NextResponse>;

/**
 * Wrap a route handler so every failure becomes a well-formed JSON error and
 * nothing internal (stack traces, SQL, hostnames) leaks to the caller.
 */
export function apiHandler(handler: Handler): Handler {
  return async (req, ctx) => {
    try {
      return await handler(req, ctx);
    } catch (error) {
      if (error instanceof HttpError) {
        return jsonError(error.status, error.message, error.retryAfter);
      }
      if (error instanceof ZodError) {
        const first = error.issues[0];
        const where = first?.path?.length ? `${first.path.join('.')}: ` : '';
        return jsonError(400, `Invalid input — ${where}${first?.message ?? 'validation failed'}`);
      }
      console.error('[api] unhandled error:', error);
      return jsonError(500, 'Internal server error');
    }
  };
}
