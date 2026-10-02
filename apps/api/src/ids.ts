import { createHash, randomBytes } from 'node:crypto';

/**
 * RFC 9562 UUIDv7: 48-bit Unix milliseconds, then random bits. Time-sortable.
 * Uses the real wall clock on purpose: ids record when a row was created, not
 * the simulated game time.
 */
export function uuidv7(): string {
  const bytes = randomBytes(16);
  const ms = Date.now();
  bytes[0] = Math.floor(ms / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(ms / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(ms / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(ms / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(ms / 2 ** 8) & 0xff;
  bytes[5] = ms & 0xff;
  bytes[6] = (bytes[6]! & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8]! & 0x3f) | 0x80; // RFC 4122 variant
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** An opaque secret for magic links and sessions (256 bits, base64url). */
export function randomSecret(): string {
  return randomBytes(32).toString('base64url');
}

/** Only hashes of login tokens and session ids are stored. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
