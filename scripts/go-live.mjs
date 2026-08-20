#!/usr/bin/env node
/**
 * Go-live tooling for a Thicket *server* deployment (the paid tier).
 *
 *   node scripts/go-live.mjs setup   guided, one question at a time (start here)
  go-live.mjs check              audit the environment, test every key that is set
 *   node scripts/go-live.mjs stripe             create/reuse the Thicket Pro product, prices, webhook
 *   node scripts/go-live.mjs migrate            apply migrations to DATABASE_URL
 *
 * Node builtins only for arg parsing and output. `pg` and `stripe` come from
 * the workspace's existing node_modules — nothing new to install.
 *
 * `check` reads whatever is in the process environment, so point it at the
 * real thing rather than guessing:
 *
 *   vercel env pull .env.production
 *   node --env-file=.env.production scripts/go-live.mjs check
 *
 * With nothing set it prints the full to-do list instead of failing obscurely.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));

// packages/db/src/paths.ts locates the migration SQL by walking up to
// pnpm-workspace.yaml, so every path here is anchored the same way.
function findWorkspaceRoot(start) {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const ROOT = findWorkspaceRoot(SCRIPT_DIR);

/** Values pinned in code that this script must not drift from. */
const EMBEDDING_DIMENSIONS = 1024; // packages/ai/src/embeddings.ts:7 AND packages/db/src/schema.ts:15
const VOYAGE_MODEL = "voyage-3.5-lite"; // packages/ai/src/embeddings.ts:22 — no env override exists
const DEFAULT_FAST_MODEL = "claude-haiku-4-5"; // packages/ai/src/models.ts:30
const DEFAULT_SMART_MODEL = "claude-opus-5"; // packages/ai/src/models.ts:31
const STRIPE_API_VERSION = "2025-08-27.basil"; // apps/web/src/lib/stripe.ts:9
const WEBHOOK_PATH = "/api/stripe/webhook";
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];
const MONTHLY_CENTS = 800;
const YEARLY_CENTS = 7200;
const DEFAULT_EMAIL_FROM = "Thicket <login@jellocello30.github.io/thicket>";
const EXPECTED_TABLES = [
  "user", "session", "account", "verification", "subscription", "stripe_event",
  "device", "device_link_code", "workspace", "workspace_tab", "page_record",
  "preference", "excluded_domain", "correction", "ai_usage", "event",
  "error_report", "ai_cache",
];

/* ── output ────────────────────────────────────────────────────────────── */

const color = process.stdout.isTTY && !process.env.NO_COLOR;
const dim = (s) => (color ? `\u001b[2m${s}\u001b[0m` : s);
const bold = (s) => (color ? `\u001b[1m${s}\u001b[0m` : s);
const red = (s) => (color ? `\u001b[31m${s}\u001b[0m` : s);
const green = (s) => (color ? `\u001b[32m${s}\u001b[0m` : s);
const yellow = (s) => (color ? `\u001b[33m${s}\u001b[0m` : s);

const failures = [];
const warnings = [];
const todo = [];

const say = (line = "") => console.log(line);
const section = (title) => {
  say("");
  say(bold(title));
};
const ok = (label, detail) => say(`  ${green("ok")}    ${label}${detail ? dim(`  ${detail}`) : ""}`);
const fail = (label, detail, action) => {
  failures.push(label);
  if (action) todo.push(`${label} — ${action}`);
  say(`  ${red("FAIL")}  ${label}${detail ? dim(`  ${detail}`) : ""}`);
  if (action) say(`        ${dim("→ " + action)}`);
};
const warn = (label, detail, action) => {
  warnings.push(label);
  if (action) todo.push(`${label} — ${action}`);
  say(`  ${yellow("warn")}  ${label}${detail ? dim(`  ${detail}`) : ""}`);
  if (action) say(`        ${dim("→ " + action)}`);
};
const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;
const skip = (label, detail) => say(`  ${dim("--")}    ${dim(label)}${detail ? dim(`  ${detail}`) : ""}`);
/** Present, which is not yet the same as valid — the checks below say whether it is. */
const present = (label, detail) => say(`  set   ${label}${detail ? dim(`  ${detail}`) : ""}`);

/** Never print a secret. Prefix only, plus the length so a truncated paste is visible. */
function mask(value) {
  if (!value) return "";
  const keep = value.length > 12 ? 6 : 2;
  return `${value.slice(0, keep)}… (${value.length} chars)`;
}

/** Connection strings carry the password in the userinfo — drop it, keep the host. */
function maskConnectionString(value) {
  try {
    const u = new URL(value);
    const user = u.username ? `${u.username}:***@` : "";
    return `${u.protocol}//${user}${u.host}${u.pathname}`;
  } catch {
    return mask(value);
  }
}

/* ── the environment catalog, one entry per variable found in the code ──── */

const env = process.env;
const has = (name) => Boolean(env[name] && env[name].trim() !== "");

/** --offline audits the env shape alone: no provider is contacted. */
let OFFLINE = false;
const offlineSkip = (what) => {
  if (!OFFLINE) return false;
  skip(`${what} not contacted`, "--offline");
  return true;
};

/**
 * `level` drives the exit code:
 *   required  — the server will not serve traffic without it
 *   group     — optional as a feature, but all-or-nothing within its group
 *   optional  — degrades one thing, documented
 *   forbidden — belongs to the GitHub Pages build or local dev; must never be set here
 */
