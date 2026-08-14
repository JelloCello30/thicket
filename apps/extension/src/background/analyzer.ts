import type { AnalysisResult, TabGroup } from "@tabmind/types";
import {
  groupTabs,
  type GroupingOptions,
  type PreviousGroup,
} from "@tabmind/core";
import { TIMING } from "@tabmind/config";
import { api } from "../shared/api";
import { readState, writeState } from "../shared/storage";
import { collectTabs } from "./tabs";
import { mirrorGroups } from "./mirror";
import { track } from "./analytics";

/**
 * The analysis loop. Debounced against tab churn, stable across re-runs,
 * fully local — the optional AI pass refines names/insights afterwards and
 * never blocks the deterministic result.
 */

let debounceTimer: ReturnType<typeof setTimeout> | null = null;
let lastAnalyzedAt = 0;
let analyzing: Promise<AnalysisResult> | null = null;

export function scheduleAnalysis(reason: string): void {
  void reason;
  if (debounceTimer) clearTimeout(debounceTimer);
  const sinceLast = Date.now() - lastAnalyzedAt;
  const delay =
    sinceLast > TIMING.analyzeMaxInterval ? 250 : TIMING.analyzeDebounce;
  debounceTimer = setTimeout(() => {
    void runAnalysis();
  }, delay);
}

export async function getAnalysis(maxAgeMs = 15_000): Promise<AnalysisResult> {
  const cached = await readCached();
  if (cached && Date.now() - cached.analyzedAt <= maxAgeMs) return cached;
  return runAnalysis();
}

export async function readCached(): Promise<AnalysisResult | null> {
  const raw = await chrome.storage.session.get("analysis");
  return (raw.analysis as AnalysisResult | undefined) ?? null;
}

export async function runAnalysis(): Promise<AnalysisResult> {
  if (analyzing) return analyzing;
  analyzing = doAnalyze().finally(() => {
    analyzing = null;
  });
  return analyzing;
}

async function doAnalyze(): Promise<AnalysisResult> {
  const [snapshots, state] = await Promise.all([
    collectTabs(),
    readState("prefs", "excludedDomains", "groupMemory", "corrections", "workspaces", "auth"),
  ]);

  const options: GroupingOptions = {
    previous: state.groupMemory,
    similarity: { pairBoosts: state.corrections.pairBoosts },
    lockedAssignments: new Map(Object.entries(state.corrections.locks)),
  };

  const result = groupTabs(
    snapshots,
    {
      excludedDomains: new Set(state.excludedDomains),
      preferences: { paused: state.prefs.paused },
      now: Date.now(),
    },
    options,
  );

  attachLocalInsights(result);
  linkSavedWorkspaces(result, state.workspaces);

  lastAnalyzedAt = Date.now();
  await chrome.storage.session.set({ analysis: result });

  if (result.totalTabs > 0) {
    const { firstAnalyzedAt } = await readState("firstAnalyzedAt");
    if (!firstAnalyzedAt) {
      await writeState({ firstAnalyzedAt: Date.now() });
      track("first_analysis", { tabs: result.totalTabs, groups: result.groups.length });
    }
  }
  await persistGroupMemory(result, state.groupMemory);

  if (state.prefs.mirrorTabGroups && !state.prefs.paused) {
    await mirrorGroups(result).catch(() => {
      /* group mirroring is cosmetic — never fail analysis over it */
    });
  }

  notifyUi();

  // AI refinement runs after the local result is already live.
  if (state.auth && state.prefs.aiEnabled && !state.prefs.paused) {
    void refineWithAi(result).catch(() => {
      /* offline/unavailable — the local result stands */
    });
  }

  return result;
}

