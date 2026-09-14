import { createHmac, randomBytes } from 'crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const PERIOD = 30;
const DIGITS = 6;

function encodeBase32(bytes: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function decodeBase32(input: string): Buffer {
  const cleaned = input.trim().replace(/=+$/g, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of cleaned) {
    const idx = ALPHABET.indexOf(char);
    if (idx === -1) {
      throw new Error(`Invalid base32 character in secret: "${char}"`);
    }
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Generates a random TOTP secret (20 random bytes, base32-encoded, RFC 4648).
 * Compatible with Google Authenticator / Authy and with secrets previously
 * issued by otplib.
 */
export function generateSecret(): string {
  return encodeBase32(randomBytes(20));
}

/**
 * Computes the current RFC 6238 TOTP code (HMAC-SHA1, 6 digits, 30s period)
 * for the given secret at the given Unix time counter.
 */
export function generate(
  secretOrOptions: string | { secret: string },
  epochSeconds: number = Math.floor(Date.now() / 1000),
): string {
  const secret = typeof secretOrOptions === 'string' ? secretOrOptions : secretOrOptions.secret;
  const key = decodeBase32(secret);
  const counter = Math.floor(epochSeconds / PERIOD);
  const counterBuffer = Buffer.alloc(8);
  counterBuffer.writeBigUInt64BE(BigInt(counter));

  const hmac = createHmac('sha1', key).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) | ((hmac[offset + 1] & 0xff) << 16) | ((hmac[offset + 2] & 0xff) << 8) | (hmac[offset + 3] & 0xff);
  const code = binary % 10 ** DIGITS;
  return code.toString().padStart(DIGITS, '0');
}

/**
 * Validates a TOTP code against the current time window(s). `epochTolerance`
 * is expressed in seconds (as otplib used it) and is rounded up to whole
 * 30-second steps, so 30s checks the current step plus one on each side.
 */
export async function verify(params: {
  token: string;
  secret: string;
  epochTolerance?: number;
  epochMS?: number;
}): Promise<{ valid: boolean }> {
  const { token, secret, epochTolerance = 0, epochMS = Date.now() } = params;
  const steps = Math.max(0, Math.round(epochTolerance / PERIOD));
  const epochSeconds = Math.floor(epochMS / 1000);
  const currentCounter = Math.floor(epochSeconds / PERIOD);

  for (let offset = -steps; offset <= steps; offset += 1) {
    if (generate(secret, (currentCounter + offset) * PERIOD) === token) {
      return { valid: true };
    }
  }
  return { valid: false };
}

/**
 * Builds the otpauth:// provisioning URL used by authenticator apps.
 */
export function generateURI(params: { issuer: string; label: string; secret: string }): string {
  const { issuer, label, secret } = params;
  const path = `otpauth://totp/${encodeURIComponent(label)}?secret=${encodeURIComponent(secret)}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
  return path;
}