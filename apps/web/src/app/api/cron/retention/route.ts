import { and, eq, inArray, lt, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { entitlementsFor } from "@thicket/config";
import { aiCache, deviceLinkCode, pageRecord, subscription, user } from "@thicket/db/schema";
import { db } from "@/lib/db";

/**
 * Data retention, enforced server-side daily (vercel.json cron). History
 * beyond each user's plan window is deleted — the memory feature's promise
 * is bounded, and we keep it that way.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization");
  if (secret && header !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const database = await db();
  const users = await database.select({ id: user.id }).from(user);
  const pro = await database
    .select({ userId: subscription.userId })
    .from(subscription)
    .where(and(eq(subscription.plan, "pro"), inArray(subscription.status, ["active", "trialing", "past_due"])));
  const proSet = new Set(pro.map((r) => r.userId));

  let deleted = 0;
  for (const row of users) {
    const days = entitlementsFor(proSet.has(row.id) ? "pro" : "free").historyDays;
    const cutoff = new Date(Date.now() - days * 86_400_000);
    const result = await database
      .delete(pageRecord)
      .where(and(eq(pageRecord.userId, row.id), lt(pageRecord.lastSeenAt, cutoff)));
    deleted += (result as { rowCount?: number }).rowCount ?? 0;
  }

  await database.delete(aiCache).where(lt(aiCache.expiresAt, new Date()));
  await database.delete(deviceLinkCode).where(lt(deviceLinkCode.expiresAt, sql`now() - interval '1 day'`));

  return NextResponse.json({ ok: true, usersChecked: users.length, pagesDeleted: deleted });
}
