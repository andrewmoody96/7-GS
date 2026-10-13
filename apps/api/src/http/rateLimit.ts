// A small fixed-window limiter kept in memory: enough for one web dyno. Keys are pruned
// as their windows expire.

export class RateLimiter {
  private readonly hits = new Map<string, { start: number; count: number }>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /** Count a hit for `key`; false when the key is over its limit for this window. */
  take(key: string, now: Date): boolean {
    const t = now.getTime();
    if (this.hits.size > 10_000) this.prune(t);
    const hit = this.hits.get(key);
    if (!hit || t - hit.start >= this.windowMs) {
      this.hits.set(key, { start: t, count: 1 });
      return true;
    }
    hit.count += 1;
    return hit.count <= this.limit;
  }

  private prune(t: number): void {
    for (const [key, hit] of this.hits) if (t - hit.start >= this.windowMs) this.hits.delete(key);
  }
}

/**
 * The client address. Heroku's router appends the connecting address to
 * X-Forwarded-For, so the last entry is the one a client can't forge.
 */
export function clientAddress(header: string | undefined): string {
  const parts = (header ?? '').split(',').map((p) => p.trim()).filter(Boolean);
  return parts.at(-1) ?? 'unknown';
}
