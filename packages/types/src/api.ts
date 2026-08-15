import { z } from "zod";

/**
 * Wire schemas shared by the extension client and the API route handlers.
 * Everything crossing the network is validated with these on the server.
 */

const url = z.string().url().max(2048);
const shortText = z.string().max(512);

export const workspaceTabPayload = z.object({
  id: z.string().min(1).max(64),
  url,
  title: shortText,
  domain: z.string().max(255),
  faviconUrl: z.string().url().max(2048).optional(),
  pinned: z.boolean().default(false),
  position: z.number().int().min(0).max(10_000),
  note: z.string().max(2000).optional(),
  addedAt: z.number().int().positive(),
});

export const workspacePayload = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(120),
  summary: z.string().max(2000).optional(),
  kind: z.string().max(24),
  state: z.enum(["active", "archived"]),
  color: z.string().max(16),
  tabs: z.array(workspaceTabPayload).max(500),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
  lastActiveAt: z.number().int().positive(),
  position: z.number().int().min(0).max(10_000),
});

export const syncWorkspacesRequest = z.object({
  upserts: z.array(workspacePayload).max(100).default([]),
  deletes: z.array(z.string().max(64)).max(100).default([]),
});
export type SyncWorkspacesRequest = z.infer<typeof syncWorkspacesRequest>;

/** A page visit recorded into history. Already privacy-filtered client-side; re-filtered server-side. */
export const pageVisitPayload = z.object({
  url,
  title: shortText,
  domain: z.string().max(255),
  visitedAt: z.number().int().positive(),
});

export const syncPagesRequest = z.object({
  visits: z.array(pageVisitPayload).max(500),
});
export type SyncPagesRequest = z.infer<typeof syncPagesRequest>;

/** Forget pages server-side: specific urls, or everything. */
export const deletePagesRequest = z
  .object({
    urls: z.array(z.string().max(2048)).max(200).optional(),
    all: z.boolean().optional(),
  })
  .refine((d) => d.all === true || (d.urls?.length ?? 0) > 0, {
    message: "Provide urls or all: true",
  });
export type DeletePagesRequest = z.infer<typeof deletePagesRequest>;

/** Compact tab features sent for AI organization. Titles + URLs only unless content opt-in. */
export const aiTabFeature = z.object({
  key: z.string().max(64),
  title: shortText,
  domain: z.string().max(255),
  category: z.string().max(24),
  searchQuery: shortText.optional(),
  /** First ~1200 chars of readable text; only present when the user enabled content analysis. */
  excerpt: z.string().max(1600).optional(),
});

export const aiOrganizeRequest = z.object({
  tabs: z.array(aiTabFeature).min(1).max(200),
  /** Local groups as a starting point: arrays of tab keys with proposed names. */
  proposed: z
    .array(
      z.object({
        name: z.string().max(80),
        kind: z.string().max(24),
        keys: z.array(z.string().max(64)).max(200),
      }),
    )
    .max(24),
});
export type AiOrganizeRequest = z.infer<typeof aiOrganizeRequest>;

export const aiOrganizeResponse = z.object({
  groups: z.array(
    z.object({
      name: z.string(),
      kind: z.string(),
      keys: z.array(z.string()),
      insight: z.string().optional(),
    }),
  ),
  cached: z.boolean().default(false),
});
export type AiOrganizeResponse = z.infer<typeof aiOrganizeResponse>;

export const aiSummarizeRequest = z.object({
  title: z.string().max(120),
  tabs: z.array(aiTabFeature).min(1).max(100),
});
export type AiSummarizeRequest = z.infer<typeof aiSummarizeRequest>;

export const aiSummarizeResponse = z.object({
  doing: z.string(),
  findings: z.array(z.string()),
  keep: z.array(z.object({ key: z.string(), why: z.string() })),
  nextStep: z.string().optional(),
});
export type AiSummarizeResponse = z.infer<typeof aiSummarizeResponse>;

export const aiCompareRequest = z.object({
  tabs: z.array(aiTabFeature).min(2).max(30),
});
export type AiCompareRequest = z.infer<typeof aiCompareRequest>;

export const aiCompareResponse = z.object({
  subject: z.string(),
  columns: z.array(z.object({ key: z.string(), label: z.string() })),
  rows: z.array(
    z.object({
      key: z.string(),
      values: z.record(z.string(), z.string().nullable()),
    }),
  ),
});
export type AiCompareResponse = z.infer<typeof aiCompareResponse>;

export const aiCommandRequest = z.object({
  input: z.string().min(1).max(500),
  context: z.object({
    groups: z.array(z.object({ id: z.string(), name: z.string() })).max(30),
    workspaces: z.array(z.object({ id: z.string(), title: z.string() })).max(100),
  }),
});
export type AiCommandRequest = z.infer<typeof aiCommandRequest>;

export const searchRequest = z.object({
  query: z.string().min(1).max(300),
  scope: z.enum(["history", "workspaces", "all"]).default("all"),
  limit: z.number().int().min(1).max(50).default(20),
});
export type SearchRequest = z.infer<typeof searchRequest>;

export const searchResult = z.object({
  url: z.string(),
  title: z.string(),
  domain: z.string(),
  kind: z.enum(["history", "workspace-tab"]),
  workspaceId: z.string().optional(),
  workspaceTitle: z.string().optional(),
  lastSeenAt: z.number().optional(),
  score: z.number(),
});
export type SearchResultItem = z.infer<typeof searchResult>;

export const deviceLinkCompleteRequest = z.object({
  code: z.string().min(6).max(64),
  device: z.object({
    name: z.string().max(120),
    browser: z.string().max(120),
  }),
});
export type DeviceLinkCompleteRequest = z.infer<typeof deviceLinkCompleteRequest>;

export const eventsBatchRequest = z.object({
  events: z
    .array(
      z.object({
        name: z.string().min(1).max(64),
        props: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
        at: z.number().int().positive(),
      }),
    )
    .max(50),
});
export type EventsBatchRequest = z.infer<typeof eventsBatchRequest>;

export const errorReportRequest = z.object({
  message: z.string().max(2000),
  stack: z.string().max(8000).optional(),
  context: z.string().max(200).optional(),
  version: z.string().max(32).optional(),
  at: z.number().int().positive(),
});
export type ErrorReportRequest = z.infer<typeof errorReportRequest>;

export const preferencesPatch = z
  .object({
    aiEnabled: z.boolean(),
    contentAnalysis: z.boolean(),
    historyEnabled: z.boolean(),
    syncEnabled: z.boolean(),
    mirrorTabGroups: z.boolean(),
    paused: z.boolean(),
    theme: z.enum(["system", "light", "dark"]),
  })
  .partial();
export type PreferencesPatch = z.infer<typeof preferencesPatch>;
