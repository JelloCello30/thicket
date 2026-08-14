import "server-only";
import { randomUUID } from "node:crypto";
import { event } from "@tabmind/db/schema";
import { serverEnv } from "@tabmind/config/env";
import { db } from "./db";

/**
 * First-party product analytics: name + coarse props into our own table.
 * If POSTHOG_KEY is set, events are forwarded there too (plain HTTP, no SDK).
 * No IPs, no user agents, no URLs, no page content — ever.
 */
export async function track(
  name: string,
  props: Record<string, string | number | boolean> = {},
  who: { userId?: string; deviceId?: string } = {},
  at?: Date,
): Promise<void> {
  try {
    const database = await db();
    await database.insert(event).values({
      id: randomUUID(),
      userId: who.userId ?? null,
      deviceId: who.deviceId ?? null,
      name,
      props,
      createdAt: at ?? new Date(),
    });
  } catch (error) {
    console.error("[track]", error);
  }

  const env = serverEnv();
  if (env.POSTHOG_KEY) {
    void fetch(`${env.POSTHOG_HOST}/capture/`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        api_key: env.POSTHOG_KEY,
        event: name,
        distinct_id: who.userId ?? who.deviceId ?? "anonymous",
        properties: props,
        timestamp: (at ?? new Date()).toISOString(),
      }),
    }).catch(() => undefined);
  }
}
