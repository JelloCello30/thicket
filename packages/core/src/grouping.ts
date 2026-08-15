import type { AnalysisResult, AnalyzedTab, GroupColor, GroupKind, TabGroup, TabSnapshot } from "@tabmind/types";
import { clusterTabs, type ClusterTuning } from "./cluster";
import { nameCluster } from "./naming";
import { analyzeTabs, type AnalyzeContext } from "./analyze";
import type { SimilarityContext } from "./similarity";
import { jaccard } from "./text";

export interface PreviousGroup {
  id: string;
  name: string;
  kind: GroupKind;
  /** Normalized URLs of members at last analysis — survives tab-id churn. */
  memberUrls: string[];
  /** True when the user renamed it; user names are never overwritten. */
  userNamed?: boolean;
  color: GroupColor;
  savedWorkspaceId?: string;
}

export interface GroupingOptions {
  previous?: PreviousGroup[];
  similarity?: SimilarityContext;
  /** Explicit user corrections: normalized URL → group id it must live in. */
  lockedAssignments?: Map<string, string>;
  /** User-tunable clustering behavior ("grouping style" in Settings). */
  tuning?: ClusterTuning;
  idFactory?: () => string;
}

const KIND_COLORS: Record<GroupKind, GroupColor> = {
  project: "blue",
  travel: "cyan",
  shopping: "orange",
  realestate: "green",
  work: "blue",
  research: "purple",
  reading: "yellow",
  jobs: "pink",
  learning: "purple",
  media: "red",
  stale: "grey",
  other: "grey",
};

