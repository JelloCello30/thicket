import { searchDocs, type SearchDoc } from "@tabmind/core";
import { api } from "../shared/api";
import { readState } from "../shared/storage";
import { readCached } from "./analyzer";
import { faviconFor } from "./tabs";
import type { SearchOutcome } from "../shared/messages";

/**
 * Search everywhere at once: open tabs, local page memory, saved workspaces —
 * plus the server's semantic index when signed in with Pro. Local results are
 * instant; semantic results enrich the history section.
 */
export async function runSearch(
  query: string,
  scope: "open" | "history" | "all" = "all",
): Promise<SearchOutcome> {
  const [analysis, state] = await Promise.all([
    readCached(),
    readState("localHistory", "workspaces", "auth", "prefs"),
  ]);

  const openDocs: SearchDoc[] = (analysis?.tabs ?? [])
    .filter((t) => !t.excluded)
    .map((t) => {
      const group = analysis?.groups.find((g) => g.tabIds.includes(t.tabId));
      return {
        ref: `tab:${t.tabId}`,
        title: t.title,
        url: t.url,
        domain: t.domain,
        context: group?.name,
        lastSeenAt: t.lastAccessed,
      };
    });

  const historyDocs: SearchDoc[] = state.localHistory.map((p) => ({
    ref: `page:${p.normalizedUrl}`,
    title: p.title,
    url: p.url,
    domain: p.domain,
    lastSeenAt: p.lastSeenAt,
  }));

  const workspaceDocs: SearchDoc[] = state.workspaces.flatMap((w) =>
    w.tabs.map((t) => ({
      ref: `ws:${w.id}:${t.id}`,
      title: t.title,
      url: t.url,
      domain: t.domain,
      context: w.title,
      lastSeenAt: w.lastActiveAt,
    })),
  );

  const outcome: SearchOutcome = {
    query,
    open: scope === "history" ? [] : searchDocs(query, openDocs, 8),
    history: scope === "open" ? [] : searchDocs(query, historyDocs, 10),
    workspaces: scope === "open" ? [] : searchDocs(query, workspaceDocs, 8),
    semantic: false,
  };

  // Server-side semantic search (Pro + signed in + AI on) fills gaps that
  // lexical matching misses. Merge, dedupe by URL, keep instant results first.
  if (scope !== "open" && state.auth && state.prefs.aiEnabled && state.prefs.syncEnabled) {
    try {
      const remote = await api.search(query);
      if (remote.semantic) outcome.semantic = true;
      const seen = new Set([...outcome.history, ...outcome.workspaces].map((d) => d.url));
      for (const item of remote.results) {
        if (seen.has(item.url)) continue;
        const doc = {
          ref: item.kind === "workspace-tab" ? `ws:${item.workspaceId}:remote` : `page:${item.url}`,
          title: item.title,
          url: item.url,
          domain: item.domain,
          context: item.workspaceTitle,
          lastSeenAt: item.lastSeenAt,
          score: item.score,
        };
        if (item.kind === "workspace-tab") outcome.workspaces.push(doc);
        else outcome.history.push(doc);
      }
    } catch {
      /* offline or free plan — local results stand */
    }
  }

  return outcome;
}

export function faviconForResult(url: string): string {
  return faviconFor(url);
}
