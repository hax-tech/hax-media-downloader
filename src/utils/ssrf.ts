import { URL } from 'url';

const BLOCKED_HOSTS = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '::',
  'metadata.google.internal',
  '169.254.169.254',
  '169.254.170.2',
  '100.100.100.200',
  'instance-data',
]);

const BLOCKED_DOMAINS = [
  '.local',
  '.internal',
  '.localhost',
  '.lan',
  '.home',
  '.corp',
  '.intranet',
  '.arpa',
];

/**
 * Checks whether an IPv4 numeric representation (in dotted-decimal form) falls in private or restricted CIDR ranges.
 */
function isPrivateIpv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 (Loopback)
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (Link-local / Cloud metadata)
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 (CGNAT)
  if (a === 192 && b === 0) return true; // 192.0.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // 198.18.0.0/15
  if (a >= 224) return true; // 224.0.0.0/4 (Multicast / Reserved)
  return false;
}

/**
 * Checks if a hostname represents an IP (including decimal, hex, or octal variations)
 */
function parseIpv4Octets(hostname: string): number[] | null {
  // Pure decimal integer (e.g. 2130706433)
  if (/^\d+$/.test(hostname)) {
    const num = parseInt(hostname, 10);
    if (!isNaN(num) && num >= 0 && num <= 0xffffffff) {
      return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255];
    }
  }

  // Hexadecimal notation (e.g. 0x7f000001)
  if (/^0x[0-9a-fA-F]+$/.test(hostname)) {
    const num = parseInt(hostname, 16);
    if (!isNaN(num) && num >= 0 && num <= 0xffffffff) {
      return [(num >>> 24) & 255, (num >>> 16) & 255, (num >>> 8) & 255, num & 255];
    }
  }

  // Standard or mixed octal/hex dotted IPv4 (e.g. 127.0.0.1, 0177.0.0.1)
  const parts = hostname.split('.');
  if (parts.length === 4) {
    const octets: number[] = [];
    for (const p of parts) {
      let val: number;
      if (p.startsWith('0x') || p.startsWith('0X')) {
        val = parseInt(p, 16);
      } else if (p.length > 1 && p.startsWith('0')) {
        val = parseInt(p, 8);
      } else if (/^\d+$/.test(p)) {
        val = parseInt(p, 10);
      } else {
        return null;
      }
      if (isNaN(val) || val < 0 || val > 255) return null;
      octets.push(val);
    }
    return octets;
  }

  return null;
}

export function isSafeUrl(rawUrl: string): { safe: boolean; reason?: string } {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { safe: false, reason: 'URL is required and must be a string' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { safe: false, reason: 'Invalid URL syntax' };
  }

  // Disallow control characters, null bytes, backticks, pipe, or shell injection sequences
  if (/[\0\r\n`$<>|]/.test(rawUrl) || /;.*(\s|rm|bash|sh|exec)/i.test(rawUrl) || /;$/.test(rawUrl.trim())) {
    return { safe: false, reason: 'URL contains illegal or dangerous characters' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Unsupported protocol: ${parsed.protocol}. Only HTTP and HTTPS are permitted.` };
  }

  // Restrict to standard HTTP(S) ports for media downloaders to prevent internal port scanning
  if (parsed.port && parsed.port !== '80' && parsed.port !== '443') {
    return { safe: false, reason: `Port ${parsed.port} is not permitted. Only standard HTTP/HTTPS ports are allowed.` };
  }

  // Clean brackets for IPv6
  const rawHostname = parsed.hostname.toLowerCase();
  const hostname = rawHostname.replace(/^\[|\]$/g, '');

  if (BLOCKED_HOSTS.has(hostname) || BLOCKED_HOSTS.has(rawHostname)) {
    return { safe: false, reason: 'URL targets restricted or private infrastructure' };
  }

  for (const suffix of BLOCKED_DOMAINS) {
    if (hostname.endsWith(suffix)) {
      return { safe: false, reason: `URL targets restricted local domain: ${suffix}` };
    }
  }

  // IPv6 loopback, link-local, ULA, or mapped IPv4
  if (
    hostname === '::1' ||
    hostname === '::' ||
    hostname.startsWith('fe80:') ||
    hostname.startsWith('fc00:') ||
    hostname.startsWith('fd00:') ||
    hostname.startsWith('::ffff:')
  ) {
    return { safe: false, reason: 'URL resolves to private/restricted IPv6 address range' };
  }

  // Check IPv4 forms
  const octets = parseIpv4Octets(hostname);
  if (octets) {
    if (isPrivateIpv4(octets)) {
      return { safe: false, reason: 'URL resolves to private or restricted network range' };
    }
  }

  return { safe: true };
}

