import { api } from "../shared/api";
import { readState } from "../shared/storage";
import { EXT_VERSION } from "../shared/env";

/**
 * Product analytics, first-party and minimal: event name + coarse props.
 * Never URLs, never titles, never page content. Queued in memory and
 * flushed opportunistically; dropped when signed out (no anonymous IDs
 * are ever created without an account).
 */

interface QueuedEvent {
  name: string;
  props: Record<string, string | number | boolean>;
  at: number;
}

const queue: QueuedEvent[] = [];

export function track(name: string, props: Record<string, string | number | boolean> = {}): void {
  queue.push({ name, props: { ...props, surface: "extension" }, at: Date.now() });
  if (queue.length >= 10) void flushEvents();
}

export async function flushEvents(): Promise<void> {
  if (queue.length === 0) return;
  const { auth } = await readState("auth");
  if (!auth) {
    queue.length = 0; // signed out → no telemetry at all
    return;
  }
  const batch = queue.splice(0, 50);
  try {
    await api.trackEvents(batch);
  } catch {
    /* analytics must never break the product; drop the batch */
  }
}

export async function reportError(error: unknown, context: string): Promise<void> {
  try {
    const err = error instanceof Error ? error : new Error(String(error));
    await api.reportError({
      message: err.message.slice(0, 500),
      stack: err.stack?.slice(0, 4000),
      context,
      version: EXT_VERSION,
      at: Date.now(),
    });
  } catch {
    /* never throw from the error reporter */
  }
}
