import type {
  ClosedTabRecord,
  GroupColor,
  UserPreferences,
  WorkspaceData,
} from "@tabmind/types";
import type { AutomationRule, FocusSessionState, PreviousGroup } from "@tabmind/core";
import { DEFAULT_PREFERENCES } from "@tabmind/types";

/** Typed facade over chrome.storage — one place that knows the keys. */

export interface AuthState {
  token: string;
  deviceId: string;
  user: { email: string; name: string; plan: "free" | "pro" };
}

export interface LocalPage {
  url: string;
  normalizedUrl: string;
  title: string;
  domain: string;
  faviconUrl?: string;
  firstSeenAt: number;
  lastSeenAt: number;
  visits: number;
  /** Queued for server sync (signed-in only). */
  pendingSync?: boolean;
}

export interface ClosedBatch {
  id: string;
  label: string;
  tabs: {
    url: string;
    title: string;
    /** Group identity at close time so undo puts tabs back where they were. */
    groupId?: string;
    groupName?: string;
    groupColor?: GroupColor;
  }[];
  at: number;
}

/** Group memory entries carry when they were last seen so restores can land. */
export interface RememberedGroup extends PreviousGroup {
  lastSeenAt?: number;
}

export interface RuleActivityEntry {
  at: number;
  description: string;
  undoBatchId?: string;
}

export interface CorrectionState {
  /** normalizedUrl → group id it must live in. */
  locks: Record<string, string>;
  /** Domain-pair affinity learned from moves/merges. */
  pairBoosts: { a: string; b: string; delta: number }[];
}

export interface LocalState {
  prefs: UserPreferences;
  excludedDomains: string[];
  auth: AuthState | null;
  workspaces: WorkspaceData[];
  recentlyClosed: ClosedTabRecord[];
  localHistory: LocalPage[];
  closedBatches: ClosedBatch[];
  groupMemory: RememberedGroup[];
  corrections: CorrectionState;
  pendingWorkspaceSync: { upsertIds: string[]; deleteIds: string[] };
  focus: FocusSessionState | null;
  rules: AutomationRule[];
  ruleActivity: RuleActivityEntry[];
  onboarded: boolean;
  installedAt: number;
  firstAnalyzedAt: number;
  appUrlOverride?: string;
}

export const DEFAULT_LOCAL_STATE: LocalState = {
  prefs: DEFAULT_PREFERENCES,
  excludedDomains: [],
  auth: null,
  workspaces: [],
  recentlyClosed: [],
  localHistory: [],
  closedBatches: [],
  groupMemory: [],
  corrections: { locks: {}, pairBoosts: [] },
  pendingWorkspaceSync: { upsertIds: [], deleteIds: [] },
  focus: null,
  rules: [],
  ruleActivity: [],
  onboarded: false,
  installedAt: 0,
  firstAnalyzedAt: 0,
};

export async function readState<K extends keyof LocalState>(
  ...keys: K[]
): Promise<Pick<LocalState, K>> {
  const raw = await chrome.storage.local.get(keys);
  const out = {} as Pick<LocalState, K>;
  for (const key of keys) {
    let value = (raw[key] ?? structuredClone(DEFAULT_LOCAL_STATE[key])) as LocalState[K];
    // Preferences gain fields across releases; stored objects merge over
    // defaults so new switches are never undefined.
    if (key === "prefs" && raw[key]) {
      value = { ...DEFAULT_PREFERENCES, ...(raw[key] as UserPreferences) } as LocalState[K];
    }
    out[key] = value;
  }
  return out;
}

export async function writeState(patch: Partial<LocalState>): Promise<void> {
  await chrome.storage.local.set(patch);
}

export async function updateState<K extends keyof LocalState>(
  key: K,
  fn: (current: LocalState[K]) => LocalState[K],
): Promise<LocalState[K]> {
  const current = (await readState(key))[key];
  const next = fn(current);
  await chrome.storage.local.set({ [key]: next });
  return next;
}
