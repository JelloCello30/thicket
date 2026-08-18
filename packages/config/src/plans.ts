import type { Entitlements, Plan } from "@thicket/types";

/**
 * Pricing + entitlements in one place. Prices are display config;
 * the source of truth for billing is the Stripe Price objects referenced
 * by STRIPE_PRICE_PRO_MONTHLY / STRIPE_PRICE_PRO_YEARLY env vars.
 */
export const PRICING = {
  pro: {
    monthlyUsd: 8,
    yearlyUsd: 72,
  },
} as const;

const FREE: Entitlements = {
  plan: "free",
  maxWorkspaces: 3,
  historyDays: 7,
  semanticSearch: false,
  summaries: false,
  compare: false,
  aiCallsPerDay: 20,
};

const PRO: Entitlements = {
  plan: "pro",
  maxWorkspaces: null,
  historyDays: 90,
  semanticSearch: true,
  summaries: true,
  compare: true,
  aiCallsPerDay: 400,
};

export function entitlementsFor(plan: Plan): Entitlements {
  return plan === "pro" ? PRO : FREE;
}

export const PLAN_FEATURES = {
  /**
   * Free lists what the extension does on its own; Pro lists what a server
   * adds. Summaries and comparisons appear in both because the free versions
   * are real and run on-device — naming them the same made upgrading look
   * like it took features away.
   */
  free: [
    "Automatic tab organization",
    "Automation rules",
    "Up to 3 saved workspaces",
    "Keyword search across open tabs and recent history",
    "Group summaries and comparisons built from your tab titles",
    "Duplicate and stale-tab cleanup",
    "7-day tab memory",
  ],
  pro: [
    "Unlimited saved workspaces",
    "Meaning-based search — find a page by what it was about, not its title",
    "AI summaries that read the pages, not just the titles",
    "AI comparisons with specs pulled from the pages themselves",
    "90-day tab memory",
    "Sync across every browser you sign in on",
  ],
} as const;
