/**
 * SSRF protection for user-supplied mail hosts.
 *
 * The app connects to whatever SMTP/IMAP host a visitor types in — on a
 * public site that is a classic Server-Side Request Forgery vector (probing
 * cloud metadata services, internal networks, etc.). Every host is therefore
 * checked before any connection is made or stored:
 *
 *   - only standard mail ports are allowed
 *   - the host must resolve exclusively to public unicast IP addresses
 */

import { lookup } from 'node:dns/promises';
import net from 'node:net';
import { HttpError } from './errors';

const ALLOWED_MAIL_PORTS = [143, 465, 587, 993, 2525];

export function assertMailPort(port: number): void {
  if (!ALLOWED_MAIL_PORTS.includes(port)) {
    throw new HttpError(
      400,
      `Port ${port} is not an allowed mail port. Allowed: ${ALLOWED_MAIL_PORTS.join(', ')}`,
    );
  }
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true; // unparsable → treat as unsafe
  }
  const [a, b] = parts;
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local / cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 192 && b === 0) return true; // IETF reserved
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const lower = ip.toLowerCase();
  // IPv4-mapped (::ffff:1.2.3.4) → check the embedded IPv4
  const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (lower === '::' || lower === '::1') return true; // unspecified, loopback
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
  if (/^fe[89ab]/.test(lower)) return true; // link-local
  if (lower.startsWith('ff')) return true; // multicast
  return false;
}

function isPrivateAddress(ip: string): boolean {
  const version = net.isIP(ip);
  if (version === 4) return isPrivateIPv4(ip);
  if (version === 6) return isPrivateIPv6(ip);
  return true;
}

/**
 * Rejects hosts that are (or resolve to) private/reserved addresses.
 * Call before storing an account or opening a test connection.
 */
export async function assertPublicMailHost(host: string): Promise<void> {
  const blocked = new HttpError(
    400,
    `Host "${host}" points to a private or reserved network address and is not allowed`,
  );

  // IP literal supplied directly
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw blocked;
    return;
  }

  let addresses: { address: string }[];
  try {
    addresses = await lookup(host, { all: true, verbatim: true });
  } catch {
    throw new HttpError(400, `Could not resolve host "${host}" — check the spelling`);
  }

  if (addresses.length === 0) {
    throw new HttpError(400, `Host "${host}" did not resolve to any address`);
  }
  if (addresses.some((entry) => isPrivateAddress(entry.address))) {
    throw blocked;
  }
}
