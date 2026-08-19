/**
 * Guided setup. Asks one question at a time, opens the page you need at the
 * moment you need it, validates each value before moving on, and writes to
 * apps/web/.env.local as it goes so quitting halfway never loses progress.
 *
 * Values go from the terminal straight into the file — nothing here prints a
 * secret back, so a shoulder-surfer and a scrollback both stay clean.
 */
import { createInterface } from "node:readline/promises";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const ESC = "\x1b[";
const BOLD = `${ESC}1m`;
const DIM = `${ESC}2m`;
const GREEN = `${ESC}32m`;
const YELLOW = `${ESC}33m`;
const RESET = `${ESC}0m`;

const say = (s = "") => process.stdout.write(`${s}\n`);
const ok = (s) => say(`  ${GREEN}✓${RESET} ${s}`);
const note = (s) => say(`  ${DIM}${s}${RESET}`);

/** Best effort — a headless box just gets the URL printed instead. */
function openUrl(url) {
  const cmd =
    process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  try {
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
    return true;
  } catch {
    return false;
  }
}

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && m[2].trim()) out[m[1]] = m[2];
  }
  return out;
}

/** Rewrites one key in place so the file's comments and ordering survive. */
function writeEnvValue(path, key, value) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = existsSync(path) ? readFileSync(path, "utf8").split("\n") : [];
  const i = lines.findIndex((l) => l.startsWith(`${key}=`));
  if (i >= 0) lines[i] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
  writeFileSync(path, lines.join("\n"), "utf8");
}

const STEPS = [
  {
    key: "BETTER_AUTH_SECRET",
    title: "Session signing key",
    why: "Signs login cookies. No signup needed — I'll generate it.",
    generate: () => randomBytes(32).toString("base64"),
  },
  {
    key: "CRON_SECRET",
    title: "Cron secret",
    why: "Protects the nightly cleanup job. No signup needed — I'll generate it.",
    generate: () => randomBytes(32).toString("hex"),
  },
  {
    key: "DATABASE_URL",
    title: "Database",
    why: "Stores accounts, workspaces, and tab history.",
    url: "https://console.neon.tech/signup",
    instructions: [
      "Sign in with GitHub. No card, no ID.",
      "Create a project — any name, any region near you.",
      'Copy the string labelled "Pooled connection".',
      "It starts with postgresql:// and its host contains -pooler.",
    ],
    validate: (v) => {
      if (!/^postgres(ql)?:\/\//.test(v)) {
        return "That doesn't look like a Postgres URL — it should start with postgresql://";
      }
      if (!/-pooler|pooler|pgbouncer/.test(v)) {
        return "That looks like the DIRECT string. Use the POOLED one (host contains -pooler), or serverless will exhaust the connection limit.";
      }
      return null;
    },
  },
  {
    key: "ANTHROPIC_API_KEY",
    title: "Anthropic",
    why: "Powers AI summaries, comparisons, and the command box.",
    url: "https://console.anthropic.com/settings/keys",
    instructions: [
      "You already have an account — just sign in.",
      "First: Settings → Billing → add a card and buy credits.",
      "  A new org starts at $0, and every AI call fails on an empty balance.",
      "Then: Settings → API keys → Create Key.",
      "Copy it immediately — it is never shown again.",
    ],
    validate: (v) => (v.startsWith("sk-ant-") ? null : "Anthropic keys start with sk-ant-"),
  },
  {
    key: "VOYAGE_API_KEY",
    title: "Voyage AI",
    why: "Powers semantic search. A SEPARATE company from Anthropic — your Anthropic login will not work here.",
    url: "https://dashboard.voyageai.com/",
    instructions: [
      "Sign up. Separate account, separate login, separate billing.",
      "API Keys → Create new secret key.",
      "Free for the first 200M tokens, so no card to start.",
    ],
    validate: (v) => (v.startsWith("pa-") ? null : "Voyage keys start with pa-"),
  },
  {
    key: "STRIPE_SECRET_KEY",
    title: "Stripe",
    why: "Takes the payments. Test mode works right now — you do not need to finish business verification yet.",
    url: "https://dashboard.stripe.com/test/apikeys",
    instructions: [
      'Check that the "Test mode" toggle (top right) is ON.',
      'Under "Standard keys", find Secret key and click "Reveal test key".',
      "Copy it. It starts with sk_test_.",
    ],
    validate: (v) => {
      if (v.startsWith("sk_live_")) {
        return "That's a LIVE key. Use the test key (sk_test_) until you've run the whole flow end to end.";
      }
      return v.startsWith("sk_test_") ? null : "Stripe test keys start with sk_test_";
    },
  },
];

