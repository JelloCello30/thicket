import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import {
  device,
  excludedDomain,
  pageRecord,
  preference,
  subscription,
  user as userTable,
  workspace,
  workspaceTab,
} from "@thicket/db/schema";
import { db } from "@/lib/db";
import { handled } from "@/lib/http";
import { requireSessionUser } from "@/lib/request-auth";

/** Export My Data: a complete, readable JSON of everything we hold. */
export const GET = handled(async () => {
  const user = await requireSessionUser();
  const database = await db();
  const [account] = await database.select().from(userTable).where(eq(userTable.id, user.id));
  const workspaces = await database.select().from(workspace).where(eq(workspace.userId, user.id));
  const tabs: (typeof workspaceTab.$inferSelect)[] = [];
  for (const w of workspaces) {
    const wsTabs = await database.select().from(workspaceTab).where(eq(workspaceTab.workspaceId, w.id));
    tabs.push(...wsTabs);
  }
  const pages = await database
    .select({
      url: pageRecord.url,
      title: pageRecord.title,
      domain: pageRecord.domain,
      firstSeenAt: pageRecord.firstSeenAt,
      lastSeenAt: pageRecord.lastSeenAt,
      visitCount: pageRecord.visitCount,
    })
    .from(pageRecord)
    .where(eq(pageRecord.userId, user.id));
  const prefs = await database.select().from(preference).where(eq(preference.userId, user.id));
  const excluded = await database.select().from(excludedDomain).where(eq(excludedDomain.userId, user.id));
  const devices = await database
    .select({ name: device.name, browser: device.browser, createdAt: device.createdAt, lastSeenAt: device.lastSeenAt, revokedAt: device.revokedAt })
    .from(device)
    .where(eq(device.userId, user.id));
  const subs = await database
    .select({ plan: subscription.plan, status: subscription.status, interval: subscription.interval })
    .from(subscription)
    .where(eq(subscription.userId, user.id));

  const payload = {
    exportedAt: new Date().toISOString(),
    account: { email: account?.email, name: account?.name, createdAt: account?.createdAt },
    subscription: subs[0] ?? { plan: "free" },
    preferences: prefs[0] ?? null,
    excludedDomains: excluded.map((d) => d.domain),
    devices,
    workspaces: workspaces.map((w) => ({
      ...w,
      tabs: tabs.filter((t) => t.workspaceId === w.id),
    })),
    pageMemory: pages,
  };

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="thicket-export-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  }) as NextResponse;
});
