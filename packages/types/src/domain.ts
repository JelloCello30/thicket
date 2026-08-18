/**
 * Core domain types shared by the extension, web app, and server.
 * These describe tabs as the product thinks about them: intentions, not URLs.
 */

/** Raw snapshot of a browser tab, as reported by the extension. */
export interface TabSnapshot {
  id: number;
  windowId: number;
  index: number;
  url: string;
  title: string;
  favIconUrl?: string;
  pinned: boolean;
  active: boolean;
  audible?: boolean;
  openerTabId?: number;
  /** Chrome tab-group id, -1 when ungrouped. */
  groupId?: number;
  /** ms epoch of last focus, when the browser reports it. */
  lastAccessed?: number;
  incognito?: boolean;
  discarded?: boolean;
}

export type SiteCategory =
  | "realestate"
  | "travel"
  | "shopping"
  | "dev"
  | "work"
  | "docs"
  | "media"
  | "social"
  | "discussion"
  | "news"
  | "reading"
  | "jobs"
  | "learning"
  | "finance"
  | "search"
  | "mail"
  | "ai"
  | "reference"
  | "other";

/** A tab after analysis: normalized, privacy-filtered, and feature-extracted. */
export interface AnalyzedTab {
  tabId: number;
  windowId: number;
  url: string;
  normalizedUrl: string;
  title: string;
  /** Registrable domain, e.g. "zillow.com". */
  domain: string;
  /** Human site name when known, e.g. "Zillow". */
  siteName: string;
  category: SiteCategory;
  /** Search query when the tab is a search-results page. */
  searchQuery?: string;
  /** Lowercased, stopworded title tokens. */
  tokens: string[];
  /** Proper-noun-ish entities pulled from the title, original casing. */
  entities: string[];
  openerTabId?: number;
  /** Native Chrome tab-group id the tab currently sits in (undefined/-1 = none). */
  chromeGroupId?: number;
  lastAccessed?: number;
  pinned: boolean;
  active: boolean;
  audible: boolean;
  /** 0 (fresh) → 1 (almost certainly done with this). */
  staleness: number;
  /** True when the tab must never leave the device (internal page, excluded site, sensitive URL). */
  excluded: boolean;
  /** Why it was excluded, for the privacy UI. */
  excludedReason?: "internal" | "sensitive-url" | "excluded-domain" | "incognito" | "paused";
}

/** Colors we can mirror onto native Chrome tab groups. */
export type GroupColor =
  | "grey"
  | "blue"
  | "red"
  | "yellow"
  | "green"
  | "pink"
  | "purple"
  | "cyan"
  | "orange";

export type GroupKind =
  | "project"
  | "travel"
  | "shopping"
  | "realestate"
  | "work"
  | "research"
  | "reading"
  | "jobs"
  | "learning"
  | "media"
  | "stale"
  | "other";

export interface GroupInsight {
  text: string;
  source: "local" | "ai";
  generatedAt: number;
}

/** A cluster of open tabs that appears to be one human intention. */
export interface TabGroup {
  /** Stable id, preserved across re-analysis so the UI stays calm. */
  id: string;
  name: string;
  kind: GroupKind;
  tabIds: number[];
  /** 0..1 — how confident the clusterer is that these belong together. */
  confidence: number;
  /** Short human-readable reasons ("same Google search", "all Zillow listings"). */
  signals: string[];
  /** Dominant entity, e.g. "Tokyo" or "Sony a7". */
  entity?: string;
  color: GroupColor;
  /** Set when this group has been saved as a workspace. */
  savedWorkspaceId?: string;
  /** True when the user named this group themselves — never overwrite it. */
  userNamed?: boolean;
  insight?: GroupInsight;
  /** The residual "Everything else" group. */
  isCatchAll?: boolean;
  /** The "Probably done" group of stale tabs. */
  isStale?: boolean;
  /**
   * Set when this group mirrors a native Chrome tab group the USER created.
   * Thicket never renames, recolors, moves, or auto-archives these.
   */
  nativeGroupId?: number;
}

export interface AnalysisResult {
  groups: TabGroup[];
  /** Tabs analyzed (excluded tabs are present but never grouped/synced). */
  tabs: AnalyzedTab[];
  analyzedAt: number;
  /** Total open tabs considered, including excluded ones. */
  totalTabs: number;
}

export type WorkspaceState = "active" | "archived";

export interface WorkspaceTabData {
  id: string;
  url: string;
  title: string;
  domain: string;
  faviconUrl?: string;
  pinned: boolean;
  position: number;
  note?: string;
  addedAt: number;
}

