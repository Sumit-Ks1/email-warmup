/**
 * Typed errors that the API layer converts into HTTP responses.
 */

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly retryAfter?: number,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Server misconfiguration (missing env vars, etc.) — surfaced as 503. */
export class ConfigError extends HttpError {
  constructor(message: string) {
    super(503, message);
    this.name = 'ConfigError';
  }
}

export class RateLimitError extends HttpError {
  constructor(retryAfterSeconds: number) {
    super(429, 'Too many requests. Please slow down and try again shortly.', retryAfterSeconds);
    this.name = 'RateLimitError';
  }
}
