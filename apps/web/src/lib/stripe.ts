import "server-only";
import Stripe from "stripe";
import { serverEnv } from "@tabmind/config/env";
import { HttpError } from "./request-auth";

const env = serverEnv();

export const stripe: Stripe | null = env.STRIPE_SECRET_KEY
  ? new Stripe(env.STRIPE_SECRET_KEY)
  : null;

export function requireStripe(): Stripe {
  if (!stripe || !env.STRIPE_PRICE_PRO_MONTHLY || !env.STRIPE_PRICE_PRO_YEARLY) {
    throw new HttpError(503, "billing-unavailable", "Billing isn't configured on this server yet.");
  }
  return stripe;
}

export function priceIdFor(interval: "month" | "year"): string {
  return interval === "year" ? env.STRIPE_PRICE_PRO_YEARLY! : env.STRIPE_PRICE_PRO_MONTHLY!;
}

export function intervalForPrice(priceId: string | undefined): "month" | "year" | null {
  if (!priceId) return null;
  if (priceId === env.STRIPE_PRICE_PRO_YEARLY) return "year";
  if (priceId === env.STRIPE_PRICE_PRO_MONTHLY) return "month";
  return null;
}

export const billingConfigured = Boolean(
  env.STRIPE_SECRET_KEY && env.STRIPE_PRICE_PRO_MONTHLY && env.STRIPE_PRICE_PRO_YEARLY,
);
