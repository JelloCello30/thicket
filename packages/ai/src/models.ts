/**
 * Model routing + pricing in one place. The rest of the codebase refers to
 * abstract tiers, never to concrete model IDs, so swapping providers or
 * models is a one-file change.
 *
 * Cost design: high-frequency, latency-sensitive tasks (organizing tabs,
 * naming groups, parsing commands) run on the fast tier; quality-sensitive,
 * Pro-gated tasks (summaries, comparisons) run on the smart tier.
 */

export type ModelTier = "fast" | "smart";

export interface ModelPricing {
  /** USD per million input tokens. */
  inputPerMTok: number;
  outputPerMTok: number;
}

const PRICING: Record<string, ModelPricing> = {
  "claude-opus-5": { inputPerMTok: 5, outputPerMTok: 25 },
  "claude-haiku-4-5": { inputPerMTok: 1, outputPerMTok: 5 },
  "claude-sonnet-5": { inputPerMTok: 3, outputPerMTok: 15 },
};

export function resolveModels(env: { AI_MODEL_FAST?: string; AI_MODEL_SMART?: string } = {}): Record<
  ModelTier,
  string
> {
  return {
    fast: env.AI_MODEL_FAST ?? "claude-haiku-4-5",
    smart: env.AI_MODEL_SMART ?? "claude-opus-5",
  };
}

export type AiTaskName = "organize" | "summarize" | "compare" | "command" | "insight";

export const TASK_TIERS: Record<AiTaskName, ModelTier> = {
  organize: "fast",
  command: "fast",
  insight: "fast",
  summarize: "smart",
  compare: "smart",
};

/** Cost in millionths of a USD, from token usage. */
export function costUsdMicros(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  return Math.round(inputTokens * pricing.inputPerMTok + outputTokens * pricing.outputPerMTok);
}
