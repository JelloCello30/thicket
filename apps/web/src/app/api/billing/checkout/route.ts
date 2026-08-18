import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { subscription } from "@thicket/db/schema";
import { serverEnv } from "@thicket/config/env";
import { db } from "@/lib/db";
import { handled, json } from "@/lib/http";
import { HttpError, requireSessionUser } from "@/lib/request-auth";
import { priceIdFor, requireStripe } from "@/lib/stripe";
import { track } from "@/lib/track";

const bodySchema = z.object({ interval: z.enum(["month", "year"]).default("month") });

export const POST = handled(async (request) => {
  const user = await requireSessionUser();
  const stripe = requireStripe();
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) throw new HttpError(400, "invalid", "Invalid checkout request.");
  if (user.plan === "pro") throw new HttpError(400, "already-pro", "You're already on Pro.");

  const database = await db();
  const rows = await database
    .select()
    .from(subscription)
    .where(eq(subscription.userId, user.id))
    .limit(1);
  let customerId = rows[0]?.stripeCustomerId ?? null;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name: user.name,
      metadata: { thicketUserId: user.id },
    });
    customerId = customer.id;
    await database
      .insert(subscription)
      .values({ id: randomUUID(), userId: user.id, stripeCustomerId: customerId })
      .onConflictDoUpdate({
        target: subscription.userId,
        set: { stripeCustomerId: customerId, updatedAt: new Date() },
      });
  }

  /**
   * Never sell someone a second subscription. The only "already Pro" guard was
   * the locally stored plan, which is stale whenever the webhook is late or
   * lost — so a paying user landing back on Settings still saw "Free" and a
   * live upgrade button, and clicking it charged them twice. Ask Stripe, which
   * is the authority, and repair our copy while we are here.
   */
  const live = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 });
  const alreadySubscribed = live.data[0];
  if (alreadySubscribed) {
    const item = alreadySubscribed.items.data[0];
    const periodEnd =
      item?.current_period_end ??
      (alreadySubscribed as unknown as { current_period_end?: number }).current_period_end;
    await database
      .insert(subscription)
      .values({
        id: randomUUID(),
        userId: user.id,
        stripeCustomerId: customerId,
        stripeSubscriptionId: alreadySubscribed.id,
        status: alreadySubscribed.status,
        plan: "pro",
        currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: subscription.userId,
        set: {
          stripeSubscriptionId: alreadySubscribed.id,
          status: alreadySubscribed.status,
          plan: "pro",
          currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
          updatedAt: new Date(),
        },
      });
    throw new HttpError(400, "already-pro", "You're already on Pro — reload the page.");
  }

  const env = serverEnv();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceIdFor(parsed.data.interval), quantity: 1 }],
    success_url: `${env.NEXT_PUBLIC_APP_URL}/app/settings?upgraded=1`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/pricing`,
    allow_promotion_codes: true,
    // Selling a digital service to consumers means EU/UK VAT attaches from the
    // first sale. Stripe Tax computes and collects it; the address is what it
    // needs to know which rate applies.
    automatic_tax: { enabled: true },
    billing_address_collection: "required",
    subscription_data: { metadata: { thicketUserId: user.id } },
  });
  await track("upgrade_started", { interval: parsed.data.interval }, { userId: user.id });
  if (!session.url) throw new HttpError(500, "internal", "Stripe didn't return a checkout URL.");
  return json({ url: session.url });
});