const CATALOG = [
  { name: "NODE_ENV", level: "required", group: "host", public: true,
    turnsOn: 'The production guard in packages/config/src/env.ts:67 only fires when this is exactly "production".',
    action: 'Set NODE_ENV=production (Vercel and `next start` set it for you).' },
  { name: "DATABASE_URL", level: "required", group: "database", connection: true,
    turnsOn: "Real Postgres. Absent, packages/db/src/client.ts:66 falls back to PGlite on the container's disk — an empty, disposable database per instance.",
    action: "Provision Postgres with pgvector (Neon/Supabase/RDS) and set DATABASE_URL to the POOLED connection string, with ?sslmode=require." },
  { name: "BETTER_AUTH_SECRET", level: "required", group: "host",
    turnsOn: "Session and cookie signing. Under 32 characters fails zod validation at boot.",
    action: "openssl rand -base64 32" },
  { name: "BETTER_AUTH_URL", level: "required", group: "host", public: true,
    turnsOn: "better-auth baseURL: magic-link URLs, the OAuth callback origin, the cookie domain.",
    action: "Set it to your deployed origin, scheme included, no trailing slash and no path." },
  { name: "NEXT_PUBLIC_APP_URL", level: "required", group: "host", public: true,
    turnsOn: "metadataBase/OG tags, robots.txt, sitemap.xml, and the Stripe success/cancel/portal-return URLs. Inlined at build time.",
    action: "Set it to the same origin as BETTER_AUTH_URL, then redeploy — the default is http://localhost:3000 and it never throws." },
  { name: "CRON_SECRET", level: "required", group: "host",
    turnsOn: "Bearer auth on the daily retention job. Unset means every call 401s while apps/web/vercel.json keeps firing it — retention silently never runs.",
    action: "openssl rand -hex 32" },

  { name: "ANTHROPIC_API_KEY", level: "optional", group: "ai",
    turnsOn: "The four LLM routes: /api/ai/organize, summarize, compare, command. Nothing else.",
    action: "console.anthropic.com → Billing (buy credits) → API keys → Create Key." },
  { name: "VOYAGE_API_KEY", level: "optional", group: "embeddings",
    turnsOn: "The whole semantic-search feature, both halves: embedding at ingest and the pgvector query. A SEPARATE vendor from Anthropic.",
    action: "voyageai.com → sign up (own account, own billing) → API Keys → Create." },
  { name: "AI_MODEL_FAST", level: "optional", group: "ai", public: true,
    turnsOn: `Overrides the fast tier (organize, command, insight). Default ${DEFAULT_FAST_MODEL}.`,
    action: "Leave unset unless you need a different model id." },
  { name: "AI_MODEL_SMART", level: "optional", group: "ai", public: true,
    turnsOn: `Overrides the smart tier (summarize, compare). Default ${DEFAULT_SMART_MODEL}.`,
    action: "Leave unset unless you need a different model id." },

  { name: "STRIPE_SECRET_KEY", level: "group", group: "stripe",
    turnsOn: "The Stripe client. Absent, requireStripe() 503s checkout, the portal, and the webhook.",
    action: "dashboard.stripe.com → Developers → API keys. Use sk_test_ until a full test checkout passes." },
  { name: "STRIPE_WEBHOOK_SECRET", level: "group", group: "stripe",
    turnsOn: "Signature verification. The webhook is the only writer of subscription state — without it customers pay and never get Pro.",
    action: "node scripts/go-live.mjs stripe --origin https://<your-origin> prints it on creation." },
  { name: "STRIPE_PRICE_PRO_MONTHLY", level: "group", group: "stripe", public: true,
    turnsOn: "The $8/month price id, and the reverse price-id → interval mapping. Note the PRO infix.",
    action: "node scripts/go-live.mjs stripe" },
  { name: "STRIPE_PRICE_PRO_YEARLY", level: "group", group: "stripe", public: true,
    turnsOn: "The $72/year price id. All four Stripe vars must be present or billing stays off entirely.",
    action: "node scripts/go-live.mjs stripe" },

  { name: "RESEND_API_KEY", level: "optional", group: "email",
    turnsOn: "Magic-link email delivery. Absent in production, nobody can log in by email.",
    action: "resend.com → API Keys, after verifying the sending domain (SPF + DKIM)." },
  { name: "EMAIL_FROM", level: "optional", group: "email", public: true,
    turnsOn: "From address on magic-link emails.",
    action: 'Set it to an address on your verified domain — the built-in default is not a valid email address.' },

  { name: "GOOGLE_CLIENT_ID", level: "group", group: "google", public: true,
    turnsOn: "Google sign-in. Either half alone turns it off; magic link still works.",
    action: "console.cloud.google.com → OAuth consent screen (External) → Credentials → OAuth client (Web), redirect URI <origin>/api/auth/callback/google." },
  { name: "GOOGLE_CLIENT_SECRET", level: "group", group: "google",
    turnsOn: "Paired with GOOGLE_CLIENT_ID.",
    action: "Same Google Cloud credentials screen." },

  { name: "SENTRY_DSN", level: "optional", group: "observability", public: true,
    turnsOn: "Server-side Sentry init and onRequestError capture.",
    action: "sentry.io project → Client Keys (DSN). Optional." },
  { name: "NEXT_PUBLIC_SENTRY_DSN", level: "optional", group: "observability", public: true,
    turnsOn: "Browser-side Sentry. Inlined at BUILD time — adding it later does nothing until you rebuild.",
    action: "Same DSN as SENTRY_DSN, then redeploy. Optional." },
  { name: "POSTHOG_KEY", level: "optional", group: "observability",
    turnsOn: "Forwards first-party events to PostHog in addition to the local events table.",
    action: "posthog.com → project settings → Project API key. Optional." },
  { name: "POSTHOG_HOST", level: "optional", group: "observability", public: true,
    turnsOn: "PostHog ingestion host. Must be a full URL even when overridden.",
    action: "Only set for EU/self-hosted PostHog, e.g. https://eu.i.posthog.com." },

  { name: "THICKET_EXTENSION_IDS", level: "optional", group: "extension", public: true,
    turnsOn: "The CORS + device-linking allowlist. In production it is authoritative INCLUDING when empty: unset means no extension may talk to the API.",
    action: "Set it to the Chrome Web Store extension ID once the store assigns one." },

  { name: "STATIC_EXPORT", level: "forbidden", group: "forbidden", public: true,
    turnsOn: 'Flips next.config.ts to output:"export" and drops the security headers. GitHub Pages only.',
    action: "Remove STATIC_EXPORT from every environment scope — the server build fails with it set." },
  { name: "PAGES_BASE_PATH", level: "forbidden", group: "forbidden", public: true,
    turnsOn: "basePath/assetPrefix for the Pages subpath. Inert on the server build, ruinous if STATIC_EXPORT is ever set alongside it.",
    action: "Remove PAGES_BASE_PATH from every environment scope." },
  { name: "PGLITE_DIR", level: "forbidden", group: "forbidden", public: true,
    turnsOn: "Dev/test only — the WASM Postgres data directory.",
    action: "Remove PGLITE_DIR from every environment scope." },
  { name: "NEXT_PHASE", level: "forbidden", group: "forbidden", public: true,
    turnsOn: "Next sets it during `next build`. Set at runtime it disables the production required-vars guard entirely.",
    action: "Remove NEXT_PHASE — never set it by hand." },
  { name: "LOCAL_ONLY", level: "forbidden", group: "forbidden", public: true,
    turnsOn: "Not an environment variable at all — a derived export in packages/config/src/brand.ts:24. Setting it does nothing.",
    action: "Remove LOCAL_ONLY; STATIC_EXPORT is the only switch." },
];

