import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { deletePagesRequest, syncPagesRequest } from "@tabmind/types";
import { normalizeUrl, sanitizeForStorage, allowedOffDevice } from "@tabmind/core";
import { RATE_LIMITS } from "@tabmind/config";
import { excludedDomain, pageRecord } from "@tabmind/db/schema";
import { db } from "@/lib/db";
import { embeddings } from "@/lib/ai-server";
import { corsPreflight, handled, json } from "@/lib/http";
import { HttpError, requireUser } from "@/lib/request-auth";
import { rateLimit } from "@/lib/rate-limit";

export const OPTIONS = corsPreflight();

function md5(value: string): string {
  return createHash("md5").update(value).digest("hex");
}

/**
 * Page-memory ingest. The extension already filters, but the server refuses
 * anything sensitive again — defense in depth, never trust the client.
 */
export const POST = handled(async (request) => {
  const user = await requireUser(request);
  rateLimit(`pages:${user.id}`, RATE_LIMITS.syncPerMinute);
  const parsed = syncPagesRequest.safeParse(await request.json());
  if (!parsed.success) throw new HttpError(400, "invalid", "Invalid pages payload.");

  const database = await db();
  const excluded = await database
    .select({ domain: excludedDomain.domain })
    .from(excludedDomain)
    .where(eq(excludedDomain.userId, user.id));
  const excludedSet = new Set(excluded.map((r) => r.domain));

  let recorded = 0;
  const toEmbed: { id: string; text: string }[] = [];

  for (const visit of parsed.data.visits) {
    const verdict = sanitizeForStorage(visit.url, visit.title, { excludedDomains: excludedSet });
    if (!verdict.ok || !allowedOffDevice(verdict)) continue;

    const normalized = normalizeUrl(verdict.url);
    const urlHash = md5(normalized);
    const visitedAt = new Date(Math.min(visit.visitedAt, Date.now()));

    const existing = await database
      .select({ id: pageRecord.id, title: pageRecord.title })
      .from(pageRecord)
      .where(and(eq(pageRecord.userId, user.id), eq(pageRecord.urlHash, urlHash)))
      .limit(1);
    const record = existing[0];
    if (record) {
      await database
        .update(pageRecord)
        .set({
          lastSeenAt: visitedAt,
          title: verdict.title || record.title,
          visitCount: sql`${pageRecord.visitCount} + 1`,
          ...(verdict.title && verdict.title !== record.title ? { embeddedAt: null } : {}),
        })
        .where(eq(pageRecord.id, record.id));
      if (verdict.title && verdict.title !== record.title) {
        toEmbed.push({ id: record.id, text: embedText(verdict.title, visit.domain) });
      }
    } else {
      const id = randomUUID();
      await database.insert(pageRecord).values({
        id,
        userId: user.id,
        url: verdict.url,
        urlHash,
        title: verdict.title,
        domain: visit.domain.slice(0, 255),
        firstSeenAt: visitedAt,
        lastSeenAt: visitedAt,
      });
      toEmbed.push({ id, text: embedText(verdict.title, visit.domain) });
    }
    recorded++;
  }

  // Embed inline in small batches — Voyage lite is fast; failures are retried
  // implicitly on the next title change or by the retention cron's backfill.
  if (embeddings.available && toEmbed.length > 0) {
    try {
      const vectors = await embeddings.embedDocuments(toEmbed.map((p) => p.text));
      for (const [index, page] of toEmbed.entries()) {
        const vector = vectors[index];
        if (!vector) continue;
        await database
          .update(pageRecord)
          .set({ embedding: vector, embeddedAt: new Date() })
          .where(eq(pageRecord.id, page.id));
      }
    } catch {
      /* embeddings are an enhancement — ingestion already succeeded */
    }
  }

  return json({ recorded });
});

function embedText(title: string, domain: string): string {
  return `${title} (${domain})`.slice(0, 500);
}

/**
 * Forget pages. "Delete" means the rows are gone — embeddings live on the
 * row, so nothing lingers. `all` wipes the user's whole page memory.
 */
export const DELETE = handled(async (request) => {
  const user = await requireUser(request);
  rateLimit(`pages:${user.id}`, RATE_LIMITS.syncPerMinute);
  const parsed = deletePagesRequest.safeParse(await request.json());
  if (!parsed.success) throw new HttpError(400, "invalid", "Invalid delete payload.");

  const database = await db();
  if (parsed.data.all) {
    const gone = await database
      .delete(pageRecord)
      .where(eq(pageRecord.userId, user.id))
      .returning({ id: pageRecord.id });
    return json({ deleted: gone.length });
  }
  const hashes = parsed.data.urls!.map((u) => md5(normalizeUrl(u)));
  const gone = await database
    .delete(pageRecord)
    .where(and(eq(pageRecord.userId, user.id), inArray(pageRecord.urlHash, hashes)))
    .returning({ id: pageRecord.id });
  return json({ deleted: gone.length });
});
