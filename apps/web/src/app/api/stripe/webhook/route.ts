import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { stripeEvent, subscription, user } from "@thicket/db/schema";
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
  /**
   * Idempotency, claimed atomically. A select-then-insert lets two concurrent
   * deliveries of the same event both pass the check and both apply it.
   */
  const claimed = await database
    .insert(stripeEvent)
    .values({ id: event.id, type: event.type })
    .onConflictDoNothing()
    .returning({ id: stripeEvent.id });
  if (claimed.length === 0) return NextResponse.json({ received: true });

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

  /**
   * The user may be gone. Deleting an account cancels the Stripe subscription,
   * and Stripe then delivers customer.subscription.deleted for a row that no
   * longer exists — a foreign-key violation, a 500, and a retry every few
   * hours for days. Stripe disables endpoints that keep failing, so ONE
   * deleted customer used to take billing down for everybody. A missing user
   * is a success: there is nothing left to record.
   */
  const stillExists = await database
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  if (stillExists.length === 0) return;

  const item = sub.items.data[0];
  const active = ["active", "trialing", "past_due"].includes(sub.status);
  // Newer API versions moved current_period_end onto the subscription itself.
  const currentPeriodEnd =
    item?.current_period_end ?? (sub as unknown as { current_period_end?: number }).current_period_end;

  /**
   * Ignore events about a subscription the user has already replaced. Stripe
   * does not guarantee delivery order, so a stale "active" arriving after a
   * "deleted" would otherwise re-grant Pro to someone who cancelled.
   */
  const existing = await database
    .select({
      stripeSubscriptionId: subscription.stripeSubscriptionId,
      status: subscription.status,
    })
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);
  const current = existing[0];
  if (
    current?.stripeSubscriptionId &&
    current.stripeSubscriptionId !== sub.id &&
    ["active", "trialing", "past_due"].includes(current.status ?? "")
  ) {
    return;
  }

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
