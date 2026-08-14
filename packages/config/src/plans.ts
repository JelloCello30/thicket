import type { Entitlements, Plan } from "@tabmind/types";

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
  priorityAi: false,
};

const PRO: Entitlements = {
  plan: "pro",
  maxWorkspaces: null,
  historyDays: 90,
  semanticSearch: true,
  summaries: true,
  compare: true,
  aiCallsPerDay: 400,
  priorityAi: true,
};

export function entitlementsFor(plan: Plan): Entitlements {
  return plan === "pro" ? PRO : FREE;
}

export const PLAN_FEATURES = {
  free: [
    "Automatic tab organization",
    "Up to 3 saved workspaces",
    "Search your open tabs and recent history",
    "Duplicate and stale-tab cleanup",
    "7-day tab memory",
  ],
  pro: [
    "Unlimited saved workspaces",
    "AI search across your full history",
    "Workspace summaries",
    "Compare tabs side by side",
    "Advanced cleanup",
    "90-day tab memory",
    "Priority AI processing",
  ],
} as const;
