import type {
  ClosedTabRecord,
  UserPreferences,
  WorkspaceData,
} from "@tabmind/types";
import type { PreviousGroup } from "@tabmind/core";
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
  tabs: { url: string; title: string }[];
  at: number;
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
  groupMemory: PreviousGroup[];
  corrections: CorrectionState;
  pendingWorkspaceSync: { upsertIds: string[]; deleteIds: string[] };
  onboarded: boolean;
  installedAt: number;
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
  onboarded: false,
  installedAt: 0,
};

export async function readState<K extends keyof LocalState>(
  ...keys: K[]
): Promise<Pick<LocalState, K>> {
  const raw = await chrome.storage.local.get(keys);
  const out = {} as Pick<LocalState, K>;
  for (const key of keys) {
    out[key] = (raw[key] ?? structuredClone(DEFAULT_LOCAL_STATE[key])) as LocalState[K];
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