const byName = new Map(CATALOG.map((v) => [v.name, v]));
const inGroup = (group) => CATALOG.filter((v) => v.group === group);

function report(name) {
  const spec = byName.get(name);
  const value = env[name];
  const isSet = has(name);

  if (spec.level === "forbidden") {
    if (isSet) fail(`${name} is set`, spec.public ? `= ${value}` : "", spec.action);
    else ok(`${name} absent`, "as it must be");
    return isSet;
  }
  if (isSet) {
    const shown = spec.connection ? maskConnectionString(value) : spec.public ? value : mask(value);
    present(name, shown);
    return true;
  }
  if (spec.level === "required") fail(`${name} missing`, spec.turnsOn, spec.action);
  else skip(`${name} not set`, spec.turnsOn);
  return false;
}

/* ── shared helpers ────────────────────────────────────────────────────── */

/** `pg` and `stripe` live in package-local node_modules under pnpm, not the root. */
async function importFrom(pkgDir, specifier) {
  const require = createRequire(path.join(ROOT, pkgDir, "package.json"));
  const resolved = require.resolve(specifier);
  const mod = await import(`file://${resolved}`);
  return mod.default ?? mod;
}

function bareOrigin(name) {
  const raw = env[name];
  if (!raw) return null;
  let u;
  try {
    u = new URL(raw);
  } catch {
    fail(`${name} is not an absolute URL`, `= ${raw}`, `Set ${name} to a full origin including https://`);
    return null;
  }
  if (u.protocol !== "https:" && u.hostname !== "localhost") {
    fail(`${name} is not https`, `= ${raw}`, `Serve over https and set ${name} accordingly`);
  }
  if (u.pathname !== "/") {
    fail(`${name} carries a path`, `= ${u.pathname}`,
      `Drop the path from ${name} — the Stripe routes concatenate paths onto it`);
  }
  if (raw.endsWith("/")) {
    fail(`${name} has a trailing slash`, "",
      `Remove the trailing slash from ${name} — checkout builds \`\${NEXT_PUBLIC_APP_URL}/app/settings\``);
  }
  return u;
}

