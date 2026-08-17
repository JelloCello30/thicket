import { and, eq, isNull } from "drizzle-orm";
import { device, excludedDomain, preference } from "@thicket/db/schema";
import { db } from "@/lib/db";
import { requireSessionUser } from "@/lib/request-auth";
import { billingConfigured } from "@/lib/stripe";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireSessionUser();
  const database = await db();
  const devices = await database
    .select({
      id: device.id,
      name: device.name,
      browser: device.browser,
      lastSeenAt: device.lastSeenAt,
      createdAt: device.createdAt,
    })
    .from(device)
    .where(and(eq(device.userId, user.id), isNull(device.revokedAt)));
  const prefRows = await database.select().from(preference).where(eq(preference.userId, user.id));
  const excluded = await database
    .select({ domain: excludedDomain.domain })
    .from(excludedDomain)
    .where(eq(excludedDomain.userId, user.id));

  return (
    <SettingsClient
      user={{ email: user.email, name: user.name, plan: user.plan }}
      billingConfigured={billingConfigured}
      devices={devices.map((d) => ({
        ...d,
        lastSeenAt: d.lastSeenAt.getTime(),
        createdAt: d.createdAt.getTime(),
      }))}
      preferences={{
        aiEnabled: prefRows[0]?.aiEnabled ?? true,
        contentAnalysis: prefRows[0]?.contentAnalysis ?? false,
      }}
      excludedDomains={excluded.map((d) => d.domain)}
    />
  );
}
