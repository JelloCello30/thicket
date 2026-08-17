import "server-only";
import { serverEnv } from "@thicket/config/env";

/**
 * Error monitoring seam. With SENTRY_DSN set, @sentry/nextjs is initialized
 * via instrumentation.ts and this forwards to it; without it, errors go to
 * the server log only. Nothing here ever throws.
 */
export function captureServerError(error: unknown): void {
  try {
    const env = serverEnv();
    if (!env.SENTRY_DSN) return;
    // Lazy import keeps Sentry fully out of the bundle when unconfigured.
    void import("@sentry/nextjs").then((Sentry) => {
      Sentry.captureException(error);
    });
  } catch {
    /* monitoring must never break the request */
  }
}
