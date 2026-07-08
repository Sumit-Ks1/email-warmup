/**
 * POST /api/test-connection — verify SMTP or IMAP credentials before saving.
 *
 * This endpoint opens outbound connections to user-supplied hosts, so it is
 * the most SSRF-sensitive route in the app: strict validation, private-network
 * blocking, and the tightest rate limit all apply.
 */

import { apiHandler, jsonOk, readJson } from '@/lib/http';
import { verifyImap } from '@/lib/imap';
import { verifySmtp } from '@/lib/mailer';
import { assertMailPort, assertPublicMailHost } from '@/lib/net-guard';
import { enforceRateLimit, LIMITS } from '@/lib/rate-limit';
import { testConnectionSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export const POST = apiHandler(async (req) => {
  await enforceRateLimit(req, LIMITS.testConnection);

  const input = await readJson(req, testConnectionSchema);
  assertMailPort(input.port);
  await assertPublicMailHost(input.host);

  const target = {
    host: input.host,
    port: input.port,
    secure: input.secure,
    email: input.email,
    password: input.password,
  };

  if (input.type === 'smtp') {
    await verifySmtp(target);
  } else {
    await verifyImap(target);
  }

  return jsonOk(null, `${input.type.toUpperCase()} connection successful`);
});
