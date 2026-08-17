import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { stripeEvent, subscription } from "@thicket/db/schema";
import { serverEnv } from "@thicket/config/env";
import { db } from "@/lib/db";
import { intervalForPrice, stripe } from "@/lib/stripe";
import { track } from "@/lib/track";
import { captureServerError } from "@/lib/monitoring";

/**
 * Stripe → entitlements. Signature-verified, idempotent by event id, and
 * the only writer of subscription state — the UI never grants Pro itself.
 */
export async function POST(request: Request) {
  const env = serverEnv();
  if (!stripe || !env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "billing not configured" }, { status: 503 });
  }
  const signature = request.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      await request.text(),
      signature,
      env.STRIPE_WEBHOOK_SECRET,
    );
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  const database = await db();
  // Idempotency: replay-safe.
  const seen = await database
    .select({ id: stripeEvent.id })
    .from(stripeEvent)
    .where(eq(stripeEvent.id, event.id))
    .limit(1);
  if (seen.length > 0) return NextResponse.json({ received: true });
  await database.insert(stripeEvent).values({ id: event.id, type: event.type });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.client_reference_id ?? session.metadata?.thicketUserId;
        if (userId && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string);
          await applySubscription(userId, sub);
          await track("subscription_created", { interval: intervalForPrice(sub.items.data[0]?.price.id) ?? "month" }, { userId });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        const userId = sub.metadata?.thicketUserId ?? (await userIdForCustomer(sub.customer as string));
        if (userId) await applySubscription(userId, sub);
        break;
      }
      default:
        break;
    }
  } catch (error) {
    captureServerError(error);
    console.error("[stripe-webhook]", error);
    // Let Stripe retry: remove the idempotency claim for this event.
    await database.delete(stripeEvent).where(eq(stripeEvent.id, event.id));
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

async function userIdForCustomer(customerId: string): Promise<string | null> {
  const database = await db();
  const rows = await database
    .select({ userId: subscription.userId })
    .from(subscription)
    .where(eq(subscription.stripeCustomerId, customerId))
    .limit(1);
  return rows[0]?.userId ?? null;
}

async function applySubscription(userId: string, sub: Stripe.Subscription): Promise<void> {
  const database = await db();
  const item = sub.items.data[0];
  const active = ["active", "trialing", "past_due"].includes(sub.status);
  const currentPeriodEnd = item?.current_period_end;
  await database
    .insert(subscription)
    .values({
      id: randomUUID(),
      userId,
      stripeCustomerId: sub.customer as string,
      stripeSubscriptionId: sub.id,
      status: sub.status,
      plan: active ? "pro" : "free",
      interval: intervalForPrice(item?.price.id),
      currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: subscription.userId,
      set: {
        stripeCustomerId: sub.customer as string,
        stripeSubscriptionId: sub.id,
        status: sub.status,
        plan: active ? "pro" : "free",
        interval: intervalForPrice(item?.price.id),
        currentPeriodEnd: currentPeriodEnd ? new Date(currentPeriodEnd * 1000) : null,
        cancelAtPeriodEnd: sub.cancel_at_period_end,
        updatedAt: new Date(),
      },
    });
}
