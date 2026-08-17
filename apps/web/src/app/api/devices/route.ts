import { and, eq, isNull } from "drizzle-orm";
import { device } from "@thicket/db/schema";
import { db } from "@/lib/db";
import { handled, json } from "@/lib/http";
import { requireSessionUser } from "@/lib/request-auth";

export const GET = handled(async () => {
  const user = await requireSessionUser();
  const database = await db();
  const rows = await database
    .select({
      id: device.id,
      name: device.name,
      browser: device.browser,
      lastSeenAt: device.lastSeenAt,
      createdAt: device.createdAt,
    })
    .from(device)
    .where(and(eq(device.userId, user.id), isNull(device.revokedAt)));
  return json({ devices: rows });
});
