import { eq } from "drizzle-orm";
import { z } from "zod";
import { subscription, user as userTable } from "@thicket/db/schema";
import { db } from "@/lib/db";
import { handled, json } from "@/lib/http";
import { HttpError, requireSessionUser } from "@/lib/request-auth";
import { stripe } from "@/lib/stripe";

const bodySchema = z.object({ confirm: z.literal("delete my account") });

/**
 * Delete My Data — the real thing. Cancels any Stripe subscription, then
 * deletes the user row; every table cascades from it (workspaces, tabs,
 * page memory, devices, preferences, usage, sessions).
 */
export const POST = handled(async (request) => {
  const user = await requireSessionUser();
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    throw new HttpError(400, "confirm-required", 'Type "delete my account" to confirm.');
  }

  const database = await db();
  const subs = await database
    .select()
    .from(subscription)
    .where(eq(subscription.userId, user.id))
    .limit(1);
  const sub = subs[0];
  if (stripe && sub?.stripeSubscriptionId && ["active", "trialing", "past_due"].includes(sub.status)) {
    await stripe.subscriptions.cancel(sub.stripeSubscriptionId).catch(() => {
      /* already canceled or gone — deletion proceeds regardless */
    });
  }

  await database.delete(userTable).where(eq(userTable.id, user.id));
  return json({ ok: true });
});
