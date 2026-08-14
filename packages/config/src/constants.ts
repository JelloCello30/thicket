/** Timing + limits tuned for calm behavior. All ms unless noted. */
export const TIMING = {
  /** Wait for tab churn to settle before re-analyzing. */
  analyzeDebounce: 2_500,
  /** Never analyze more often than this even under constant churn. */
  analyzeMaxInterval: 20_000,
  /** Flush the sync queue at most this often. */
  syncFlushInterval: 30_000,
  /** How long the undo toast for a close action stays actionable. */
  undoWindow: 30_000,
} as const;

export const LIMITS = {
  /** Beyond this, a group is split visually but stays one group. */
  maxTabsPerGroup: 60,
  /** Soft cap on how many groups we show; extras fold into "Everything else". */
  maxGroups: 8,
  minGroupSize: 2,
  recentlyClosedKept: 100,
  /** Local page-memory entries kept in extension storage (signed-out). */
  localHistoryMax: 2_000,
  syncBatchMax: 200,
} as const;

export const STALENESS = {
  /** Hours without focus before a tab starts counting as stale. */
  staleAfterHours: 24,
  /** Staleness score above which a tab is a cleanup candidate. */
  cleanupThreshold: 0.75,
  /** Staleness above which unclustered tabs land in "Probably done". */
  probablyDoneThreshold: 0.85,
} as const;

/** Rate limits enforced server-side (per user). */
export const RATE_LIMITS = {
  aiPerMinute: 10,
  syncPerMinute: 30,
  searchPerMinute: 30,
  eventsPerMinute: 60,
} as const;

export const AI_CACHE_TTL_HOURS = 24 * 7;

export const EXTENSION = {
  /** Chrome extension IDs allowed to talk to the web app (dev id set via env). */
  storeName: "TabMind — Your tabs, organized",
  version: "0.1.0",
} as const;
