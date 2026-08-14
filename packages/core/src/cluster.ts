import type { AnalyzedTab } from "@tabmind/types";
import { LIMITS, STALENESS } from "@tabmind/config";
import { READING_CATEGORIES } from "./sites";
import { featuresFor, pairScore, sessionTokenDf, type SimilarityContext, type TabFeatures } from "./similarity";

/** A raw cluster before naming: indexes into the analyzed-tab array. */
export interface RawCluster {
  memberIdx: number[];
  /** Mean pairwise similarity inside the cluster (1 for singletons). */
  cohesion: number;
}

export interface ClusterOutcome {
  clusters: RawCluster[];
  /** Leftover tabs that read as casual reading. */
  readingIdx: number[];
  /** Leftover stale tabs — the "Probably done" pile. */
  probablyDoneIdx: number[];
  /** Everything else that didn't fit. */
  otherIdx: number[];
  features: TabFeatures[];
}

const UNION_THRESHOLD = 0.45;
const MERGE_THRESHOLD = 0.35;
const ATTACH_THRESHOLD = 0.4;
/** Weaker attach bar when the singleton shares the cluster's dominant theme. */
const THEME_ATTACH_THRESHOLD = 0.22;

class UnionFind {
  private parent: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
  }
  find(x: number): number {
    let root = x;
    while (this.parent[root] !== root) root = this.parent[root]!;
    while (this.parent[x] !== root) {
      const next = this.parent[x]!;
      this.parent[x] = root;
      x = next;
    }
    return root;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[rb] = ra;
  }
}

function meanLink(scores: number[][], groupA: number[], groupB: number[]): number {
  let sum = 0;
  let n = 0;
  for (const a of groupA) {
    for (const b of groupB) {
      if (a === b) continue;
      sum += scores[a]![b]!;
      n++;
    }
  }
  return n === 0 ? 0 : sum / n;
}

function cohesion(scores: number[][], members: number[]): number {
  if (members.length <= 1) return 1;
  return meanLink(scores, members, members);
}

/**
 * Group open tabs into intentions.
 *
 * Union-find over strong pairwise edges, then three refinement passes:
 * merge clusters that clearly belong together, attach loose singletons,
 * and route the remainder into Reading / Probably done / Everything else.
 */
