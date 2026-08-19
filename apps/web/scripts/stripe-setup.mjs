#!/usr/bin/env node
/**
 * Idempotent Stripe bootstrap for Thicket Pro.
 *
 * Creates (or reuses) the "Thicket Pro" product and its monthly + yearly
 * recurring prices, then prints the env lines to paste into your deployment.
 * Safe to run repeatedly: the product uses a fixed id, and the prices are
 * looked up by lookup_key before anything is created.
 *
 *   STRIPE_SECRET_KEY=sk_test_... node apps/web/scripts/stripe-setup.mjs
 *
 * Optionally pass APP_ORIGIN=https://your-host to also create the webhook
 * endpoint and print STRIPE_WEBHOOK_SECRET (only ever shown at creation).
 *
 * Run it from apps/web (or via `pnpm --filter @thicket/web exec`) so that
 * `stripe` resolves — it is a dependency of apps/web only.
 */
import Stripe from "stripe";

// Must match apps/web/src/lib/stripe.ts:9 — the app pins this exact version.
const API_VERSION = "2025-08-27.basil";

// Mirrors PRICING.pro in packages/config/src/plans.ts:8-13 ($8/mo, $72/yr).
const PRODUCT_ID = "thicket_pro";
const PRODUCT_NAME = "Thicket Pro";
const CURRENCY = "usd";
// Exactly the events switched on in apps/web/src/app/api/stripe/webhook/route.ts:48-66.
const WEBHOOK_PATH = "/api/stripe/webhook";
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

const PLANS = [
  {
    envVar: "STRIPE_PRICE_PRO_MONTHLY",
    lookupKey: "thicket_pro_monthly_usd",
    unitAmount: 8 * 100,
    interval: "month",
    nickname: "Thicket Pro — Monthly",
  },
  {
    envVar: "STRIPE_PRICE_PRO_YEARLY",
    lookupKey: "thicket_pro_yearly_usd",
    unitAmount: 72 * 100,
    interval: "year",
    nickname: "Thicket Pro — Yearly",
  },
];

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error("STRIPE_SECRET_KEY is not set. Export it and re-run.");
  process.exit(1);
}

const stripe = new Stripe(secretKey, { apiVersion: API_VERSION });
const mode = secretKey.startsWith("sk_live_") ? "LIVE" : "test";

/** Reuse the product if it exists; its id is fixed, so this can never duplicate. */
async function ensureProduct() {
  try {
    const existing = await stripe.products.retrieve(PRODUCT_ID);
    if (existing.deleted) throw new Error(`Product ${PRODUCT_ID} was deleted; use a new id.`);
    if (!existing.active) {
      await stripe.products.update(PRODUCT_ID, { active: true });
      console.log(`~ reactivated product ${PRODUCT_ID}`);
    } else {
      console.log(`= reused product   ${PRODUCT_ID} (${existing.name})`);
    }
    return existing;
  } catch (error) {
    if (error?.statusCode !== 404 && error?.code !== "resource_missing") throw error;
  }
  const created = await stripe.products.create(
    {
      id: PRODUCT_ID,
      name: PRODUCT_NAME,
      description: "Unlimited workspaces, AI summaries and comparisons, 90-day tab memory, sync.",
      metadata: { app: "thicket", plan: "pro" },
    },
    { idempotencyKey: `thicket-product-${PRODUCT_ID}` },
  );
  console.log(`+ created product  ${created.id}`);
  return created;
}

/**
 * lookup_key is a strongly-consistent unique index on prices, unlike the
 * search API — so listing by it is a reliable "already created?" check.
 * Stripe prices are immutable, so a mismatch is reported, never patched.
 */