export async function runSetup(workspace) {
  const envPath = join(workspace, "apps/web/.env.local");
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  /**
   * Ctrl-C, Ctrl-D, or a piped stdin that runs dry closes readline, and an
   * outstanding question() would otherwise never settle — the process hangs
   * with the prompt still on screen. Treat a closed input as "stop here";
   * everything answered so far is already written to disk.
   */
  let inputClosed = false;
  const closedSignal = new Promise((resolve) => {
    rl.once("close", () => {
      inputClosed = true;
      resolve(null);
    });
  });
  const ask = (prompt) => {
    if (inputClosed) return Promise.resolve(null);
    // Race, don't await: close fires *after* question() is already pending.
    return Promise.race([rl.question(prompt).catch(() => null), closedSignal]);
  };

  say();
  say(`${BOLD}Thicket setup${RESET}`);
  say(`Six questions. I'll open each page when we get to it.`);
  say(`Paste the value and press Enter — or press Enter alone to skip it for now.`);
  say(`${DIM}Everything saves to apps/web/.env.local, which git ignores.${RESET}`);

  const already = readEnvFile(envPath);
  let configured = 0;
  let skipped = 0;

  for (const [index, step] of STEPS.entries()) {
    say();
    say(`${BOLD}${index + 1}/${STEPS.length}  ${step.title}${RESET}`);
    say(`  ${step.why}`);

    if (already[step.key]) {
      ok("already set — leaving it alone");
      configured += 1;
      continue;
    }

    if (step.generate) {
      writeEnvValue(envPath, step.key, step.generate());
      ok("generated and saved");
      configured += 1;
      continue;
    }

    say();
    for (const line of step.instructions) note(line);
    note(openUrl(step.url) ? `opening ${step.url}` : `open this: ${step.url}`);

    for (;;) {
      say();
      const answer = await ask(`  paste here (or Enter to skip) › `);
      if (answer === null) {
        say();
        say(`  ${DIM}stopping here — everything you entered is saved${RESET}`);
        skipped += STEPS.length - index;
        break;
      }
      const value = answer.trim();
      if (!value) {
        say(`  ${YELLOW}skipped${RESET} — run setup again when you have it`);
        skipped += 1;
        break;
      }
      const problem = step.validate?.(value);
      if (problem) {
        say(`  ${YELLOW}${problem}${RESET}`);
        continue;
      }
      writeEnvValue(envPath, step.key, value);
      ok("saved");
      configured += 1;
      break;
    }
    if (inputClosed) break;
  }

  rl.close();

  say();
  say(
    `${BOLD}${configured} of ${STEPS.length} configured${RESET}` +
      (skipped ? `, ${skipped} left to do` : ""),
  );
  say();
  if (skipped > 0) {
    say(`Run setup again whenever you're ready — it skips what's already done:`);
    say(`  ${BOLD}node scripts/go-live.mjs setup${RESET}`);
  } else {
    say(`Now create the subscription product in your Stripe account:`);
    say(`  ${BOLD}node --env-file=apps/web/.env.local scripts/go-live.mjs stripe${RESET}`);
    say();
    say(`Then create the database tables:`);
    say(`  ${BOLD}node --env-file=apps/web/.env.local scripts/go-live.mjs migrate${RESET}`);
  }
  say();
  say(
    `To see where everything stands: ${BOLD}node --env-file=apps/web/.env.local scripts/go-live.mjs check${RESET}`,
  );
  say();
  return 0;
}