/** A saved project. Survives closed tabs; syncs to the server when signed in. */
export interface WorkspaceData {
  id: string;
  title: string;
  summary?: string;
  kind: GroupKind;
  state: WorkspaceState;
  color: GroupColor;
  tabs: WorkspaceTabData[];
  createdAt: number;
  updatedAt: number;
  lastActiveAt: number;
  position: number;
  /** Group id this was saved from, to link live tabs back to it. */
  originGroupId?: string;
}

export interface ClosedTabRecord {
  url: string;
  title: string;
  domain: string;
  faviconUrl?: string;
  closedAt: number;
  /** Group identity at close time — restores go back where they came from. */
  groupName?: string;
  groupId?: string;
  workspaceId?: string;
}

export type CleanupReason = "duplicate" | "stale" | "newtab" | "saved";

export interface CleanupCandidate {
  tabId: number;
  url: string;
  title: string;
  domain: string;
  reason: CleanupReason;
  /** For duplicates: the tab that stays open. */
  duplicateOfTabId?: number;
}

export interface CleanupPlan {
  candidates: CleanupCandidate[];
  counts: Record<CleanupReason, number>;
}

/** Structured summary of a group of tabs. Short by design. */
export interface GroupSummary {
  doing: string;
  findings: string[];
  keep: { url: string; title: string; why: string }[];
  nextStep?: string;
  /** Where this came from: on-device deterministic ("local") or the AI ("ai"). */
  source?: "local" | "ai";
}

export interface ComparisonColumn {
  key: string;
  label: string;
}

export interface ComparisonRow {
  url: string;
  title: string;
  /** Missing data is null — never fabricated. */
  values: Record<string, string | null>;
}

export interface ComparisonTable {
  subject: string;
  columns: ComparisonColumn[];
  rows: ComparisonRow[];
  /** Where this came from: on-device deterministic ("local") or the AI ("ai"). */
  source?: "local" | "ai";
}

/** What the command bar understood. */
export type CommandIntent =
  | { type: "search"; query: string; scope: "open" | "history" | "all" }
  | { type: "show_group"; groupId: string }
  | { type: "close"; target: "stale" | "duplicates" | "group"; groupId?: string }
  | { type: "save"; target: "group" | "matching"; groupId?: string; query?: string }
  | { type: "restore"; workspaceId: string }
  | { type: "summarize"; groupId: string }
  | { type: "compare"; groupId?: string }
  | { type: "cleanup" }
  | { type: "pause" }
  | { type: "resume" }
  | { type: "help"; query?: string }
  | { type: "open_dashboard"; section?: "settings" | "history" | "workspaces" | "automations" }
  | { type: "ask"; question: string }
  | { type: "unknown"; raw: string };

export type Plan = "free" | "pro";

export interface Entitlements {
  plan: Plan;
  /** null = unlimited. */
  maxWorkspaces: number | null;
  historyDays: number;
  semanticSearch: boolean;
  summaries: boolean;
  compare: boolean;
  /** AI organization/naming/command calls per day. */
  aiCallsPerDay: number;
  priorityAi: boolean;
}

export interface UserPreferences {
  /** Master switch: allow AI analysis of titles + URLs (server-side). */
  aiEnabled: boolean;
  /** Opt-in: allow page content to be read for better organization. */
  contentAnalysis: boolean;
  /** Keep a local/synced history of pages Thicket has seen. */
  historyEnabled: boolean;
  /** Sync workspaces + history to the account. */
  syncEnabled: boolean;
  /** Mirror Thicket groups onto native browser tab groups. */
  mirrorTabGroups: boolean;
  /** Everything off, nothing observed. */
  paused: boolean;
  theme: "system" | "light" | "dark";
  /** How choosy clustering is: calm = fewer/bigger groups, eager = more/smaller. */
  groupingStyle: "calm" | "balanced" | "eager";
  /** Hours before an untouched tab starts counting as done. */
  staleAfterHours: number;
  /** Order groups by most recent activity, by size, or alphabetically. */
  groupSort: "recent" | "size" | "name";
  /** Show the "Probably done" pile of stale tabs. */
  showStalePile: boolean;
  /** Show the "Everything else" pile of tabs that fit nowhere. */
  showCatchAll: boolean;
  /** Row height in group lists. */
  density: "comfortable" | "compact";
  /** Expand every group's tab list by default. */
  expandGroups: boolean;
}

export const DEFAULT_PREFERENCES: UserPreferences = {
  aiEnabled: true,
  contentAnalysis: false,
  historyEnabled: true,
  syncEnabled: true,
  mirrorTabGroups: true,
  paused: false,
  theme: "system",
  groupingStyle: "balanced",
  staleAfterHours: 24,
  groupSort: "recent",
  showStalePile: true,
  showCatchAll: true,
  density: "comfortable",
  expandGroups: true,
};

export interface DeviceInfo {
  id: string;
  name: string;
  browser: string;
  lastSeenAt: number;
  createdAt: number;
  revoked: boolean;
}