async function ensurePrice(productId, plan) {
  // No `active` filter: an archived price keeps its lookup_key, and the key is
  // unique — filtering it out here would make the create below fail instead.
  const found = await stripe.prices.list({ lookup_keys: [plan.lookupKey], limit: 1 });
  const existing = found.data[0];
  if (existing) {
    if (!existing.active) {
      await stripe.prices.update(existing.id, { active: true });
      console.log(`~ reactivated price ${existing.id} (${plan.lookupKey})`);
    }
    const mismatches = [];
    if (existing.product !== productId) mismatches.push(`product ${existing.product}`);
    if (existing.unit_amount !== plan.unitAmount) mismatches.push(`unit_amount ${existing.unit_amount}`);
    if (existing.currency !== CURRENCY) mismatches.push(`currency ${existing.currency}`);
    if (existing.recurring?.interval !== plan.interval) {
      mismatches.push(`interval ${existing.recurring?.interval}`);
    }
    if (mismatches.length > 0) {
      console.warn(
        `! ${existing.id} has lookup_key ${plan.lookupKey} but differs: ${mismatches.join(", ")}.\n` +
          `  Prices are immutable — create a new price and move the lookup_key with transfer_lookup_key.`,
      );
    } else {
      console.log(`= reused price     ${existing.id} (${plan.lookupKey})`);
    }
    return existing;
  }
  const created = await stripe.prices.create(
    {
      product: productId,
      currency: CURRENCY,
      unit_amount: plan.unitAmount,
      recurring: { interval: plan.interval },
      lookup_key: plan.lookupKey,
      nickname: plan.nickname,
      // Stripe Tax is enabled on checkout (checkout/route.ts:95); inclusive vs
      // exclusive must be decided at price creation. US-style: tax on top.
      tax_behavior: "exclusive",
      metadata: { app: "thicket", plan: "pro", interval: plan.interval },
    },
    { idempotencyKey: `thicket-price-${plan.lookupKey}` },
  );
  console.log(`+ created price    ${created.id} (${plan.lookupKey})`);
  return created;
}

/**
 * Idempotent by URL: reuse the endpoint already pointing at this path, and
 * only sync its event list. The signing secret is returned on creation ONLY —
 * an existing endpoint's secret must be copied from the Dashboard.
 */
async function ensureWebhook(origin) {
  const url = `${origin.replace(/\/$/, "")}${WEBHOOK_PATH}`;
  for await (const endpoint of stripe.webhookEndpoints.list({ limit: 100 })) {
    if (endpoint.url !== url) continue;
    const missing = WEBHOOK_EVENTS.filter((e) => !endpoint.enabled_events.includes(e));
    if (missing.length > 0 || endpoint.status !== "enabled") {
      await stripe.webhookEndpoints.update(endpoint.id, {
        enabled_events: WEBHOOK_EVENTS,
        disabled: false,
      });
      console.log(`~ updated webhook  ${endpoint.id} (${url})`);
    } else {
      console.log(`= reused webhook   ${endpoint.id} (${url})`);
    }
    return { endpoint, secret: null };
  }
  const created = await stripe.webhookEndpoints.create(
    {
      url,
      enabled_events: WEBHOOK_EVENTS,
      description: "Thicket entitlements",
      api_version: API_VERSION,
    },
    { idempotencyKey: `thicket-webhook-${url}` },
  );
  console.log(`+ created webhook  ${created.id} (${url})`);
  return { endpoint: created, secret: created.secret ?? null };
}

async function main() {
  console.log(`Stripe ${mode} mode, apiVersion ${API_VERSION}\n`);
  const product = await ensureProduct();
  const results = [];
  for (const plan of PLANS) {
    results.push([plan.envVar, await ensurePrice(product.id, plan)]);
  }

  const origin = process.env.APP_ORIGIN;
  let webhookSecret = null;
  let webhookExisted = false;
  if (origin) {
    const result = await ensureWebhook(origin);
    webhookSecret = result.secret;
    webhookExisted = result.secret === null;
  }

  console.log("\nAdd to your environment:");
  console.log(`STRIPE_SECRET_KEY=${secretKey.slice(0, 8)}…   (the key you just used)`);
  for (const [envVar, price] of results) {
    console.log(`${envVar}=${price.id}`);
  }
  if (webhookSecret) console.log(`STRIPE_WEBHOOK_SECRET=${webhookSecret}`);

  const manual = [];
  if (!origin) {
    manual.push(
      `Webhook: re-run with APP_ORIGIN=https://<host> to create ${WEBHOOK_PATH}, or add it in the Dashboard with events ${WEBHOOK_EVENTS.join(", ")}; set STRIPE_WEBHOOK_SECRET from it.`,
    );
  } else if (webhookExisted) {
    manual.push(
      "Webhook already existed — Stripe only reveals a signing secret at creation. Copy STRIPE_WEBHOOK_SECRET from the Dashboard (Developers → Webhooks → Reveal).",
    );
  }
  manual.push(
    "Settings → Billing → Customer portal: activate a configuration, or /api/billing/portal fails.",
  );
  manual.push(
    "Settings → Tax: add an origin address and registrations — checkout sends automatic_tax: enabled.",
  );
  manual.push("Settings → Billing → invoice/receipt emails on; dunning set to cancel after retries.");
  console.log("\nStill manual:");
  for (const [i, line] of manual.entries()) console.log(`  ${i + 1}. ${line}`);
}

main().catch((error) => {
  console.error(`Failed: ${error?.message ?? error}`);
  process.exit(1);
});
