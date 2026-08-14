import { and, eq } from "drizzle-orm";
import { device } from "@tabmind/db/schema";
import { db } from "@/lib/db";
import { handled, json } from "@/lib/http";
import { requireSessionUser } from "@/lib/request-auth";

export const DELETE = handled(async (_request, { params }) => {
  const user = await requireSessionUser();
  const { id } = await params;
  const database = await db();
  await database
    .update(device)
    .set({ revokedAt: new Date() })
    .where(and(eq(device.id, id!), eq(device.userId, user.id)));
  return json({ ok: true });
});