async function timedFetch(url, options = {}, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ── check: host + auth ────────────────────────────────────────────────── */

function checkHost() {
  section("1. Host — the Next.js server (Vercel, Fly, Railway, any Node 20.9+ box)");
  for (const spec of inGroup("host")) report(spec.name);

  if (has("NODE_ENV") && env.NODE_ENV !== "production") {
    fail("NODE_ENV is not production", `= ${env.NODE_ENV}`,
      "Set NODE_ENV=production — any other value disables the required-vars guard and boots the app with a dev auth secret");
  }
  if (has("BETTER_AUTH_SECRET") && env.BETTER_AUTH_SECRET.length < 32) {
    fail("BETTER_AUTH_SECRET is shorter than 32 characters", `${env.BETTER_AUTH_SECRET.length} chars`,
      "Regenerate with openssl rand -base64 32 — zod rejects it at boot");
  }

  const app = bareOrigin("NEXT_PUBLIC_APP_URL");
  const auth = bareOrigin("BETTER_AUTH_URL");
  if (app && auth && app.origin !== auth.origin) {
    fail("BETTER_AUTH_URL and NEXT_PUBLIC_APP_URL are different origins", `${auth.origin} vs ${app.origin}`,
      "Point both at the same origin — otherwise Stripe returns customers to a host they are not signed in on and Google's redirect URI stops matching");
  }
  if (app && app.hostname === "localhost") {
    fail("NEXT_PUBLIC_APP_URL is still localhost", `= ${app.origin}`,
      "Set it to the deployed origin and redeploy — it is inlined at build time into OG tags, the sitemap and the Stripe redirects");
  }

  section("   Extension access");
  if (has("THICKET_EXTENSION_IDS")) {
    report("THICKET_EXTENSION_IDS");
    const ids = env.THICKET_EXTENSION_IDS.split(",").map((s) => s.trim()).filter(Boolean);
    const bad = ids.filter((id) => !/^[a-p]{32}$/.test(id));
    if (bad.length > 0) {
      warn("extension id does not look like a Chrome id", bad.join(", "),
        "Chrome IDs are 32 characters, a–p only. A typo here CORS-blocks the extension in production");
    } else ok(`${ids.length} extension id(s) allowlisted`);
  } else {
    warn("THICKET_EXTENSION_IDS not set", "the allowlist is authoritative in production, including when empty",
      "Set it to the store-assigned extension ID, or the extension will work against localhost and appear broken against production");
  }

  section("   Must NOT be set on a server deployment");
  for (const spec of inGroup("forbidden")) report(spec.name);
}

/* ── check: database ───────────────────────────────────────────────────── */

async function checkDatabase(urlOverride) {
  section("2. Database — managed Postgres with pgvector");
  const url = urlOverride ?? env.DATABASE_URL;
  if (urlOverride) present("DATABASE_URL", `${maskConnectionString(url)} (--url override)`);
  else if (!report("DATABASE_URL")) return;

  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  if (!/-pooler\.|pgbouncer|pooler\./.test(host) && !/pgbouncer=true/.test(url)) {
    // client.ts:45 opens `new Pool({ max: 10 })` per instance and serverless
    // fans out — a direct endpoint exhausts the provider's connection limit.
    warn("DATABASE_URL does not look like a pooled endpoint", host,
      "Use the provider's POOLED connection string for the app (Neon: the -pooler host). Keep the direct URL for `migrate` only");
  }
  if (!/sslmode=|ssl=true/.test(url)) {
    warn("DATABASE_URL requests no TLS", "packages/db passes no ssl option, so TLS must come from the URL",
      "Append ?sslmode=require to DATABASE_URL");
  }

  if (offlineSkip("Postgres")) return;

  let pg;
  try {
    pg = await importFrom("packages/db", "pg");
  } catch (error) {
    warn("could not load `pg` from packages/db/node_modules", error.message,
      "Run pnpm install at the repo root, then re-run check");
    return;
  }

  const pool = new pg.Pool({ connectionString: url, max: 2, connectionTimeoutMillis: 10000 });
  try {
    const ext = await pool.query(
      "select extversion, n.nspname as schema from pg_extension e join pg_namespace n on n.oid = e.extnamespace where e.extname = 'vector'",
    );
    if (ext.rowCount === 0) {
      fail("pgvector is not installed", "",
        "Run node scripts/go-live.mjs migrate — the extension is created by the migrate runner (packages/db/src/migrate.ts:12), not by the SQL migration");
    } else {
      ok(`pgvector ${ext.rows[0].extversion}`, `schema "${ext.rows[0].schema}"`);
    }

    const tables = await pool.query(
      "select count(*)::int as n from information_schema.tables where table_schema = 'public' and table_name = any($1)",
      [EXPECTED_TABLES],
    );
    if (tables.rows[0].n !== EXPECTED_TABLES.length) {
      fail(`only ${tables.rows[0].n} of ${EXPECTED_TABLES.length} tables present`, "",
        "Run node scripts/go-live.mjs migrate — migrations are not applied at deploy time, and an unmigrated database boots fine and fails at first query");
    } else {
      ok(`all ${EXPECTED_TABLES.length} tables present`);
    }

    const col = await pool.query(
      `select format_type(a.atttypid, a.atttypmod) as type
         from pg_attribute a
         join pg_class c on c.oid = a.attrelid
         join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'page_record' and a.attname = 'embedding' and a.attnum > 0`,
    );
    if (col.rowCount === 0) {
      fail("page_record.embedding is missing", "", "Run node scripts/go-live.mjs migrate");
    } else if (col.rows[0].type !== `vector(${EMBEDDING_DIMENSIONS})`) {
      fail(`page_record.embedding is ${col.rows[0].type}`, `expected vector(${EMBEDDING_DIMENSIONS})`,
        "The column and the Voyage output_dimension must agree or every embedding insert throws");
    } else {
      ok(`page_record.embedding is vector(${EMBEDDING_DIMENSIONS})`);
    }

    // Supabase ships pgvector in the `extensions` schema, so the pg_extension
    // row can exist while `::vector` still fails to resolve for this role.
    try {
      const probe = await pool.query("select ($1::vector <=> $2::vector) as d", [
        JSON.stringify(Array(EMBEDDING_DIMENSIONS).fill(0.1)),
        JSON.stringify(Array(EMBEDDING_DIMENSIONS).fill(0.2)),
      ]);
      ok("'<=>' cosine operator resolves", `d=${Number(probe.rows[0].d).toFixed(4)}`);
    } catch (error) {
      fail("'<=>' cosine operator failed", error.message,
        "The vector type is not on this role's search_path — semantic search will 500. On Supabase, add `extensions` to the role's search_path");
    }

    const journal = await pool.query(
      "select count(*)::int as n from information_schema.tables where table_schema = 'drizzle' and table_name = '__drizzle_migrations'",
    );
    if (journal.rows[0].n === 0) {
      fail("drizzle.__drizzle_migrations is missing", "the migrator never ran against this database",
        "Run node scripts/go-live.mjs migrate");
    } else {
      const applied = await pool.query("select count(*)::int as n from drizzle.__drizzle_migrations");
      ok(`${applied.rows[0].n} migration(s) recorded`);
    }
  } catch (error) {
    fail("could not query the database", error.message,
      "Check the connection string, the network allowlist, and that the role can read information_schema");
  } finally {
    await pool.end().catch(() => {});
  }
}

/* ── check: AI + embeddings (two vendors) ──────────────────────────────── */

async function checkAnthropicModel(key, model, label) {
  const response = await timedFetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: 16, messages: [{ role: "user", content: "ping" }] }),
  });
  if (response.ok) {
    ok(`${label} tier reachable`, model);
    return;
  }
  const body = (await response.text().catch(() => "")).slice(0, 200);
  fail(`${label} tier rejected (HTTP ${response.status})`, `${model}: ${body}`,
    response.status === 400 && /credit/i.test(body)
      ? "Buy credits at console.anthropic.com → Billing — a new organization starts at $0 and every /api/ai/* call 400s"
      : `Confirm the key can reach ${model}, or override it with ${label === "fast" ? "AI_MODEL_FAST" : "AI_MODEL_SMART"}`);
}

