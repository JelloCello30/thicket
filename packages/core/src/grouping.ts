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
  /**
   * Native Chrome tab groups the USER created (not TabMind's mirrors).
   * Their members are honored as-is: one locked group each, the user's own
   * title and color, never split, renamed, or judged stale.
   */
  nativeGroups?: { id: number; title: string; color: GroupColor }[];
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

  // Tabs sitting in a user-created native group are spoken for — the user
  // already organized them. Pull them out before clustering.
  const nativeById = new Map((options.nativeGroups ?? []).map((g) => [g.id, g]));
  const nativeMemberIdx = new Map<number, number[]>();
  tabs.forEach((tab, i) => {
    if (tab.excluded || tab.chromeGroupId == null) return;
    if (!nativeById.has(tab.chromeGroupId)) return;
    const list = nativeMemberIdx.get(tab.chromeGroupId) ?? [];
    list.push(i);
    nativeMemberIdx.set(tab.chromeGroupId, list);
  });
  const nativeLocked = new Set([...nativeMemberIdx.values()].flat());

  const inputIdx = tabs.map((_, i) => i).filter((i) => !nativeLocked.has(i));
  const inputTabs = inputIdx.map((i) => tabs[i]!);
  const remap = (indices: number[]) => indices.map((i) => inputIdx[i]!);

  const outcome = clusterTabs(inputTabs, options.similarity ?? {}, options.tuning ?? {});

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
    const members = cluster.memberIdx.map((i) => inputTabs[i]!);
    const features = cluster.memberIdx.map((i) => outcome.features[i]!);
    const naming = nameCluster(members, features);
    const allStale = members.every((t) => t.staleness >= 0.85 && !t.pinned);
    drafts.push({
      tabIdx: remap(cluster.memberIdx),
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
      tabIdx: remap(outcome.readingIdx),
      name: "Reading",
      kind: "reading",
      signals: ["Articles and threads without a project attached"],
      confidence: 0.5,
    });
  }
  if (outcome.probablyDoneIdx.length > 0) {
    drafts.push({
      tabIdx: remap(outcome.probablyDoneIdx),
      name: "Probably done",
      kind: "stale",
      signals: ["No recent activity, not connected to active work"],
      confidence: 0.6,
      isStale: true,
    });
  }
  if (outcome.otherIdx.length > 0) {
    drafts.push({
      tabIdx: remap(outcome.otherIdx),
      name: "Everything else",
      kind: "other",
      signals: [],
      confidence: 0.3,
      isCatchAll: true,
    });
  }

  // One topic, one group. If two drafts named themselves identically — or
  // carry the same entity — they ARE the same activity that clustered apart;
  // merge them instead of showing the user two groups called the same thing.
  mergeDuplicateTopicDrafts(drafts);

  // Apply explicit user corrections before identity matching.
  if (options.lockedAssignments && options.lockedAssignments.size > 0) {
    applyLocks(drafts, tabs, options.lockedAssignments, options.previous ?? [], nativeLocked);
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

  // The user's own native groups, exactly as they made them. Identity comes
  // from the chrome group id; the name and color are theirs, verbatim.
  for (const [nativeId, memberIdx] of nativeMemberIdx) {
    const native = nativeById.get(nativeId)!;
    const members = memberIdx.map((i) => tabs[i]!);
    groups.push({
      id: `native-${nativeId}`,
      name: native.title.trim() || "Grouped by you",
      kind: dominantKind(members),
      tabIds: members.map((t) => t.tabId),
      confidence: 1,
      signals: ["You grouped these in Chrome — TabMind keeps hands off"],
      color: native.color,
      nativeGroupId: nativeId,
    });
  }

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

const SPECIAL_NAMES = new Set(["Reading", "Probably done", "Everything else"]);

/** Kinds that don't commit to a specific activity, so they can join anything. */
const GENERIC_KINDS = new Set<GroupKind>(["project", "research", "other"]);
/** Work, docs, and dev read as one working context. */
const WORKISH_KINDS = new Set<GroupKind>(["work"]);

function kindsCompatible(a: GroupKind, b: GroupKind): boolean {
  if (a === b) return true;
  if (GENERIC_KINDS.has(a) || GENERIC_KINDS.has(b)) return true;
  return WORKISH_KINDS.has(a) && WORKISH_KINDS.has(b);
}

/**
 * Two drafts that would render under the same name — or that revolve around
 * the same entity — are one activity the clusterer split. Showing both is the
 * "it created something new instead of merging" bug; fold them together.
 */
function mergeDuplicateTopicDrafts(
  drafts: {
    tabIdx: number[];
    name: string;
    kind: GroupKind;
    entity?: string;
    signals: string[];
    confidence: number;
    isCatchAll?: boolean;
    isStale?: boolean;
  }[],
): void {
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < drafts.length && !merged; i++) {
      const a = drafts[i]!;
      if (a.isCatchAll || SPECIAL_NAMES.has(a.name)) continue;
      for (let j = i + 1; j < drafts.length; j++) {
        const b = drafts[j]!;
        if (b.isCatchAll || SPECIAL_NAMES.has(b.name)) continue;
        const sameName = a.name.toLowerCase() === b.name.toLowerCase();
        // Sharing an entity is only evidence of one activity when the two
        // drafts are the same KIND of activity. "Los Angeles" is the entity of
        // both an apartment hunt and a flight search, and those are two
        // different intentions — merging them would be the over-merge bug.
        const sameEntity =
          Boolean(a.entity) &&
          Boolean(b.entity) &&
          a.entity!.toLowerCase() === b.entity!.toLowerCase() &&
          kindsCompatible(a.kind, b.kind);
        if (!sameName && !sameEntity) continue;
        // Keep the larger draft's identity — it carries more evidence.
        const [keep, absorb] = a.tabIdx.length >= b.tabIdx.length ? [a, b] : [b, a];
        keep.tabIdx = [...new Set([...keep.tabIdx, ...absorb.tabIdx])];
        keep.entity = keep.entity ?? absorb.entity;
        keep.confidence = Math.min(keep.confidence, absorb.confidence);
        keep.isStale = Boolean(keep.isStale && absorb.isStale);
        for (const signal of absorb.signals) {
          if (!keep.signals.includes(signal) && keep.signals.length < 3) keep.signals.push(signal);
        }
        drafts.splice(drafts.indexOf(absorb), 1);
        merged = true;
        break;
      }
    }
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
  nativeLocked: ReadonlySet<number> = new Set(),
): void {
  const prevById = new Map(previous.map((p) => [p.id, p]));
  for (const [url, targetGroupId] of locks) {
    const tabIdx = tabs.findIndex((t) => t.normalizedUrl === url);
    if (tabIdx < 0 || nativeLocked.has(tabIdx)) continue;
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

const CATEGORY_KIND: Partial<Record<AnalyzedTab["category"], GroupKind>> = {
  realestate: "realestate",
  travel: "travel",
  shopping: "shopping",
  dev: "work",
  work: "work",
  docs: "work",
  jobs: "jobs",
  learning: "learning",
  media: "media",
  reading: "reading",
};

function dominantKind(members: AnalyzedTab[]): GroupKind {
  const counts = new Map<GroupKind, number>();
  for (const m of members) {
    const kind = CATEGORY_KIND[m.category];
    if (kind) counts.set(kind, (counts.get(kind) ?? 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  return top && top[1] >= members.length / 2 ? top[0] : "project";
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
