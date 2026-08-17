import { and, eq, gte, sql } from "drizzle-orm";
import { searchRequest, type SearchResultItem } from "@thicket/types";
import { searchDocs, type SearchDoc } from "@thicket/core";
import { RATE_LIMITS } from "@thicket/config";
import { pageRecord, workspace, workspaceTab } from "@thicket/db/schema";
import { db } from "@/lib/db";
import { embeddings } from "@/lib/ai-server";
import { corsPreflight, handled, json } from "@/lib/http";
import { HttpError, requireUser } from "@/lib/request-auth";
import { rateLimit } from "@/lib/rate-limit";

export const OPTIONS = corsPreflight();

/**
 * Account-wide search. Lexical scoring for everyone (over the retention
 * window); semantic vector search layered on for Pro when embeddings are
 * configured. Find the page, not the title.
 */
export const GET = handled(async (request) => {
  const user = await requireUser(request);
  rateLimit(`search:${user.id}`, RATE_LIMITS.searchPerMinute);
  const url = new URL(request.url);
  const parsed = searchRequest.safeParse({
    query: url.searchParams.get("q") ?? "",
    scope: url.searchParams.get("scope") ?? undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
  });
  if (!parsed.success) throw new HttpError(400, "invalid", "Invalid search request.");
  const { query, limit } = parsed.data;

  const database = await db();
  const retentionCutoff = new Date(Date.now() - user.entitlements.historyDays * 86_400_000);

  const pages = await database
    .select({
      url: pageRecord.url,
      title: pageRecord.title,
      domain: pageRecord.domain,
      lastSeenAt: pageRecord.lastSeenAt,
    })
    .from(pageRecord)
    .where(and(eq(pageRecord.userId, user.id), gte(pageRecord.lastSeenAt, retentionCutoff)))
    .limit(3000);

  const tabs = await database
    .select({
      url: workspaceTab.url,
      title: workspaceTab.title,
      domain: workspaceTab.domain,
      workspaceId: workspace.id,
      workspaceTitle: workspace.title,
      lastActiveAt: workspace.lastActiveAt,
    })
    .from(workspaceTab)
    .innerJoin(workspace, eq(workspaceTab.workspaceId, workspace.id))
    .where(eq(workspace.userId, user.id))
    .limit(2000);

  const docs: SearchDoc[] = [
    ...pages.map((p) => ({
      ref: `h:${p.url}`,
      title: p.title,
      url: p.url,
      domain: p.domain,
      lastSeenAt: p.lastSeenAt.getTime(),
    })),
    ...tabs.map((t) => ({
      ref: `w:${t.workspaceId}:${t.url}`,
      title: t.title,
      url: t.url,
      domain: t.domain,
      context: t.workspaceTitle,
      lastSeenAt: t.lastActiveAt.getTime(),
    })),
  ];
  const lexical = searchDocs(query, docs, limit);

  const results = new Map<string, SearchResultItem>();
  for (const doc of lexical) {
    results.set(doc.url, toItem(doc.ref, doc.url, doc.title, doc.domain, doc.lastSeenAt, doc.score, tabs));
  }

  let semantic = false;
  if (user.entitlements.semanticSearch && user.aiEnabled && embeddings.available) {
    try {
      const queryVector = await embeddings.embedQuery(query);
      const vectorHits = await database
        .select({
          url: pageRecord.url,
          title: pageRecord.title,
          domain: pageRecord.domain,
          lastSeenAt: pageRecord.lastSeenAt,
          distance: sql<number>`${pageRecord.embedding} <=> ${JSON.stringify(queryVector)}::vector`,
        })
        .from(pageRecord)
        .where(
          and(
            eq(pageRecord.userId, user.id),
            gte(pageRecord.lastSeenAt, retentionCutoff),
            sql`${pageRecord.embedding} IS NOT NULL`,
          ),
        )
        .orderBy(sql`${pageRecord.embedding} <=> ${JSON.stringify(queryVector)}::vector`)
        .limit(limit);
      semantic = true;
      for (const hit of vectorHits) {
        if (hit.distance > 0.62) continue; // beyond this, matches feel random
        if (!results.has(hit.url)) {
          results.set(
            hit.url,
            toItem(`h:${hit.url}`, hit.url, hit.title, hit.domain, hit.lastSeenAt.getTime(), 1 - hit.distance, tabs),
          );
        }
      }
    } catch {
      /* semantic layer is additive — lexical results already collected */
    }
  }

  return json({
    results: [...results.values()].sort((a, b) => b.score - a.score).slice(0, limit),
    semantic,
  });
});

function toItem(
  ref: string,
  url: string,
  title: string,
  domain: string,
  lastSeenAt: number | undefined,
  score: number,
  tabs: { url: string; workspaceId: string; workspaceTitle: string }[],
): SearchResultItem {
  if (ref.startsWith("w:")) {
    const tab = tabs.find((t) => t.url === url);
    return {
      url,
      title,
      domain,
      kind: "workspace-tab",
      workspaceId: tab?.workspaceId,
      workspaceTitle: tab?.workspaceTitle,
      lastSeenAt,
      score,
    };
  }
  return { url, title, domain, kind: "history", lastSeenAt, score };
}
