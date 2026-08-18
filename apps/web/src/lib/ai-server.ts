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
import { AiInvalidOutputError, AiRefusalError, AiTruncatedError } from "@thicket/ai";
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

export async function enforceAiBudget(user: RequestUser, task: AiTaskName): Promise<string> {
  rateLimit(`ai:${user.id}`, RATE_LIMITS.aiPerMinute);
  const database = await db();
  const since = new Date(Date.now() - 24 * 3600_000);
  /**
   * Claim the slot atomically. Counting and then deciding is a race: measured
   * 8 of 8 concurrent requests admitted at 19 used against a cap of 20, which
   * on a metered model is an uncapped bill attached to a fixed price. The
   * INSERT only lands if the count is still under the cap at write time, so
   * exactly `aiCallsPerDay` claims can win.
   */
  const claimId = randomUUID();
  const claimed = await database.execute(sql`
    INSERT INTO ai_usage (id, user_id, task, model, input_tokens, output_tokens, cost_usd_micros, cached, created_at)
    SELECT ${claimId}, ${user.id}, ${task}, 'pending', 0, 0, 0, false, now()
    WHERE (
      SELECT count(*) FROM ai_usage
      WHERE user_id = ${user.id} AND created_at >= ${since} AND cached = false
    ) < ${user.entitlements.aiCallsPerDay}
    RETURNING id
  `);
  const rowsClaimed = Array.isArray(claimed) ? claimed.length : (claimed.rows?.length ?? 0);
  if (rowsClaimed === 0) {
    throw new HttpError(
      429,
      user.plan === "free" ? "pro-required" : "rate-limited",
      user.plan === "free"
        ? "You've used today's free AI organization. Upgrade to Pro for much more."
        : "You've hit today's AI limit. It resets within 24 hours.",
    );
  }
  return claimId;
}

export async function withAiCache<T>(
  user: RequestUser,
  task: AiTaskName,
  payload: unknown,
  run: () => Promise<{ value: T; inputTokens: number; outputTokens: number; model: string }>,
  claimId?: string,
): Promise<{ value: T; cached: boolean }> {
  const database = await db();
  const key = cacheKey(task, payload).slice(0, 64);
  const hit = await database.select().from(aiCache).where(eq(aiCache.key, key)).limit(1);
  const entry = hit[0];
  if (entry && entry.expiresAt.getTime() > Date.now()) {
    if (claimId) await releaseClaim(claimId);
    await recordUsage(user, task, "cache", 0, 0, true);
    return { value: entry.value as T, cached: true };
  }

  /**
   * A refusal, a truncated answer, or unusable output are all "the model
   * couldn't do this one" — not server faults. They used to surface as 500s,
   * which the extension has no path for; 503 ai-unavailable is the code its
   * degradation already handles, so the button falls back to the on-device
   * summary instead of showing an error.
   */
  let result;
  try {
    result = await run();
  } catch (error) {
    if (
      error instanceof AiRefusalError ||
      error instanceof AiTruncatedError ||
      error instanceof AiInvalidOutputError
    ) {
      if (claimId) await releaseClaim(claimId);
      throw new HttpError(503, "ai-unavailable", "The AI couldn't complete that — showing the on-device version.");
    }
    if (claimId) await releaseClaim(claimId);
    throw error;
  }
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
  await recordUsage(user, task, result.model, result.inputTokens, result.outputTokens, false, claimId);
  return { value: result.value, cached: false };
}

/**
 * Fills in the row `enforceAiBudget` already claimed, so one request counts
 * once. A cache hit never claimed a slot (it costs nothing), so it inserts.
 */
async function recordUsage(
  user: RequestUser,
  task: string,
  model: string,
  inputTokens: number,
  outputTokens: number,
  cached: boolean,
  claimId?: string,
): Promise<void> {
  const database = await db();
  const values = {
    userId: user.id,
    task,
    model,
    inputTokens,
    outputTokens,
    costUsdMicros: costUsdMicros(model, inputTokens, outputTokens),
    cached,
  };
  if (claimId) {
    await database.update(aiUsage).set(values).where(eq(aiUsage.id, claimId));
    return;
  }
  await database.insert(aiUsage).values({ id: randomUUID(), ...values });
}

/** Hand a claimed slot back when the call didn't actually spend anything. */
async function releaseClaim(claimId: string): Promise<void> {
  const database = await db();
  await database.delete(aiUsage).where(eq(aiUsage.id, claimId)).catch(() => undefined);
}
