import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  AiCommandRequest,
  AiCompareRequest,
  AiOrganizeRequest,
  AiSummarizeRequest,
} from "@thicket/types";
import { resolveModels, TASK_TIERS, type AiTaskName } from "./models";
import type { AiProvider, CompletionResult } from "./provider";

/**
 * Task functions: prompt construction + response schemas for every AI job.
 * Inputs are the compact wire DTOs (titles/domains only unless the user
 * opted into content analysis — enforced upstream by the privacy layer).
 */

const nameRule = `Group names must sound like something a person would type: short (2-4 words), concrete, title case. Good: "Apartment Hunt", "Japan Trip", "Camera Research", "Pricing Launch". Never use words like "Miscellaneous", "Category", "Collection", "Various", "Group", or "Resources".`;

const honestyRule = `Never invent facts that are not visible in the provided data. If something is unknown, omit it.`;

function tabLines(tabs: { key: string; title: string; domain: string; searchQuery?: string; excerpt?: string }[]): string {
  return tabs
    .map((t) => {
      const parts = [`[${t.key}] ${t.title} (${t.domain})`];
      if (t.searchQuery) parts.push(`  searched: "${t.searchQuery}"`);
      if (t.excerpt) parts.push(`  excerpt: ${t.excerpt.slice(0, 400)}`);
      return parts.join("\n");
    })
    .join("\n");
}

/* ─────────────────────────── organize ─────────────────────────── */

export const organizeResult = z.object({
  groups: z.array(
    z.object({
      name: z.string(),
      kind: z.string(),
      keys: z.array(z.string()),
      insight: z.string().optional(),
    }),
  ),
});
export type OrganizeResult = z.infer<typeof organizeResult>;

const organizeJsonSchema = {
  type: "object",
  properties: {
    groups: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          kind: {
            type: "string",
            enum: [
              "project", "travel", "shopping", "realestate", "work", "research",
              "reading", "jobs", "learning", "media", "other",
            ],
          },
          keys: { type: "array", items: { type: "string" } },
          insight: { type: "string" },
        },
        required: ["name", "kind", "keys"],
        additionalProperties: false,
      },
    },
  },
  required: ["groups"],
  additionalProperties: false,
} as const;

export function buildOrganizePrompt(request: AiOrganizeRequest): { system: string; user: string } {
  const system = `You organize browser tabs into the real-world activities behind them. Tabs are unfinished intentions: an apartment hunt, a trip being planned, a work project, product research.

Rules:
- Every tab key must appear in exactly one group.
- Prefer fewer, meaningful groups over many small ones. Do not create a group with fewer than 2 tabs unless it is clearly its own activity.
- Keep the proposed grouping when it is reasonable; only move tabs that are clearly misplaced.
- ${nameRule}
- "insight" is optional: one short factual sentence about the group derived ONLY from the visible titles (e.g. "Comparing three 2-bedroom listings around Silver Lake."). ${honestyRule} No insight is better than a hollow one.`;

  const proposed = request.proposed
    .map((g) => `- ${g.name} (${g.kind}): ${g.keys.join(", ")}`)
    .join("\n");
  const user = `Open tabs:
${tabLines(request.tabs)}

Current proposed grouping:
${proposed || "(none)"}

Return the refined grouping.`;
  return { system, user };
}

/* ─────────────────────────── summarize ─────────────────────────── */

export const summarizeResult = z.object({
  doing: z.string(),
  findings: z.array(z.string()).max(5),
  keep: z.array(z.object({ key: z.string(), why: z.string() })).max(5),
  nextStep: z.string().optional(),
});
export type SummarizeResult = z.infer<typeof summarizeResult>;

const summarizeJsonSchema = {
  type: "object",
  properties: {
    doing: { type: "string" },
    findings: { type: "array", items: { type: "string" } },
    keep: {
      type: "array",
      items: {
        type: "object",
        properties: { key: { type: "string" }, why: { type: "string" } },
        required: ["key", "why"],
        additionalProperties: false,
      },
    },
    nextStep: { type: "string" },
  },
  required: ["doing", "findings", "keep"],
  additionalProperties: false,
} as const;

export function buildSummarizePrompt(request: AiSummarizeRequest): { system: string; user: string } {
  const system = `You summarize a group of browser tabs for the person who opened them. Be brief and useful — this is a glanceable card, not an essay.

- "doing": one sentence describing what they're working on.
- "findings": up to 4 short bullets of concrete information visible in the tabs. ${honestyRule}
- "keep": up to 4 tabs worth keeping (by key) with a five-to-ten-word reason.
- "nextStep": one practical suggestion, only if an obvious one exists.
Write like a sharp assistant, not a report. No filler, no "it appears that".`;
  const user = `Group: "${request.title}"

Tabs:
${tabLines(request.tabs)}`;
  return { system, user };
}

/* ─────────────────────────── compare ─────────────────────────── */

export const compareResult = z.object({
  subject: z.string(),
  columns: z.array(z.object({ key: z.string(), label: z.string() })).max(8),
  rows: z.array(
    z.object({
      key: z.string(),
      cells: z.array(z.object({ column: z.string(), value: z.string().nullable() })),
    }),
  ),
});
export type CompareResult = z.infer<typeof compareResult>;

