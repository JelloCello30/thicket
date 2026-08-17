import type { AnalysisResult, ComparisonTable, GroupSummary } from "@thicket/types";
import { localComparison, localGroupSummary } from "@thicket/core";
import { api, ApiError } from "../shared/api";
import { readState } from "../shared/storage";

/**
 * Summaries + comparisons (Pro features). Page excerpts are included ONLY
 * when the user has enabled content analysis AND granted host permission —
 * otherwise titles and domains alone go to the server.
 */

class FeatureError extends Error {
  constructor(
    public code: "auth-required" | "pro-required" | "ai-unavailable" | "network",
    message: string,
  ) {
    super(message);
  }
}

async function aiAvailable(): Promise<boolean> {
  const { auth, prefs } = await readState("auth", "prefs");
  return Boolean(auth) && prefs.aiEnabled;
}

async function groupFeatures(analysis: AnalysisResult, groupId: string, withContent: boolean) {
  const group = analysis.groups.find((g) => g.id === groupId);
  if (!group) throw new Error("That group is gone — tabs may have changed.");
  const byId = new Map(analysis.tabs.map((t) => [t.tabId, t]));
  const members = group.tabIds
    .map((id) => byId.get(id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t) && !t!.excluded);

  let excerpts = new Map<number, string>();
  if (withContent) {
    excerpts = await captureExcerpts(members.map((m) => m.tabId));
  }

  return {
    group,
    tabs: members.map((t) => ({
      key: String(t.tabId),
      title: t.title.slice(0, 300),
      domain: t.domain,
      category: t.category,
      searchQuery: t.searchQuery,
      excerpt: excerpts.get(t.tabId),
    })),
    members,
  };
}

export async function summarizeGroup(analysis: AnalysisResult, groupId: string): Promise<GroupSummary> {
  // No account / AI off? The local engine answers instantly instead of erroring.
  if (!(await aiAvailable())) return localGroupSummary(analysis, groupId);
  const { prefs } = await readState("prefs");
  const withContent = prefs.contentAnalysis && (await hasContentPermission());
  const { group, tabs, members } = await groupFeatures(analysis, groupId, withContent);
  try {
    const result = await api.aiSummarize({ title: group.name, tabs });
    const byKey = new Map(members.map((m) => [String(m.tabId), m]));
    return {
      doing: result.doing,
      findings: result.findings,
      keep: result.keep
        .map((k) => {
          const tab = byKey.get(k.key);
          return tab ? { url: tab.url, title: tab.title, why: k.why } : null;
        })
        .filter((k): k is NonNullable<typeof k> => k !== null),
      nextStep: result.nextStep,
      source: "ai",
    };
  } catch (error) {
    // Server said no (plan, outage, offline)? Degrade to the local version —
    // a real answer now beats an error toast.
    const translated = translate(error);
    if (translated instanceof FeatureError) return localGroupSummary(analysis, groupId);
    throw translated;
  }
}

export async function compareGroup(analysis: AnalysisResult, groupId: string): Promise<ComparisonTable> {
  if (!(await aiAvailable())) return localComparison(analysis, groupId);
  const { prefs } = await readState("prefs");
  const withContent = prefs.contentAnalysis && (await hasContentPermission());
  const { tabs, members } = await groupFeatures(analysis, groupId, withContent);
  if (tabs.length < 2) throw new Error("Comparing needs at least two tabs.");
  try {
    const result = await api.aiCompare({ tabs });
    const byKey = new Map(members.map((m) => [String(m.tabId), m]));
    return {
      subject: result.subject,
      columns: result.columns,
      rows: result.rows
        .map((row) => {
          const tab = byKey.get(row.key);
          if (!tab) return null;
          return { url: tab.url, title: tab.title, values: row.values };
        })
        .filter((r): r is NonNullable<typeof r> => r !== null),
      source: "ai",
    };
  } catch (error) {
    const translated = translate(error);
    if (translated instanceof FeatureError) return localComparison(analysis, groupId);
    throw translated;
  }
}

function translate(error: unknown): Error {
  if (error instanceof ApiError) {
    if (error.status === 401) return new FeatureError("auth-required", "Sign in to use AI features.");
    if (error.status === 402 || error.code === "pro-required")
      return new FeatureError("pro-required", "This is a Pro feature. Upgrade to unlock it.");
    if (error.status === 503 || error.code === "ai-unavailable")
      return new FeatureError("ai-unavailable", "AI isn't available right now. Try again shortly.");
    if (error.status === 0) return new FeatureError("network", error.message);
  }
  return error instanceof Error ? error : new Error(String(error));
}

/* ─────────────────── content capture (strictly opt-in) ─────────────────── */

export async function hasContentPermission(): Promise<boolean> {
  return chrome.permissions.contains({ origins: ["<all_urls>"] });
}

/**
 * On-demand page-text extraction. No persistent content scripts — a one-shot
 * function runs only when a feature needs it, only on non-excluded tabs, and
 * only after the user granted the optional host permission.
 */
async function captureExcerpts(tabIds: number[]): Promise<Map<number, string>> {
  const excerpts = new Map<number, string>();
  const results = await Promise.allSettled(
    tabIds.slice(0, 20).map(async (tabId) => {
      const [injection] = await chrome.scripting.executeScript({
        target: { tabId },
        func: extractReadableText,
      });
      const text = injection?.result;
      if (typeof text === "string" && text.length > 0) excerpts.set(tabId, text);
    }),
  );
  void results;
  return excerpts;
}

/** Runs inside the page. Grabs headline + visible text, no DOM kept. */
function extractReadableText(): string {
  const pieces: string[] = [];
  const title = document.querySelector("h1")?.textContent?.trim();
  if (title) pieces.push(title);
  const meta = document.querySelector('meta[name="description"]')?.getAttribute("content");
  if (meta) pieces.push(meta);
  const price = document.querySelector('[itemprop="price"], [class*="price" i]')?.textContent?.trim();
  if (price && price.length < 60) pieces.push(`Price: ${price}`);
  const main = document.querySelector("article, main, [role='main']") ?? document.body;
  const text = (main?.textContent ?? "").replace(/\s+/g, " ").trim();
  pieces.push(text.slice(0, 1200));
  return pieces.join("\n").slice(0, 1500);
}