function defaultIdFactory(): string {
  return `grp_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Full pipeline: raw tabs → analyzed tabs → stable, named groups.
 * Group identity is preserved across runs (≥40% member overlap by URL),
 * so re-analysis refines the picture instead of reshuffling it.
 */
export function groupTabs(
  snapshots: TabSnapshot[],
  analyzeCtx: AnalyzeContext,
  options: GroupingOptions = {},
): AnalysisResult {
  const tabs = analyzeTabs(snapshots, analyzeCtx);
  return groupAnalyzedTabs(tabs, options, analyzeCtx.now, snapshots.length);
}

export function groupAnalyzedTabs(
  tabs: AnalyzedTab[],
  options: GroupingOptions = {},
  analyzedAt: number = Date.now(),
  totalTabs: number = tabs.length,
): AnalysisResult {
  const idFactory = options.idFactory ?? defaultIdFactory;
  const outcome = clusterTabs(tabs, options.similarity ?? {}, options.tuning ?? {});

  interface Draft {
    tabIdx: number[];
    name: string;
    kind: GroupKind;
    entity?: string;
    signals: string[];
    confidence: number;
    isCatchAll?: boolean;
    isStale?: boolean;
  }

  const drafts: Draft[] = [];
  for (const cluster of outcome.clusters) {
    const members = cluster.memberIdx.map((i) => tabs[i]!);
    const features = cluster.memberIdx.map((i) => outcome.features[i]!);
    const naming = nameCluster(members, features);
    const allStale = members.every((t) => t.staleness >= 0.85 && !t.pinned);
    drafts.push({
      tabIdx: cluster.memberIdx,
      name: naming.name,
      kind: naming.kind,
      entity: naming.entity,
      signals: naming.signals,
      confidence: Math.max(0.3, Math.min(0.95, cluster.cohesion + 0.25)),
      isStale: allStale,
    });
  }
  if (outcome.readingIdx.length > 0) {
    drafts.push({
      tabIdx: outcome.readingIdx,
      name: "Reading",
      kind: "reading",
      signals: ["Articles and threads without a project attached"],
      confidence: 0.5,
    });
  }
  if (outcome.probablyDoneIdx.length > 0) {
    drafts.push({
      tabIdx: outcome.probablyDoneIdx,
      name: "Probably done",
      kind: "stale",
      signals: ["No recent activity, not connected to active work"],
      confidence: 0.6,
      isStale: true,
    });
  }
  if (outcome.otherIdx.length > 0) {
    drafts.push({
      tabIdx: outcome.otherIdx,
      name: "Everything else",
      kind: "other",
      signals: [],
      confidence: 0.3,
      isCatchAll: true,
    });
  }

  // Apply explicit user corrections before identity matching.
  if (options.lockedAssignments && options.lockedAssignments.size > 0) {
    applyLocks(drafts, tabs, options.lockedAssignments, options.previous ?? []);
  }

  // Stable identity: reuse previous ids/names when membership overlaps.
  const previous = options.previous ?? [];
  const usedPrev = new Set<string>();
  const groups: TabGroup[] = drafts.map((draft) => {
    const urls = draft.tabIdx.map((i) => tabs[i]!.normalizedUrl);
    let match: PreviousGroup | undefined;
    let matchScore = 0;
    for (const prev of previous) {
      if (usedPrev.has(prev.id)) continue;
      const overlap = jaccard(urls, prev.memberUrls);
      if (overlap > matchScore) {
        matchScore = overlap;
        match = prev;
      }
    }
    if (match && matchScore >= 0.4) {
      usedPrev.add(match.id);
      const keepName = match.userNamed || matchScore >= 0.5;
      return buildGroup(draft, tabs, {
        id: match.id,
        name: keepName && !draft.isCatchAll && !draft.isStale ? match.name : draft.name,
        color: match.color,
        savedWorkspaceId: match.savedWorkspaceId,
      });
    }
    return buildGroup(draft, tabs, { id: idFactory(), color: KIND_COLORS[draft.kind] });
  });

  sortGroups(groups, tabs);

  return { groups, tabs, analyzedAt, totalTabs };

  function buildGroup(
    draft: Draft,
    all: AnalyzedTab[],
    identity: { id: string; name?: string; color: GroupColor; savedWorkspaceId?: string },
  ): TabGroup {
    return {
      id: identity.id,
      name: identity.name ?? draft.name,
      kind: draft.kind,
      tabIds: draft.tabIdx.map((i) => all[i]!.tabId),
      confidence: draft.confidence,
      signals: draft.signals,
      entity: draft.entity,
      color: identity.color,
      savedWorkspaceId: identity.savedWorkspaceId,
      isCatchAll: draft.isCatchAll,
      isStale: draft.isStale,
    };
  }
}

function applyLocks(
  drafts: {
    tabIdx: number[];
    name: string;
    kind: GroupKind;
  }[],
  tabs: AnalyzedTab[],
  locks: Map<string, string>,
  previous: PreviousGroup[],
): void {
  const prevById = new Map(previous.map((p) => [p.id, p]));
  for (const [url, targetGroupId] of locks) {
    const tabIdx = tabs.findIndex((t) => t.normalizedUrl === url);
    if (tabIdx < 0) continue;
    const target = prevById.get(targetGroupId);
    if (!target) continue;
    // Find the draft that best matches the target group and move the tab there.
    let bestDraft: (typeof drafts)[number] | undefined;
    let bestOverlap = 0;
    for (const draft of drafts) {
      const urls = draft.tabIdx.map((i) => tabs[i]!.normalizedUrl);
      const overlap = jaccard(urls, target.memberUrls);
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestDraft = draft;
      }
    }
    if (!bestDraft || bestOverlap < 0.25) continue;
    for (const draft of drafts) {
      const pos = draft.tabIdx.indexOf(tabIdx);
      if (pos >= 0 && draft !== bestDraft) draft.tabIdx.splice(pos, 1);
    }
    if (!bestDraft.tabIdx.includes(tabIdx)) bestDraft.tabIdx.push(tabIdx);
  }
  // Drop drafts emptied by moves.
  for (let i = drafts.length - 1; i >= 0; i--) {
    if (drafts[i]!.tabIdx.length === 0) drafts.splice(i, 1);
  }
}

function sortGroups(groups: TabGroup[], tabs: AnalyzedTab[]): void {
  const byTabId = new Map(tabs.map((t) => [t.tabId, t]));
  const recency = (g: TabGroup): number => {
    let max = 0;
    for (const id of g.tabIds) {
      const t = byTabId.get(id);
      if (t?.active) return Number.MAX_SAFE_INTEGER;
      if (t?.lastAccessed && t.lastAccessed > max) max = t.lastAccessed;
    }
    return max;
  };
  groups.sort((a, b) => {
    const rank = (g: TabGroup) => (g.isStale && g.kind === "stale" ? 3 : g.isCatchAll ? 2 : g.isStale ? 1 : 0);
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    return recency(b) - recency(a);
  });
}