export function clusterTabs(tabs: AnalyzedTab[], ctx: SimilarityContext = {}): ClusterOutcome {
  const features = featuresFor(tabs);
  const effectiveCtx: SimilarityContext = {
    ...ctx,
    tokenDf: ctx.tokenDf ?? sessionTokenDf(features),
  };
  const eligible: number[] = [];
  for (let i = 0; i < tabs.length; i++) {
    if (!tabs[i]!.excluded) eligible.push(i);
  }

  // Pairwise similarity matrix over eligible tabs (n² but n is tab count).
  const scores: number[][] = Array.from({ length: tabs.length }, () =>
    new Array<number>(tabs.length).fill(0),
  );
  for (let x = 0; x < eligible.length; x++) {
    for (let y = x + 1; y < eligible.length; y++) {
      const i = eligible[x]!;
      const j = eligible[y]!;
      const s = pairScore(features[i]!, features[j]!, effectiveCtx);
      scores[i]![j] = s;
      scores[j]![i] = s;
    }
  }

  const uf = new UnionFind(tabs.length);
  for (const i of eligible) {
    for (const j of eligible) {
      if (i < j && scores[i]![j]! >= UNION_THRESHOLD) uf.union(i, j);
    }
  }

  const groups = new Map<number, number[]>();
  for (const i of eligible) {
    const root = uf.find(i);
    const arr = groups.get(root) ?? [];
    arr.push(i);
    groups.set(root, arr);
  }

  // Pass 1 — merge clusters whose average cross-linkage is high.
  let merged = true;
  let guard = 0;
  while (merged && guard++ < 10) {
    merged = false;
    const entries = [...groups.entries()].filter(([, m]) => m.length >= 2);
    outer: for (let x = 0; x < entries.length; x++) {
      for (let y = x + 1; y < entries.length; y++) {
        const [ka, ma] = entries[x]!;
        const [kb, mb] = entries[y]!;
        if (meanLink(scores, ma, mb) >= MERGE_THRESHOLD) {
          groups.set(ka, [...ma, ...mb]);
          groups.delete(kb);
          merged = true;
          break outer;
        }
      }
    }
  }

  // Pass 2 — attach singletons to their best real cluster. A singleton joins
  // when it relates strongly to at least one member (max link) or decently to
  // the whole cluster (mean link).
  const singles = [...groups.entries()].filter(([, m]) => m.length === 1);
  const realKeys = [...groups.keys()].filter((k) => groups.get(k)!.length >= LIMITS.minGroupSize);
  const dominantTheme = (members: number[]): string | null => {
    const counts = new Map<string, number>();
    for (const m of members) {
      for (const theme of features[m]!.themes) counts.set(theme, (counts.get(theme) ?? 0) + 1);
    }
    for (const [theme, count] of counts) {
      if (count >= members.length * 0.5) return theme;
    }
    return null;
  };

  for (const [key, members] of singles) {
    const idx = members[0]!;
    let bestKey: number | null = null;
    let bestCombined = 0;
    for (const rk of realKeys) {
      if (rk === key) continue;
      const cluster = groups.get(rk)!;
      const mean = meanLink(scores, [idx], cluster);
      let max = 0;
      for (const m of cluster) max = Math.max(max, scores[idx]![m]!);
      const clusterTheme = dominantTheme(cluster);
      const themeMatch = clusterTheme != null && features[idx]!.themes.has(clusterTheme as never);
      const qualifies =
        max >= UNION_THRESHOLD ||
        mean >= ATTACH_THRESHOLD ||
        (themeMatch && mean >= THEME_ATTACH_THRESHOLD);
      const combined = mean + max * 0.5 + (themeMatch ? 0.15 : 0);
      if (qualifies && combined > bestCombined) {
        bestCombined = combined;
        bestKey = rk;
      }
    }
    if (bestKey != null) {
      groups.get(bestKey)!.push(idx);
      groups.delete(key);
    }
  }

  // Split real clusters from leftovers.
  const clusters: RawCluster[] = [];
  const leftovers: number[] = [];
  for (const members of groups.values()) {
    if (members.length >= LIMITS.minGroupSize) {
      clusters.push({ memberIdx: members.sort((a, b) => a - b), cohesion: cohesion(scores, members) });
    } else {
      leftovers.push(...members);
    }
  }
  clusters.sort((a, b) => b.memberIdx.length - a.memberIdx.length);

  // Pass 3 — cap group count; fold the weakest tail into leftovers.
  while (clusters.length > LIMITS.maxGroups) {
    let weakest = clusters.length - 1;
    for (let i = clusters.length - 1; i >= 0; i--) {
      const c = clusters[i]!;
      const w = clusters[weakest]!;
      if (c.cohesion * c.memberIdx.length < w.cohesion * w.memberIdx.length) weakest = i;
    }
    leftovers.push(...clusters[weakest]!.memberIdx);
    clusters.splice(weakest, 1);
  }

  // Route leftovers.
  const readingIdx: number[] = [];
  const probablyDoneIdx: number[] = [];
  const otherIdx: number[] = [];
  for (const idx of leftovers) {
    const tab = tabs[idx]!;
    if (tab.staleness >= STALENESS.probablyDoneThreshold && !tab.pinned) {
      probablyDoneIdx.push(idx);
    } else if (READING_CATEGORIES.has(tab.category)) {
      readingIdx.push(idx);
    } else {
      otherIdx.push(idx);
    }
  }
  // A lone "probably done" tab isn't worth a group of its own.
  if (probablyDoneIdx.length === 1) {
    otherIdx.push(probablyDoneIdx.pop()!);
  }
  if (readingIdx.length === 1) {
    otherIdx.push(readingIdx.pop()!);
  }

  return { clusters, readingIdx, probablyDoneIdx, otherIdx, features };
}
