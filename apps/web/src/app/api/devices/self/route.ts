import { eq } from "drizzle-orm";
import { device } from "@thicket/db/schema";
import { db } from "@/lib/db";
import { corsPreflight, handled, json } from "@/lib/http";
import { HttpError, requireUser } from "@/lib/request-auth";

export const OPTIONS = corsPreflight();

/** The extension revokes its own token on sign-out. */
export const DELETE = handled(async (request) => {
  const user = await requireUser(request);
  if (!user.deviceId) throw new HttpError(400, "invalid", "Only devices can revoke themselves.");
  const database = await db();
  await database.update(device).set({ revokedAt: new Date() }).where(eq(device.id, user.deviceId));
  return json({ ok: true });
});
