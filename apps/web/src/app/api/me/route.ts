import { eq } from "drizzle-orm";
import { preferencesPatch } from "@thicket/types";
import { preference } from "@thicket/db/schema";
import { db } from "@/lib/db";
import { handled, json, corsPreflight } from "@/lib/http";
import { HttpError, requireUser } from "@/lib/request-auth";

export const OPTIONS = corsPreflight();

export const GET = handled(async (request) => {
  const user = await requireUser(request);
  return json({
    user: { email: user.email, name: user.name, plan: user.plan },
    entitlements: user.entitlements,
    preferences: { aiEnabled: user.aiEnabled, contentAnalysis: user.contentAnalysis },
  });
});

export const PATCH = handled(async (request) => {
  const user = await requireUser(request);
  const body = preferencesPatch.safeParse(await request.json());
  if (!body.success) throw new HttpError(400, "invalid", "Invalid preferences.");
  const database = await db();
  const patch = body.data;
  await database
    .insert(preference)
    .values({ userId: user.id, ...patch, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: preference.userId,
      set: { ...patch, updatedAt: new Date() },
    });
  const rows = await database.select().from(preference).where(eq(preference.userId, user.id));
  return json({ preferences: rows[0] });
});
