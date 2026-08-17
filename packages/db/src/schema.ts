import {
  boolean,
  char,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  vector,
} from "drizzle-orm/pg-core";

/** Embedding dimensionality — matches the Voyage model configured in @thicket/ai. */
export const EMBEDDING_DIMS = 1024;

/* ───────────────────────── Auth (Better Auth managed) ───────────────────── */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("account_user_idx").on(t.userId)],
);

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ───────────────────────────── Billing ──────────────────────────────────── */

export const subscription = pgTable(
  "subscription",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .unique()
      .references(() => user.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id").unique(),
    stripeSubscriptionId: text("stripe_subscription_id").unique(),
    /** Stripe subscription status, or "none". */
    status: text("status").notNull().default("none"),
    plan: text("plan", { enum: ["free", "pro"] })
      .notNull()
      .default("free"),
    interval: text("interval", { enum: ["month", "year"] }),
    currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
    cancelAtPeriodEnd: boolean("cancel_at_period_end").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("subscription_customer_idx").on(t.stripeCustomerId)],
);

/** Processed Stripe webhook events, for idempotency. */
export const stripeEvent = pgTable("stripe_event", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ─────────────────────────── Extension devices ──────────────────────────── */

export const device = pgTable(
  "device",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    browser: text("browser").notNull().default(""),
    /** SHA-256 of the bearer token; the plaintext exists only on the device. */
    tokenHash: char("token_hash", { length: 64 }).notNull().unique(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (t) => [index("device_user_idx").on(t.userId)],
);

/** Short-lived one-time codes that link an extension install to an account. */
export const deviceLinkCode = pgTable(
  "device_link_code",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    codeHash: char("code_hash", { length: 64 }).notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("device_link_code_user_idx").on(t.userId)],
);

/* ─────────────────────────── Workspaces ─────────────────────────────────── */

export const workspace = pgTable(
  "workspace",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    summary: text("summary"),
    kind: text("kind").notNull().default("project"),
    state: text("state", { enum: ["active", "archived"] })
      .notNull()
      .default("active"),
    color: text("color").notNull().default("blue"),
    position: integer("position").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("workspace_user_state_idx").on(t.userId, t.state, t.position)],
);

export const workspaceTab = pgTable(
  "workspace_tab",
  {
    id: text("id").primaryKey(),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspace.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    title: text("title").notNull(),
    domain: text("domain").notNull().default(""),
    faviconUrl: text("favicon_url"),
    pinned: boolean("pinned").notNull().default(false),
    position: integer("position").notNull().default(0),
    note: text("note"),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("workspace_tab_ws_idx").on(t.workspaceId, t.position)],
);

/* ─────────────────────── Page memory (history) ──────────────────────────── */

export const pageRecord = pgTable(
  "page_record",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    /** MD5 of the normalized URL — compact uniqueness key. */
    urlHash: char("url_hash", { length: 32 }).notNull(),
    title: text("title").notNull(),
    domain: text("domain").notNull().default(""),
    firstSeenAt: timestamp("first_seen_at", { withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    visitCount: integer("visit_count").notNull().default(1),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIMS }),
    embeddedAt: timestamp("embedded_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("page_record_user_url_idx").on(t.userId, t.urlHash),
    index("page_record_user_seen_idx").on(t.userId, t.lastSeenAt),
  ],
);

/* ───────────────────────── Preferences + privacy ────────────────────────── */

export const preference = pgTable("preference", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  aiEnabled: boolean("ai_enabled").notNull().default(true),
  contentAnalysis: boolean("content_analysis").notNull().default(false),
  historyEnabled: boolean("history_enabled").notNull().default(true),
  syncEnabled: boolean("sync_enabled").notNull().default(true),
  mirrorTabGroups: boolean("mirror_tab_groups").notNull().default(true),
  paused: boolean("paused").notNull().default(false),
  theme: text("theme", { enum: ["system", "light", "dark"] })
    .notNull()
    .default("system"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const excludedDomain = pgTable(
  "excluded_domain",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    domain: text("domain").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("excluded_domain_user_idx").on(t.userId, t.domain)],
);

/** User corrections that feed the grouping feedback loop. */
export const correction = pgTable(
  "correction",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind", { enum: ["move", "merge", "rename", "not_related", "pin"] }).notNull(),
    payload: jsonb("payload").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("correction_user_idx").on(t.userId, t.createdAt)],
);

/* ─────────────────────── Observability + metering ───────────────────────── */

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    task: text("task").notNull(),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    /** Cost in millionths of a US dollar. */
    costUsdMicros: integer("cost_usd_micros").notNull().default(0),
    cached: boolean("cached").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ai_usage_user_time_idx").on(t.userId, t.createdAt)],
);

/** First-party product analytics. No IPs, no fingerprints, no page contents. */
export const event = pgTable(
  "event",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    deviceId: text("device_id"),
    name: text("name").notNull(),
    props: jsonb("props").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("event_name_time_idx").on(t.name, t.createdAt)],
);

/** Error reports from the extension (message + stack only, no page data). */
export const errorReport = pgTable(
  "error_report",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    message: text("message").notNull(),
    stack: text("stack"),
    context: text("context"),
    version: text("version"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("error_report_time_idx").on(t.createdAt)],
);

/** Server-side cache for AI results, keyed by input hash. */
export const aiCache = pgTable(
  "ai_cache",
  {
    key: char("key", { length: 64 }).primaryKey(),
    task: text("task").notNull(),
    value: jsonb("value").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("ai_cache_expiry_idx").on(t.expiresAt)],
);