async function checkAi() {
  section("3. Anthropic — the four LLM routes (organize, summarize, compare, command)");
  for (const spec of inGroup("ai")) report(spec.name);

  if (!has("ANTHROPIC_API_KEY")) {
    skip("no live test", "/api/ai/* returns 503 ai-unavailable; /api/capabilities reports ai:false");
    return;
  }
  if (offlineSkip("Anthropic")) return;

  const key = env.ANTHROPIC_API_KEY;
  try {
    await checkAnthropicModel(key, env.AI_MODEL_FAST ?? DEFAULT_FAST_MODEL, "fast");
    await checkAnthropicModel(key, env.AI_MODEL_SMART ?? DEFAULT_SMART_MODEL, "smart");
  } catch (error) {
    fail("could not reach api.anthropic.com", error.message, "Check outbound network access");
  }
}

async function checkEmbeddings() {
  section("4. Voyage AI — semantic search. A SEPARATE SIGNUP from Anthropic");
  for (const spec of inGroup("embeddings")) report(spec.name);

  if (!has("VOYAGE_API_KEY")) {
    skip("no live test", "search falls back to lexical and answers semantic:false");
    // Anthropic is not involved in the search path at all, so an operator who
    // signed up once reasonably assumes semantic search is covered. It is not.
    if (has("ANTHROPIC_API_KEY")) {
      const detail = "the search path never touches the Anthropic key — packages/ai/src/embeddings.ts:70 reads VOYAGE_API_KEY and nothing else";
      const action = "Sign up separately at voyageai.com and set VOYAGE_API_KEY *before* the first user syncs — embeddings are written only at ingest and no backfill exists, so pages synced without this key stay permanently unsearchable";
      if (isBillingConfigured()) fail("Anthropic is configured but Voyage is not", detail, action);
      else warn("Anthropic is configured but Voyage is not", detail, action);
    }
    return;
  }
  if (offlineSkip("Voyage")) return;

  try {
    const response = await timedFetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${env.VOYAGE_API_KEY}` },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: ["thicket go-live configuration check"],
        input_type: "query",
        output_dimension: EMBEDDING_DIMENSIONS,
      }),
    });
    if (!response.ok) {
      const body = (await response.text().catch(() => "")).slice(0, 200);
      fail(`VOYAGE_API_KEY rejected (HTTP ${response.status})`, body,
        "Fix the key now — at runtime this exact error is swallowed by search/route.ts:146, so a dead key looks identical to no key at all");
      return;
    }
    const dims = (await response.json())?.data?.[0]?.embedding?.length;
    if (dims === EMBEDDING_DIMENSIONS) {
      ok(`${VOYAGE_MODEL} returns ${dims}-dim vectors`, `matches vector(${EMBEDDING_DIMENSIONS})`);
    } else {
      fail(`${VOYAGE_MODEL} returned ${dims} dimensions`, `page_record.embedding is vector(${EMBEDDING_DIMENSIONS})`,
        "Every embedding insert would throw. Keep the model at voyage-3.5-lite, or migrate the column and both 1024 constants together");
    }
  } catch (error) {
    fail("could not reach api.voyageai.com", error.message, "Check outbound network access");
  }
}

/* ── check: Stripe ─────────────────────────────────────────────────────── */

function isBillingConfigured() {
  return inGroup("stripe").every((spec) => has(spec.name));
}

async function stripeGet(key, url) {
  const response = await timedFetch(url, {
    headers: { authorization: `Bearer ${key}`, "stripe-version": STRIPE_API_VERSION },
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function checkStripe(origin) {
  section("5. Stripe — subscription billing for Thicket Pro");
  for (const spec of inGroup("stripe")) report(spec.name);

  const configured = inGroup("stripe").filter((spec) => has(spec.name));
  if (configured.length === 0) {
    skip("billing is off", "the pricing page renders, upgrade reports billing isn't configured");
    return;
  }
  if (configured.length < 4) {
    // requireStripe() checks the key AND both price ids together, so a partial
    // set disables checkout, the portal and the webhook alike.
    fail("Stripe is partially configured", `have ${configured.map((s) => s.name).join(", ")}`,
      "Set all four Stripe variables or none — billing is all-or-nothing, and the names carry a PRO infix (STRIPE_PRICE_PRO_MONTHLY, not STRIPE_PRICE_MONTHLY)");
  }

  const key = env.STRIPE_SECRET_KEY;
  if (!key) return;
  if (offlineSkip("Stripe")) return;
  const live = key.startsWith("sk_live_");
  say(`  ${dim(live ? "mode: LIVE" : "mode: test")}`);

  try {
    const { response, body } = await stripeGet(key, "https://api.stripe.com/v1/account");
    if (!response.ok) {
      fail(`STRIPE_SECRET_KEY rejected (HTTP ${response.status})`, body?.error?.message ?? "",
        "Copy the secret key again from Developers → API keys");
      return;
    }
    ok("STRIPE_SECRET_KEY accepted", `account ${body.id}${body.charges_enabled ? "" : ", charges NOT enabled"}`);
    if (live && !body.charges_enabled) {
      fail("the Stripe account cannot accept charges yet", "",
        "Finish activation (business details, bank account, tax ID) in the Stripe Dashboard");
    }
  } catch (error) {
    fail("could not reach api.stripe.com", error.message, "Check outbound network access");
    return;
  }

  for (const [name, cents, interval] of [
    ["STRIPE_PRICE_PRO_MONTHLY", MONTHLY_CENTS, "month"],
    ["STRIPE_PRICE_PRO_YEARLY", YEARLY_CENTS, "year"],
  ]) {
    if (!has(name)) continue;
    const id = env[name];
    const { response, body } = await stripeGet(key, `https://api.stripe.com/v1/prices/${encodeURIComponent(id)}`);
    if (!response.ok) {
      fail(`${name} does not resolve`, `${id}: ${body?.error?.message ?? response.status}`,
        "Run node scripts/go-live.mjs stripe and paste the printed price ids. A live key cannot see test-mode prices");
      continue;
    }
    const problems = [];
    if (!body.active) problems.push("archived");
    if (body.unit_amount !== cents) problems.push(`unit_amount ${body.unit_amount}, expected ${cents}`);
    if (body.currency !== "usd") problems.push(`currency ${body.currency}`);
    if (body.recurring?.interval !== interval) problems.push(`interval ${body.recurring?.interval}, expected ${interval}`);
    if (problems.length > 0) {
      fail(`${name} does not match the plan`, problems.join(", "),
        "Stripe prices are immutable — create a new price and move the lookup_key, then update the env value");
    } else {
      ok(`${name} is $${(cents / 100).toFixed(2)}/${interval}`, id);
    }
  }

  if (!has("STRIPE_WEBHOOK_SECRET")) {
    fail("STRIPE_WEBHOOK_SECRET is missing", "the webhook is the only writer of subscription state",
      "Without it customers are charged and never receive Pro. Run node scripts/go-live.mjs stripe --origin <origin>, or reveal the secret in the Dashboard");
  }

  if (origin) {
    const wanted = `${origin.replace(/\/$/, "")}${WEBHOOK_PATH}`;
    const { response, body } = await stripeGet(key, "https://api.stripe.com/v1/webhook_endpoints?limit=100");
    if (!response.ok) {
      warn("could not list webhook endpoints", body?.error?.message ?? response.status);
    } else {
      const endpoint = (body.data ?? []).find((e) => e.url === wanted);
      if (!endpoint) {
        fail("no webhook endpoint points at this deployment", wanted,
          `Run node scripts/go-live.mjs stripe --origin ${origin}`);
      } else {
        const missing = WEBHOOK_EVENTS.filter((e) => !endpoint.enabled_events.includes(e));
        if (endpoint.status !== "enabled") {
          fail("the webhook endpoint is disabled", endpoint.id, "Re-enable it in the Dashboard");
        } else if (missing.length > 0) {
          fail("the webhook endpoint is missing events", missing.join(", "),
            `Run node scripts/go-live.mjs stripe --origin ${origin} to sync the event list`);
        } else {
          ok("webhook endpoint subscribed to all four events", endpoint.id);
        }
        if (endpoint.api_version && endpoint.api_version !== STRIPE_API_VERSION) {
          warn("the webhook endpoint pins a different API version",
            `${endpoint.api_version} vs the client's ${STRIPE_API_VERSION}`,
            "Event payloads can arrive shaped differently than the code expects — recreate the endpoint with the pinned version");
        }
      }
    }
  } else {
    skip("webhook endpoint not checked", "pass --origin https://<host> to verify it");
  }

  say(`  ${dim("manual, and the API cannot do it for you:")}`);
  say(`  ${dim("  · Settings → Billing → Customer portal: activate a configuration, or every 'Manage billing' click errors")}`);
  say(`  ${dim("  · Settings → Tax: origin address + registrations, since checkout sends automatic_tax: enabled")}`);
  say(`  ${dim("  · Settings → Billing: invoice/receipt emails on, dunning set to cancel after retries")}`);
}

