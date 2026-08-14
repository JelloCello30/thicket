import { eq } from "drizzle-orm";
import { subscription } from "@tabmind/db/schema";
import { serverEnv } from "@tabmind/config/env";
import { db } from "@/lib/db";
import { handled, json } from "@/lib/http";
import { HttpError, requireSessionUser } from "@/lib/request-auth";
import { requireStripe } from "@/lib/stripe";

export const POST = handled(async () => {
  const user = await requireSessionUser();
  const stripe = requireStripe();
  const database = await db();
  const rows = await database
    .select({ customerId: subscription.stripeCustomerId })
    .from(subscription)
    .where(eq(subscription.userId, user.id))
    .limit(1);
  const customerId = rows[0]?.customerId;
  if (!customerId) throw new HttpError(400, "no-subscription", "No billing account yet.");
  const env = serverEnv();
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: `${env.NEXT_PUBLIC_APP_URL}/app/settings`,
  });
  return json({ url: session.url });
});
