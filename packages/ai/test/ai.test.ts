import { describe, expect, it } from "vitest";
import type { z } from "zod";
import {
  buildComparePrompt,
  buildOrganizePrompt,
  buildSummarizePrompt,
  cacheKey,
  costUsdMicros,
  createAiService,
  createEmbeddings,
  createProvider,
  resolveModels,
  type AiProvider,
  type CompletionRequest,
} from "../src";

function fakeProvider(responses: Record<string, unknown>): AiProvider & { calls: CompletionRequest<unknown>[] } {
  const calls: CompletionRequest<unknown>[] = [];
  return {
    available: true,
    calls,
    async complete<T>(request: CompletionRequest<T>) {
      calls.push(request as CompletionRequest<unknown>);
      const raw = responses[request.task];
      const parsed = (request.schema as z.ZodType<T>).parse(raw);
      return { value: parsed, inputTokens: 100, outputTokens: 50, model: request.model };
    },
  };
}

const tabs = [
  { key: "t1", title: "3421 Sunset Blvd | Zillow", domain: "zillow.com", category: "realestate" },
  { key: "t2", title: "Rent Calculator - NerdWallet", domain: "nerdwallet.com", category: "finance" },
];

describe("model routing", () => {
  it("routes frequent tasks to the fast tier and quality tasks to the smart tier", async () => {
    const provider = fakeProvider({
      organize: { groups: [{ name: "Apartment Hunt", kind: "realestate", keys: ["t1", "t2"] }] },
      summarize: { doing: "Hunting apartments", findings: [], keep: [] },
    });
    const service = createAiService(provider);
    await service.organize({ tabs, proposed: [] });
    await service.summarize({ title: "Apartment Hunt", tabs });
    expect(provider.calls[0]!.model).toBe("claude-haiku-4-5");
    expect(provider.calls[1]!.model).toBe("claude-opus-5");
  });

  it("honors env overrides", () => {
    const models = resolveModels({ AI_MODEL_FAST: "claude-sonnet-5", AI_MODEL_SMART: "claude-opus-5" });
    expect(models.fast).toBe("claude-sonnet-5");
  });
});

describe("prompts", () => {
  it("organize prompt carries the naming quality bar and every tab key", () => {
    const { system, user } = buildOrganizePrompt({
      tabs,
      proposed: [{ name: "Apartment Hunt", kind: "realestate", keys: ["t1", "t2"] }],
    });
    expect(system).toContain("Apartment Hunt");
    expect(system).toContain("Miscellaneous");
    expect(user).toContain("[t1]");
    expect(user).toContain("[t2]");
  });

  it("summarize prompt demands brevity and honesty", () => {
    const { system } = buildSummarizePrompt({ title: "X", tabs });
    expect(system).toMatch(/brief/i);
    expect(system).toMatch(/never invent/i);
  });

  it("compare prompt forbids fabrication", () => {
    const { system } = buildComparePrompt({ tabs });
    expect(system).toContain("MUST be null");
  });

  it("never includes excerpt text unless provided (privacy: titles/domains only)", () => {
    const { user } = buildOrganizePrompt({ tabs, proposed: [] });
    expect(user).not.toContain("excerpt:");
  });
});

describe("degradation without keys", () => {
  it("NullProvider rejects with a typed error and reports unavailable", async () => {
    const provider = createProvider({});
    expect(provider.available).toBe(false);
    const service = createAiService(provider);
    await expect(service.organize({ tabs, proposed: [] })).rejects.toThrow(/not configured/i);
  });

  it("NullEmbeddings reports unavailable", () => {
    expect(createEmbeddings({}).available).toBe(false);
  });
});

describe("cost accounting", () => {
  it("computes usd micros from the pricing table", () => {
    // 1M input + 1M output on haiku = $1 + $5 = 6,000,000 micros
    expect(costUsdMicros("claude-haiku-4-5", 1_000_000, 1_000_000)).toBe(6_000_000);
    expect(costUsdMicros("claude-opus-5", 2_000, 500)).toBe(2_000 * 5 + 500 * 25);
    expect(costUsdMicros("unknown-model", 1000, 1000)).toBe(0);
  });
});

describe("caching", () => {
  it("cache keys are stable for identical payloads and differ across tasks", () => {
    const payload = { tabs, proposed: [] };
    expect(cacheKey("organize", payload)).toBe(cacheKey("organize", payload));
    expect(cacheKey("organize", payload)).not.toBe(cacheKey("summarize", payload));
  });
});
