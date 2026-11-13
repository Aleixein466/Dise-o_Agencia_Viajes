const WINDOW_MS = 10 * 60 * 1000;
const MAX_REQUESTS = 5;
const windows = new Map<string, { startedAt: number; count: number }>();

// This limiter is per-instance; replace it with a shared store before multi-instance deploy.
export function checkRateLimit(key: string, now = Date.now()): { allowed: true } | { allowed: false; retryAfter: number } {
  let window = windows.get(key);
  if (!window || now - window.startedAt >= WINDOW_MS) {
    window = { startedAt: now, count: 0 };
    windows.set(key, window);
  }
  if (window.count >= MAX_REQUESTS) return { allowed: false, retryAfter: Math.max(1, Math.ceil((window.startedAt + WINDOW_MS - now) / 1000)) };
  window.count++;
  return { allowed: true };
}

export function resetRateLimit(): void { windows.clear(); }