/* ── check: email, Google, observability ───────────────────────────────── */

async function checkEmail() {
  section("6. Email — magic-link delivery via Resend");
  for (const spec of inGroup("email")) report(spec.name);

  if (!has("RESEND_API_KEY")) {
    skip("no live test", "in production, nobody can log in by email");
    return;
  }
  if (!has("EMAIL_FROM") || env.EMAIL_FROM === DEFAULT_EMAIL_FROM || env.EMAIL_FROM.includes("github.io")) {
    fail("EMAIL_FROM is still the built-in default", DEFAULT_EMAIL_FROM,
      "That is not a valid email address. Set EMAIL_FROM to an address on your Resend-verified domain");
  }
  if (offlineSkip("Resend")) return;

  try {
    const response = await timedFetch("https://api.resend.com/domains", {
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}` },
    });
    if (!response.ok) {
      fail(`RESEND_API_KEY rejected (HTTP ${response.status})`, "", "Regenerate the key at resend.com → API Keys");
      return;
    }
    const domains = (await response.json())?.data ?? [];
    const verified = domains.filter((d) => d.status === "verified").map((d) => d.name);
    if (verified.length === 0) {
      fail("no verified sending domain on this Resend account", "",
        "Verify your domain (SPF + DKIM) — unverified domains cannot send, so magic links never arrive");
    } else {
      ok("RESEND_API_KEY accepted", `verified: ${verified.join(", ")}`);
    }
  } catch (error) {
    fail("could not reach api.resend.com", error.message, "Check outbound network access");
  }
}

function checkGoogle() {
  section("7. Google sign-in (optional — magic link works without it)");
  const configured = inGroup("google").filter((spec) => has(spec.name));
  for (const spec of inGroup("google")) report(spec.name);
  if (configured.length === 1) {
    fail("Google OAuth is half-configured", `only ${configured[0].name} is set`,
      "Set both GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or neither — either alone leaves socialProviders empty and hides the button");
  } else if (configured.length === 2 && !env.GOOGLE_CLIENT_ID.endsWith(".apps.googleusercontent.com")) {
    warn("GOOGLE_CLIENT_ID does not look like a Google client id", "",
      "Expected a value ending in .apps.googleusercontent.com");
  }
}

function checkObservability() {
  section("8. Observability (all optional)");
  for (const spec of inGroup("observability")) report(spec.name);
  if (has("SENTRY_DSN") && !has("NEXT_PUBLIC_SENTRY_DSN")) {
    warn("server Sentry is on but browser Sentry is not", "",
      "Set NEXT_PUBLIC_SENTRY_DSN and redeploy — it is inlined at build time, not read at runtime");
  }
  if (has("POSTHOG_HOST")) {
    try {
      new URL(env.POSTHOG_HOST);
    } catch {
      fail("POSTHOG_HOST is not an absolute URL", env.POSTHOG_HOST, "Use a full URL, e.g. https://eu.i.posthog.com");
    }
  }
}

/* ── check: live deployment probes ─────────────────────────────────────── */

async function probeDeployment(origin) {
  section(`9. Live deployment — ${origin}`);
  let caps;
  try {
    caps = await timedFetch(new URL("/api/capabilities", origin));
  } catch (error) {
    warn("the origin is not reachable", error.message, "Deploy first, then re-run check with --origin");
    return;
  }
  if (!caps.ok) {
    fail(`/api/capabilities returned HTTP ${caps.status}`, "", "The server is up but not healthy — check the deploy logs");
    return;
  }
  const body = await caps.json().catch(() => ({}));
  ok("/api/capabilities responds", JSON.stringify(body));
  if (body.accounts !== true) {
    fail("capabilities reports accounts:false", "", "This is not a server build");
  }

  // next.config.ts attaches these headers only when STATIC_EXPORT is unset, so
  // their presence is the proof that the Pages flag did not leak into the build.
  if (caps.headers.get("x-frame-options") === "DENY" && caps.headers.get("x-content-type-options") === "nosniff") {
    ok("security headers present", "confirms the server build, not the static export");
  } else {
    fail("security headers missing", "x-frame-options / x-content-type-options",
      "STATIC_EXPORT leaked into the build, or a proxy is stripping headers");
  }

  try {
    const cron = await timedFetch(new URL("/api/cron/retention", origin));
    if (cron.status === 401) ok("/api/cron/retention rejects unauthenticated calls");
    else fail(`/api/cron/retention returned HTTP ${cron.status} unauthenticated`, "expected 401",
      "The retention endpoint deletes rows — it must fail closed");
  } catch (error) {
    warn("could not probe /api/cron/retention", error.message);
  }
  // The authenticated call is deliberately not made: it deletes expired rows.
  skip("authenticated cron call skipped", "it performs real deletions — trigger it from your scheduler instead");
}

/* ── subcommands ───────────────────────────────────────────────────────── */

async function commandCheck(options) {
  const origin = options.origin ?? (has("NEXT_PUBLIC_APP_URL") ? env.NEXT_PUBLIC_APP_URL : null);
  const probeOrigin = origin && !/localhost|127\.0\.0\.1/.test(origin) ? origin.replace(/\/$/, "") : null;

  OFFLINE = options.offline;
  say(bold("Thicket go-live check"));
  say(dim(`workspace: ${ROOT}`));
  const configured = CATALOG.filter((v) => v.level !== "forbidden" && has(v.name)).length;
  if (configured === 0) {
    say(dim("nothing is configured yet — everything below is your to-do list"));
  }

  checkHost();
  await checkDatabase(options.url);
  await checkAi();
  await checkEmbeddings();
  await checkStripe(options.offline ? null : probeOrigin);
  await checkEmail();
  checkGoogle();
  checkObservability();
  if (probeOrigin && !options.offline) await probeDeployment(probeOrigin);
  else {
    section("9. Live deployment");
    skip("not probed", "pass --origin https://<host> once the server is deployed");
  }

  section("Summary");
  const tally = failures.length === 0 ? green("0 failures") : red(plural(failures.length, "failure"));
  say(`  ${tally}, ${plural(warnings.length, "warning")}`);
  if (todo.length > 0) {
    say("");
    say(bold("Next actions, in order"));
    todo.forEach((action, i) => say(`  ${String(i + 1).padStart(2)}. ${action}`));
  }
  say("");
  say(dim("commands:  node scripts/go-live.mjs stripe --origin https://<host>   ·   node scripts/go-live.mjs migrate"));
  return failures.length === 0 ? 0 : 1;
}

function commandStripe(options) {
  const script = path.join(ROOT, "apps", "web", "scripts", "stripe-setup.mjs");
  if (!existsSync(script)) {
    say(red(`missing ${script}`));
    return 1;
  }
  if (!has("STRIPE_SECRET_KEY")) {
    say(red("STRIPE_SECRET_KEY is not set."));
    say("Get it from dashboard.stripe.com → Developers → API keys, then:");
    say(`  STRIPE_SECRET_KEY=sk_test_… node scripts/go-live.mjs stripe --origin https://<host>`);
    return 1;
  }
  const origin = options.origin ?? (has("NEXT_PUBLIC_APP_URL") ? env.NEXT_PUBLIC_APP_URL : undefined);
  if (!origin) {
    say(yellow("No --origin given: the product and prices will be created, but not the webhook endpoint."));
    say(yellow("Without STRIPE_WEBHOOK_SECRET, customers can pay and never receive Pro."));
  }
  say(dim(`key ${mask(env.STRIPE_SECRET_KEY)}${origin ? `, origin ${origin}` : ""}`));
  say("");
  // `stripe` is a dependency of apps/web only, so the child must run from there.
  const result = spawnSync(process.execPath, [script], {
    cwd: path.join(ROOT, "apps", "web"),
    stdio: "inherit",
    env: { ...env, ...(origin ? { APP_ORIGIN: origin } : {}) },
  });
  return result.status ?? 1;
}

async function commandMigrate(options) {
  const url = options.url ?? env.DATABASE_URL;
  say(bold("Thicket migrate"));
  if (!url) {
    say(red("DATABASE_URL is not set."));
    say("");
    say("Nothing in the migrate path loads a .env file, so it must be a real shell variable —");
    say("a DATABASE_URL that lives only in apps/web/.env.local silently migrates the local");
    say("PGlite directory instead of your cloud database, and still prints success.");
    say("");
    say('  DATABASE_URL="postgres://…?sslmode=require" node scripts/go-live.mjs migrate');
    return 1;
  }
  if (!existsSync(path.join(ROOT, "pnpm-workspace.yaml"))) {
    say(red("Run this from a repo checkout."));
    say("packages/db/src/paths.ts finds the migration SQL by walking up to pnpm-workspace.yaml;");
    say("inside a deployed bundle it falls back to cwd and migrates nothing.");
    return 1;
  }

  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return "";
    }
  })();
  say(dim(`target: ${maskConnectionString(url)}`));
  if (/-pooler\.|pgbouncer|pooler\./.test(host) || /pgbouncer=true/.test(url)) {
    // CREATE EXTENSION plus drizzle's migration transaction are safer on the
    // direct endpoint; the app still wants the pooled one.
    say(yellow("This looks like a transaction-pooling endpoint."));
    say(yellow("Prefer the provider's DIRECT url here: node scripts/go-live.mjs migrate --url \"postgres://…\""));
  }
  say("");

  const result = spawnSync("pnpm", ["--filter", "@thicket/db", "migrate"], {
    cwd: ROOT,
    stdio: "inherit",
    env: { ...env, DATABASE_URL: url },
  });
  if (result.error) {
    say(red(`could not run pnpm: ${result.error.message}`));
    return 1;
  }
  if (result.status !== 0) return result.status ?? 1;

  say("");
  say(bold("Verifying"));
  await checkDatabase(url);
  say("");
  say(`  ${failures.length === 0 ? green("schema verified") : red(plural(failures.length, "problem"))}`);
  return failures.length === 0 ? 0 : 1;
}

