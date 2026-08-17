import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { normalizeExcludedDomainInput } from "@thicket/core";
import { excludedDomain } from "@thicket/db/schema";
import { db } from "@/lib/db";
import { corsPreflight, handled, json } from "@/lib/http";
import { HttpError, requireUser } from "@/lib/request-auth";

export const OPTIONS = corsPreflight();

export const GET = handled(async (request) => {
  const user = await requireUser(request);
  const database = await db();
  const rows = await database
    .select({ domain: excludedDomain.domain })
    .from(excludedDomain)
    .where(eq(excludedDomain.userId, user.id));
  return json({ domains: rows.map((r) => r.domain) });
});

const bodySchema = z.object({ domain: z.string().min(1).max(255) });

export const POST = handled(async (request) => {
  const user = await requireUser(request);
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) throw new HttpError(400, "invalid", "Invalid domain.");
  const domain = normalizeExcludedDomainInput(parsed.data.domain);
  if (!domain) throw new HttpError(400, "invalid", "That doesn't look like a domain.");
  const database = await db();
  await database
    .insert(excludedDomain)
    .values({ id: randomUUID(), userId: user.id, domain })
    .onConflictDoNothing();
  return json({ ok: true, domain });
});

export const DELETE = handled(async (request) => {
  const user = await requireUser(request);
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) throw new HttpError(400, "invalid", "Invalid domain.");
  const database = await db();
  await database
    .delete(excludedDomain)
    .where(and(eq(excludedDomain.userId, user.id), eq(excludedDomain.domain, parsed.data.domain)));
  return json({ ok: true });
});
