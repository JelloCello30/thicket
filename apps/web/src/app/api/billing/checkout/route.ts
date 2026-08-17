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

  const env = serverEnv();
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: user.id,
    line_items: [{ price: priceIdFor(parsed.data.interval), quantity: 1 }],
    success_url: `${env.NEXT_PUBLIC_APP_URL}/app/settings?upgraded=1`,
    cancel_url: `${env.NEXT_PUBLIC_APP_URL}/pricing`,
    allow_promotion_codes: true,
    subscription_data: { metadata: { thicketUserId: user.id } },
  });
  await track("upgrade_started", { interval: parsed.data.interval }, { userId: user.id });
  if (!session.url) throw new HttpError(500, "internal", "Stripe didn't return a checkout URL.");
  return json({ url: session.url });
});