/* ── entry ─────────────────────────────────────────────────────────────── */

const USAGE = `Thicket go-live tooling

  node scripts/go-live.mjs check   [--origin https://host] [--url postgres://…] [--offline]
  node scripts/go-live.mjs stripe  [--origin https://host]
  node scripts/go-live.mjs migrate [--url postgres://…]

  check     audit every environment variable the code reads, and live-test the ones that are set
  stripe    idempotently create the Thicket Pro product, both prices, and the webhook endpoint
  migrate   apply migrations (and the pgvector extension) to DATABASE_URL, then verify the schema

  --origin  the deployed origin, for webhook and live-endpoint checks
  --url     a Postgres url that overrides DATABASE_URL (use the DIRECT url for migrate)
  --offline skip all network calls in check
`;

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        origin: { type: "string" },
        url: { type: "string" },
        offline: { type: "boolean", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (error) {
    say(red(error.message));
    say(USAGE);
    return 2;
  }
  const command = parsed.positionals[0] ?? "check";
  if (parsed.values.help) {
    say(USAGE);
    return 0;
  }
  const options = {
    origin: parsed.values.origin?.replace(/\/$/, ""),
    url: parsed.values.url,
    offline: parsed.values.offline,
  };

  switch (command) {
    case "setup": {
      const { runSetup } = await import("./setup.mjs");
      return runSetup(ROOT);
    }
    case "check":
      return commandCheck(options);
    case "stripe":
      return commandStripe(options);
    case "migrate":
      return commandMigrate(options);
    default:
      say(red(`unknown command: ${command}`));
      say(USAGE);
      return 2;
  }
}

process.exitCode = await main();