function attachLocalInsights(result: AnalysisResult): void {
  const byId = new Map(result.tabs.map((t) => [t.tabId, t]));
  for (const group of result.groups) {
    const members = group.tabIds
      .map((id) => byId.get(id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
    const domains = new Set(members.map((m) => m.domain).filter(Boolean));
    const lastActive = Math.max(...members.map((m) => m.lastAccessed ?? 0), 0);
    const parts: string[] = [];
    if (group.isStale) {
      parts.push("No recent activity — safe to close once saved");
    } else {
      if (domains.size > 0) parts.push(`${domains.size} ${domains.size === 1 ? "site" : "sites"}`);
      if (lastActive > 0) parts.push(`active ${relativeTime(lastActive)}`);
      if (group.signals[0]) parts.push(group.signals[0].toLowerCase());
    }
    if (parts.length > 0 && !group.insight) {
      group.insight = { text: sentence(parts), source: "local", generatedAt: Date.now() };
    }
  }
}

function sentence(parts: string[]): string {
  const joined = parts.join(" · ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

function relativeTime(at: number): string {
  const mins = Math.round((Date.now() - at) / 60_000);
  if (mins < 2) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

function linkSavedWorkspaces(result: AnalysisResult, workspaces: { id: string; originGroupId?: string }[]): void {
  const byOrigin = new Map(
    workspaces.filter((w) => w.originGroupId).map((w) => [w.originGroupId!, w.id]),
  );
  for (const group of result.groups) {
    const saved = byOrigin.get(group.id);
    if (saved) group.savedWorkspaceId = saved;
  }
}

async function persistGroupMemory(result: AnalysisResult, previous: PreviousGroup[]): Promise<void> {
  const prevById = new Map(previous.map((p) => [p.id, p]));
  const byId = new Map(result.tabs.map((t) => [t.tabId, t]));
  const memory: PreviousGroup[] = result.groups.map((group) => ({
    id: group.id,
    name: group.name,
    kind: group.kind,
    color: group.color,
    memberUrls: group.tabIds
      .map((id) => byId.get(id)?.normalizedUrl)
      .filter((u): u is string => Boolean(u)),
    userNamed: prevById.get(group.id)?.userNamed ?? false,
    savedWorkspaceId: group.savedWorkspaceId,
  }));
  await writeState({ groupMemory: memory });
}

/* ───────────────────── AI refinement (non-blocking) ───────────────────── */

let lastRefinementHash = "";

async function refineWithAi(result: AnalysisResult): Promise<void> {
  const byId = new Map(result.tabs.map((t) => [t.tabId, t]));
  const eligibleGroups = result.groups.filter((g) => !g.isStale && !g.isCatchAll);
  if (eligibleGroups.length === 0) return;

  const tabs = eligibleGroups
    .flatMap((g) => g.tabIds)
    .map((id) => byId.get(id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t) && !t!.excluded)
    .map((t) => ({
      key: String(t.tabId),
      title: t.title.slice(0, 300),
      domain: t.domain,
      category: t.category,
      searchQuery: t.searchQuery,
    }));
  if (tabs.length < 4 || tabs.length > 200) return;

  const proposed = eligibleGroups.map((g) => ({
    name: g.name,
    kind: g.kind,
    keys: g.tabIds.filter((id) => byId.get(id) && !byId.get(id)!.excluded).map(String),
  }));

  const hash = JSON.stringify(proposed);
  if (hash === lastRefinementHash) return;
  lastRefinementHash = hash;

  const refined = await api.aiOrganize({ tabs, proposed });
  const current = await readCached();
  if (!current || current.analyzedAt !== result.analyzedAt) return; // stale

  const { groupMemory } = await readState("groupMemory");
  const userNamed = new Set(groupMemory.filter((g) => g.userNamed).map((g) => g.id));

  applyRefinement(current, refined.groups, userNamed);
  await chrome.storage.session.set({ analysis: current });
  await persistGroupMemory(current, groupMemory);
  notifyUi();
}

function applyRefinement(
  result: AnalysisResult,
  refinedGroups: { name: string; kind: string; keys: string[]; insight?: string }[],
  userNamed: Set<string>,
): void {
  // Validate the AI contract: every key exactly once, all keys known.
  const known = new Set(result.tabs.filter((t) => !t.excluded).map((t) => String(t.tabId)));
  const seen = new Set<string>();
  for (const group of refinedGroups) {
    for (const key of group.keys) {
      if (!known.has(key) || seen.has(key)) return applyNamesOnly(result, refinedGroups, userNamed);
      seen.add(key);
    }
  }

  const special = result.groups.filter((g) => g.isStale || g.isCatchAll);
  const specialTabIds = new Set(special.flatMap((g) => g.tabIds));
  const refinedNonSpecial = refinedGroups
    .map((g) => ({ ...g, tabIds: g.keys.map(Number).filter((id) => !specialTabIds.has(id)) }))
    .filter((g) => g.tabIds.length > 0);

  const previous = result.groups.filter((g) => !g.isStale && !g.isCatchAll);
  const used = new Set<string>();
  const nextGroups: TabGroup[] = refinedNonSpecial.map((refined) => {
    let best: TabGroup | undefined;
    let bestOverlap = 0;
    for (const candidate of previous) {
      if (used.has(candidate.id)) continue;
      const overlap = candidate.tabIds.filter((id) => refined.tabIds.includes(id)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = candidate;
      }
    }
    if (best) used.add(best.id);
    const id = best?.id ?? `grp_${Math.random().toString(36).slice(2, 10)}`;
    const keepUserName = best && userNamed.has(best.id);
    return {
      id,
      name: keepUserName ? best!.name : refined.name,
      kind: (refined.kind as TabGroup["kind"]) ?? best?.kind ?? "research",
      tabIds: refined.tabIds,
      confidence: Math.max(best?.confidence ?? 0.6, 0.6),
      signals: best?.signals ?? [],
      entity: best?.entity,
      color: best?.color ?? "blue",
      savedWorkspaceId: best?.savedWorkspaceId,
      insight: refined.insight
        ? { text: refined.insight, source: "ai" as const, generatedAt: Date.now() }
        : best?.insight,
    };
  });

  result.groups = [...nextGroups, ...special];
}

function applyNamesOnly(
  result: AnalysisResult,
  refinedGroups: { name: string; keys: string[]; insight?: string }[],
  userNamed: Set<string>,
): void {
  for (const group of result.groups) {
    if (group.isStale || group.isCatchAll || userNamed.has(group.id)) continue;
    const ids = new Set(group.tabIds.map(String));
    let best: { name: string; insight?: string } | undefined;
    let bestOverlap = 0;
    for (const refined of refinedGroups) {
      const overlap = refined.keys.filter((k) => ids.has(k)).length;
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        best = refined;
      }
    }
    if (best && bestOverlap >= group.tabIds.length * 0.5) {
      group.name = best.name;
      if (best.insight) {
        group.insight = { text: best.insight, source: "ai", generatedAt: Date.now() };
      }
    }
  }
}

/* ───────────────────────────── UI notify ───────────────────────────── */

export function notifyUi(): void {
  chrome.runtime.sendMessage({ type: "tabmind:state-changed" }).catch(() => {
    /* no UI surface open — fine */
  });
}
