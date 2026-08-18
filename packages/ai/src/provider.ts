import Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod";

/**
 * Provider abstraction. The application calls `complete()` with a task name,
 * prompts, and a zod schema; the provider returns a validated object plus
 * usage. Server-side only — no key ever reaches the browser or extension.
 */

export interface CompletionRequest<T> {
  task: string;
  model: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  /** JSON Schema mirror of `schema`, sent to the API for structured output. */
  jsonSchema: Record<string, unknown>;
  maxTokens?: number;
}

export interface CompletionResult<T> {
  value: T;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export class AiRefusalError extends Error {
  constructor() {
    super("The model declined this request.");
    this.name = "AiRefusalError";
  }
}

/**
 * The model ran out of room before closing its JSON. Distinct from a refusal
 * or a bad schema: the request was fine and retrying with more headroom would
 * work, so callers degrade to the on-device fallback rather than erroring.
 */
export class AiTruncatedError extends Error {
  constructor(task: string) {
    super(`The model ran out of room on ${task}.`);
    this.name = "AiTruncatedError";
  }
}

/** Model returned something that wasn't the JSON we asked for. */
export class AiInvalidOutputError extends Error {
  constructor(task: string) {
    super(`The model returned unusable output for ${task}.`);
    this.name = "AiInvalidOutputError";
  }
}

export class AiUnavailableError extends Error {
  constructor(message = "AI is not configured.") {
    super(message);
    this.name = "AiUnavailableError";
  }
}

export interface AiProvider {
  readonly available: boolean;
  complete<T>(request: CompletionRequest<T>): Promise<CompletionResult<T>>;
}

/**
 * Room for adaptive thinking on top of each task's answer budget. Sized from
 * what these tasks actually think at low effort, with slack.
 */
const THINKING_HEADROOM_TOKENS = 8000;

export class AnthropicProvider implements AiProvider {
  readonly available = true;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  async complete<T>(request: CompletionRequest<T>): Promise<CompletionResult<T>> {
    /**
     * Opus 5 thinks by default, and `max_tokens` caps thinking AND the answer
     * together. Our budgets were sized for the answer alone, so any task that
     * thought for a moment came back with its JSON cut off mid-object and
     * JSON.parse threw a bare SyntaxError at the caller. Give thinking its own
     * headroom on top of the answer budget rather than disabling it: disabled
     * thinking on this model has its own failure modes, and low effort already
     * buys back most of the cost on work this shallow.
     *
     * Streaming because a large max_tokens on a single non-streaming request
     * is how you hit an HTTP timeout.
     */
    const response = await this.client.beta.messages
      .stream({
        model: request.model,
        max_tokens: (request.maxTokens ?? 2048) + THINKING_HEADROOM_TOKENS,
        system: request.system,
        messages: [{ role: "user", content: request.user }],
        thinking: { type: "adaptive" },
        output_config: {
          effort: "low",
          format: { type: "json_schema", schema: request.jsonSchema },
        },
        /**
         * Safety classifiers can decline a request outright — plausible here,
         * since we send page titles and someone's tabs can be about anything.
         * "default" re-runs the declined request on Anthropic's recommended
         * fallback model instead of failing the call.
         */
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      })
      .finalMessage();

    if (response.stop_reason === "refusal") throw new AiRefusalError();
    if (response.stop_reason === "max_tokens") throw new AiTruncatedError(request.task);

    const text = response.content
      .filter((block): block is Anthropic.Beta.BetaTextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AiInvalidOutputError(request.task);
    }
    const parsed = request.schema.safeParse(json);
    if (!parsed.success) {
      throw new AiInvalidOutputError(request.task);
    }
    return {
      value: parsed.data,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      model: response.model,
    };
  }
}

/** Used when no ANTHROPIC_API_KEY is configured: callers degrade to local logic. */
export class NullProvider implements AiProvider {
  readonly available = false;
  complete<T>(): Promise<CompletionResult<T>> {
    return Promise.reject(new AiUnavailableError());
  }
}

export function createProvider(env: { ANTHROPIC_API_KEY?: string }): AiProvider {
  return env.ANTHROPIC_API_KEY ? new AnthropicProvider(env.ANTHROPIC_API_KEY) : new NullProvider();
}