const compareJsonSchema = {
  type: "object",
  properties: {
    subject: { type: "string" },
    columns: {
      type: "array",
      items: {
        type: "object",
        properties: { key: { type: "string" }, label: { type: "string" } },
        required: ["key", "label"],
        additionalProperties: false,
      },
    },
    rows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          key: { type: "string" },
          cells: {
            type: "array",
            items: {
              type: "object",
              properties: {
                column: { type: "string" },
                value: { type: ["string", "null"] },
              },
              required: ["column", "value"],
              additionalProperties: false,
            },
          },
        },
        required: ["key", "cells"],
        additionalProperties: false,
      },
    },
  },
  required: ["subject", "columns", "rows"],
  additionalProperties: false,
} as const;

export function buildComparePrompt(request: AiCompareRequest): { system: string; user: string } {
  const system = `You build a comparison table from browser tabs about comparable things (products, apartments, hotels, tools).

- Choose 3-6 comparison columns that matter for this kind of thing (price, key specs, location…). Column "key" is a short snake_case id; "label" is the header shown to the user.
- One row per tab key. Fill values ONLY from information visible in the titles/excerpts provided. Unknown values MUST be null — never guess, never fabricate. ${honestyRule}
- Keep cell values short (a few words or a number).
- "subject" names what is being compared, e.g. "Mirrorless cameras".`;
  const user = `Tabs to compare:
${tabLines(request.tabs)}`;
  return { system, user };
}

/* ─────────────────────────── command ─────────────────────────── */

export const commandResult = z.object({
  intent: z.enum([
    "search",
    "show_group",
    "close_group",
    "close_stale",
    "close_duplicates",
    "save_group",
    "restore_workspace",
    "summarize_group",
    "compare_group",
    "cleanup",
    "answer",
  ]),
  groupId: z.string().optional(),
  workspaceId: z.string().optional(),
  query: z.string().optional(),
  /** For "answer": one or two sentences responding to the question. */
  answer: z.string().optional(),
});
export type CommandResult = z.infer<typeof commandResult>;

const commandJsonSchema = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: [
        "search", "show_group", "close_group", "close_stale", "close_duplicates",
        "save_group", "restore_workspace", "summarize_group", "compare_group",
        "cleanup", "answer",
      ],
    },
    groupId: { type: "string" },
    workspaceId: { type: "string" },
    query: { type: "string" },
    answer: { type: "string" },
  },
  required: ["intent"],
  additionalProperties: false,
} as const;

export function buildCommandPrompt(request: AiCommandRequest): { system: string; user: string } {
  const system = `You interpret a command typed into a tab manager's command bar and map it to one intent.

- Reference groups by their id from the provided list; same for workspaces.
- "search" with a cleaned query when the user is looking for a page.
- "answer" only for genuine questions about their tabs that no other intent covers; keep answers to one or two sentences grounded in the provided context. ${honestyRule}
- When unsure, prefer "search" with the raw text as query.`;
  const groups = request.context.groups.map((g) => `- ${g.id}: ${g.name}`).join("\n");
  const workspaces = request.context.workspaces.map((w) => `- ${w.id}: ${w.title}`).join("\n");
  const user = `Command: "${request.input}"

Open groups:
${groups || "(none)"}

Saved workspaces:
${workspaces || "(none)"}`;
  return { system, user };
}

/* ─────────────────────────── service ─────────────────────────── */

export interface AiTaskOutcome<T> extends CompletionResult<T> {
  cacheKey: string;
}

export function cacheKey(task: AiTaskName, payload: unknown): string {
  return createHash("sha256").update(task).update(JSON.stringify(payload)).digest("hex");
}

export interface AiService {
  available: boolean;
  models: Record<"fast" | "smart", string>;
  organize(request: AiOrganizeRequest): Promise<AiTaskOutcome<OrganizeResult>>;
  summarize(request: AiSummarizeRequest): Promise<AiTaskOutcome<SummarizeResult>>;
  compare(request: AiCompareRequest): Promise<AiTaskOutcome<CompareResult>>;
  command(request: AiCommandRequest): Promise<AiTaskOutcome<CommandResult>>;
}

export function createAiService(
  provider: AiProvider,
  env: { AI_MODEL_FAST?: string; AI_MODEL_SMART?: string } = {},
): AiService {
  const models = resolveModels(env);
  const modelFor = (task: AiTaskName) => models[TASK_TIERS[task]];

  async function run<T>(
    task: AiTaskName,
    payload: unknown,
    prompts: { system: string; user: string },
    schema: z.ZodType<T>,
    jsonSchema: Record<string, unknown>,
    maxTokens: number,
  ): Promise<AiTaskOutcome<T>> {
    const result = await provider.complete({
      task,
      model: modelFor(task),
      system: prompts.system,
      user: prompts.user,
      schema,
      jsonSchema,
      maxTokens,
    });
    return { ...result, cacheKey: cacheKey(task, payload) };
  }

  return {
    available: provider.available,
    models,
    organize: (request) =>
      run("organize", request, buildOrganizePrompt(request), organizeResult, organizeJsonSchema, 3000),
    summarize: (request) =>
      run("summarize", request, buildSummarizePrompt(request), summarizeResult, summarizeJsonSchema, 1500),
    compare: (request) =>
      run("compare", request, buildComparePrompt(request), compareResult, compareJsonSchema, 3000),
    command: (request) =>
      run("command", request, buildCommandPrompt(request), commandResult, commandJsonSchema, 600),
  };
}
