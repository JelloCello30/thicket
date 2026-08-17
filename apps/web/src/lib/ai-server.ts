import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, gte, sql } from "drizzle-orm";
import {
  cacheKey,
  costUsdMicros,
  createAiService,
  createEmbeddings,
  createProvider,
  type AiService,
  type AiTaskName,
} from "@thicket/ai";
import { AI_CACHE_TTL_HOURS, RATE_LIMITS } from "@thicket/config";
import { serverEnv } from "@thicket/config/env";
import { aiCache, aiUsage } from "@thicket/db/schema";
import { db } from "./db";
import { rateLimit } from "./rate-limit";
import { HttpError, type RequestUser } from "./request-auth";

/**
 * Server-side AI orchestration: entitlement checks, durable daily caps,
 * result caching, and usage/cost accounting around @thicket/ai.
 */

const env = serverEnv();
export const aiService: AiService = createAiService(createProvider(env), env);
export const embeddings = createEmbeddings(env);

/** Server-side privacy enforcement: page excerpts only flow when the user opted in. */
export function stripExcerptsUnlessAllowed(tabs: { excerpt?: string }[], contentAllowed: boolean): void {
  if (contentAllowed) return;
  for (const tab of tabs) delete tab.excerpt;
}

export function requireAiConfigured(): void {
  if (!aiService.available) {
    throw new HttpError(
      503,
      "ai-unavailable",
      "AI isn't configured on this server yet. Local organization still works.",
    );
  }
}

export function requireProFeature(user: RequestUser, feature: "summaries" | "compare" | "semanticSearch"): void {
  if (!user.entitlements[feature]) {
    throw new HttpError(402, "pro-required", "This is a Pro feature. Upgrade to unlock it.");
  }
}

export function requireAiPreference(user: RequestUser): void {
  if (!user.aiEnabled) {
    throw new HttpError(
      403,
      "ai-disabled",
      "AI processing is turned off in your privacy settings.",
    );
  }
}

export async function enforceAiBudget(user: RequestUser, task: AiTaskName): Promise<void> {
  rateLimit(`ai:${user.id}`, RATE_LIMITS.aiPerMinute);
  const database = await db();
  const since = new Date(Date.now() - 24 * 3600_000);
  const rows = await database
    .select({ count: sql<number>`count(*)::int` })
    .from(aiUsage)
    .where(and(eq(aiUsage.userId, user.id), gte(aiUsage.createdAt, since), eq(aiUsage.cached, false)));
  const used = rows[0]?.count ?? 0;
  if (used >= user.entitlements.aiCallsPerDay) {
    throw new HttpError(
      429,
      user.plan === "free" ? "pro-required" : "rate-limited",
      user.plan === "free"
        ? "You've used today's free AI organization. Upgrade to Pro for much more."
        : "You've hit today's AI limit. It resets within 24 hours.",
    );
  }
  void task;
}

export async function withAiCache<T>(
  user: RequestUser,
  task: AiTaskName,
  payload: unknown,
  run: () => Promise<{ value: T; inputTokens: number; outputTokens: number; model: string }>,
): Promise<{ value: T; cached: boolean }> {
  const database = await db();
  const key = cacheKey(task, payload).slice(0, 64);
  const hit = await database.select().from(aiCache).where(eq(aiCache.key, key)).limit(1);
  const entry = hit[0];
  if (entry && entry.expiresAt.getTime() > Date.now()) {
    await recordUsage(user, task, "cache", 0, 0, true);
    return { value: entry.value as T, cached: true };
  }

  const result = await run();
  await database
    .insert(aiCache)
    .values({
      key,
      task,
      value: result.value as Record<string, unknown>,
      expiresAt: new Date(Date.now() + AI_CACHE_TTL_HOURS * 3600_000),
    })
    .onConflictDoUpdate({
      target: aiCache.key,
      set: {
        value: result.value as Record<string, unknown>,
        expiresAt: new Date(Date.now() + AI_CACHE_TTL_HOURS * 3600_000),
      },
    });
  await recordUsage(user, task, result.model, result.inputTokens, result.outputTokens, false);
  return { value: result.value, cached: false };
}

async function recordUsage(
  user: RequestUser,
  task: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cached: boolean,
): Promise<void> {
  const database = await db();
  await database.insert(aiUsage).values({
    id: randomUUID(),
    userId: user.id,
    task,
    model,
    inputTokens,
    outputTokens,
    costUsdMicros: costUsdMicros(model, inputTokens, outputTokens),
    cached,
  });
}
