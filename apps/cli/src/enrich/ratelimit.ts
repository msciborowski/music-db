/**
 * Minimum-interval rate limiter (spec §2 phase 4 — external APIs are slow and
 * rate-limited). MusicBrainz allows ~1 req/s; AcoustID and Discogs are also
 * throttled. Serializes calls so consecutive requests are spaced apart.
 */
export interface RateLimiterDeps {
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export class RateLimiter {
  private last = 0;
  private queue: Promise<void> = Promise.resolve();
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;

  constructor(private readonly minIntervalMs: number, deps: RateLimiterDeps = {}) {
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = deps.now ?? Date.now;
  }

  /** Resolve once it is safe to make the next request (calls are serialized). */
  async acquire(): Promise<void> {
    const run = this.queue.then(async () => {
      const wait = this.last + this.minIntervalMs - this.now();
      if (wait > 0) await this.sleep(wait);
      this.last = this.now();
    });
    this.queue = run.catch(() => {});
    return run;
  }
}
