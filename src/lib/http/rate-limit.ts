const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;
const MAX_KEYS = 10_000;
const windows = new Map<string, { startedAt: number; count: number }>();

// This limiter is per-instance; replace it with a shared store before multi-instance deploy.
export function checkRateLimit(
  key: string,
  now = Date.now(),
): { allowed: true } | { allowed: false; retryAfter: number } {
  // Bound memory: spoofed keys (e.g. forged x-forwarded-for) must not grow the map without limit.
  if (windows.size >= MAX_KEYS && !windows.has(key)) {
    for (const [k, w] of windows) if (now - w.startedAt >= WINDOW_MS) windows.delete(k);
    if (windows.size >= MAX_KEYS) windows.clear();
  }
  let window = windows.get(key);
  if (!window || now - window.startedAt >= WINDOW_MS) {
    window = { startedAt: now, count: 0 };
    windows.set(key, window);
  }
  if (window.count >= MAX_REQUESTS)
    return { allowed: false, retryAfter: Math.max(1, Math.ceil((window.startedAt + WINDOW_MS - now) / 1000)) };
  window.count++;
  return { allowed: true };
}

export function rateLimitKeyCount(): number {
  return windows.size;
}

export type RateLimitResult = { allowed: true } | { allowed: false; retryAfter: number };

/**
 * Store contract for a distributed limiter. A shared implementation (planned: PostgreSQL
 * `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` on a hashed key, see ADR-0002) must be atomic
 * across instances. Production quote intake is refused by env validation while only "memory" exists.
 */
export interface RateLimitStore {
  consume(key: string, now: number): Promise<RateLimitResult>;
}

export const memoryRateLimitStore: RateLimitStore = { consume: async (key, now) => checkRateLimit(key, now) };

export function getRateLimitStore(kind: "memory" | "postgres"): RateLimitStore {
  if (kind === "memory") return memoryRateLimitStore;
  // Fail closed: the caller must treat this as "intake unavailable".
  throw new Error("Rate limit store not implemented: postgres");
}

export function resetRateLimit(): void {
  windows.clear();
}
