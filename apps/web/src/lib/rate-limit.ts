import "server-only";
import { HttpError } from "./request-auth";

/**
 * Per-user rate limiting. In-memory sliding windows — appropriate for a
 * single-region deployment; swap for Upstash/Redis when scaling out
 * (documented in docs/DEPLOY.md). AI daily caps are enforced separately
 * against the ai_usage table, which is durable.
 */
const windows = new Map<string, number[]>();

export function rateLimit(key: string, limit: number, windowMs = 60_000): void {
  const now = Date.now();
  const hits = (windows.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    throw new HttpError(429, "rate-limited", "Slow down a little — try again in a minute.");
  }
  hits.push(now);
  windows.set(key, hits);
  if (windows.size > 10_000) {
    // Bounded memory: drop the oldest entries wholesale.
    const keys = [...windows.keys()].slice(0, 5_000);
    for (const k of keys) windows.delete(k);
  }
}
