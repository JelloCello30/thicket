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

export class AnthropicProvider implements AiProvider {
  readonly available = true;
  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey, maxRetries: 2 });
  }

  async complete<T>(request: CompletionRequest<T>): Promise<CompletionResult<T>> {
    const response = await this.client.messages.create({
      model: request.model,
      max_tokens: request.maxTokens ?? 2048,
      system: request.system,
      messages: [{ role: "user", content: request.user }],
      output_config: {
        format: {
          type: "json_schema",
          schema: request.jsonSchema,
        },
      },
    });

    if (response.stop_reason === "refusal") throw new AiRefusalError();

    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    const parsed = request.schema.safeParse(JSON.parse(text));
    if (!parsed.success) {
      throw new Error(`Model output failed validation for task ${request.task}: ${parsed.error.message}`);
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
