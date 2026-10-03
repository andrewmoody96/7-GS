// UUIDv7 ids (time-sortable, like the API) and a small seeded RNG for repeatable demos.

/** Mulberry32: tiny deterministic PRNG returning floats in [0, 1). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function cryptoRandom(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return (buf[0] ?? 0) / 4294967296;
}

const hex = (n: number, width: number) => n.toString(16).padStart(width, '0');

/** A UUIDv7 string for `timeMs`, with random bits drawn from `random`. */
export function uuidv7(timeMs: number, random: () => number): string {
  const ms = Math.max(0, Math.floor(timeMs));
  const timeHex = hex(ms, 12).slice(-12);
  const rand = (bits: number) => Math.floor(random() * 2 ** bits);
  const randA = rand(12);
  const variant = 0x8000 | rand(14);
  const tail = hex(rand(24), 6) + hex(rand(24), 6);
  return `${timeHex.slice(0, 8)}-${timeHex.slice(8, 12)}-7${hex(randA, 3)}-${hex(variant, 4)}-${tail}`;
}

/** Ids that sort by creation time; `clock` lets seeds stamp ids with simulated times. */
export function idFactory(random: () => number, clock: () => number = () => Date.now()): () => string {
  return () => uuidv7(clock(), random);
}

/** Random roll from 1 to 100 using the platform CSPRNG (the API rolls server-side). */
export function cryptoRoll(): number {
  const buf = new Uint32Array(1);
  // Rejection sampling keeps the distribution uniform.
  const limit = Math.floor(0xffffffff / 100) * 100;
  for (;;) {
    globalThis.crypto.getRandomValues(buf);
    const v = buf[0] ?? 0;
    if (v < limit) return (v % 100) + 1;
  }
}
