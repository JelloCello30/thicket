import type {
  AnalysisResult,
  CleanupPlan,
  ClosedTabRecord,
  ComparisonTable,
  GroupSummary,
  UserPreferences,
  WorkspaceData,
} from "@thicket/types";
import type { AutomationRule, ScoredDoc } from "@thicket/core";
import type { AuthState, ClosedBatch, RuleActivityEntry } from "./storage";

/**
 * The typed protocol between UI surfaces and the background service worker.
 * Every request type maps to exactly one response type; `sendBg` enforces it.
 */

export interface UiState {
  analysis: AnalysisResult | null;
  prefs: UserPreferences;
  excludedDomains: string[];
  auth: AuthState | null;
  workspaces: WorkspaceData[];
  recentlyClosed: ClosedTabRecord[];
  closedBatches: ClosedBatch[];
  rules: AutomationRule[];
  ruleActivity: RuleActivityEntry[];
  onboarded: boolean;
  contentPermission: boolean;
  appUrl: string;
  version: string;
}

export interface CommandOutcome {
  kind:
    | "searched"
    | "shown"
    | "closed"
    | "saved"
    | "restored"
    | "summarized"
    | "compared"
    | "cleanup-plan"
    | "prefs"
    | "answer"
    | "navigate"
    | "help"
    | "none";
  message?: string;
  searchResults?: SearchOutcome;
  summary?: GroupSummary;
  comparison?: ComparisonTable;
  cleanupPlan?: CleanupPlan;
  groupId?: string;
  undoBatchId?: string;
  section?: string;
  helpQuery?: string;
}

export interface SearchOutcome {
  query: string;
  open: ScoredDoc[];
  history: ScoredDoc[];
  workspaces: ScoredDoc[];
  /** True when results came from the server's semantic index. */
  semantic: boolean;
}

export type BgRequest =
  | { type: "get-state" }
  | { type: "analyze-now" }
  | { type: "set-prefs"; patch: Partial<UserPreferences> }
  | { type: "excluded-add"; domain: string }
  | { type: "excluded-remove"; domain: string }
  | { type: "command"; input: string }
  | { type: "search"; query: string; scope?: "open" | "history" | "all" }
  | { type: "save-workspace"; groupId: string }
  | { type: "close-group"; groupId: string; save: boolean }
  | { type: "restore-workspace"; workspaceId: string }
  | { type: "set-workspace-state"; workspaceId: string; state: "active" | "archived" }
  | { type: "delete-workspace"; workspaceId: string }
  | { type: "rename-workspace"; workspaceId: string; title: string }
  | { type: "rename-group"; groupId: string; name: string }
  | { type: "cleanup-plan" }
  | { type: "cleanup-run"; tabIds: number[] }
  | { type: "undo-batch"; batchId: string }
  | { type: "focus-group"; groupId: string }
  | { type: "focus-tab"; tabId: number }
  | { type: "move-tab"; tabId: number; toGroupId: string }
  | { type: "merge-groups"; fromGroupId: string; intoGroupId: string }
  | { type: "summarize-group"; groupId: string }
  | { type: "compare-group"; groupId: string }
  | { type: "link-device"; code: string }
  | { type: "sign-out" }
  | { type: "reopen"; url: string }
  | { type: "request-content-permission" }
  | { type: "open-dashboard"; section?: string; command?: boolean }
  | { type: "rules-add"; condition: AutomationRule["condition"]; action: AutomationRule["action"] }
  | { type: "rules-toggle"; id: string; enabled: boolean }
  | { type: "rules-delete"; id: string }
  | { type: "history-delete"; url: string }
  | { type: "history-clear" };

export interface BgResponses {
  "get-state": UiState;
  "analyze-now": UiState;
  "set-prefs": UiState;
  "excluded-add": UiState;
  "excluded-remove": UiState;
  command: CommandOutcome;
  search: SearchOutcome;
  "save-workspace": { workspace: WorkspaceData };
  "close-group": { closedCount: number; undoBatchId: string; workspace?: WorkspaceData };
  "restore-workspace": { opened: number };
  "set-workspace-state": UiState;
  "delete-workspace": UiState;
  "rename-workspace": UiState;
  "rename-group": UiState;
  "cleanup-plan": CleanupPlan;
  "cleanup-run": { closedCount: number; undoBatchId: string };
  "undo-batch": { reopened: number };
  "focus-group": { ok: true };
  "focus-tab": { ok: true };
  "move-tab": UiState;
  "merge-groups": UiState;
  "summarize-group": { summary: GroupSummary };
  "compare-group": { comparison: ComparisonTable };
  "link-device": { auth: AuthState };
  "sign-out": UiState;
  reopen: { ok: true };
  "request-content-permission": { granted: boolean };
  "open-dashboard": { ok: true };
  "rules-add": UiState;
  "rules-toggle": UiState;
  "rules-delete": UiState;
  "history-delete": UiState;
  "history-clear": UiState;
}

export interface BgError {
  __error: true;
  code: "ai-unavailable" | "auth-required" | "pro-required" | "network" | "not-found" | "internal";
  message: string;
}

export type BgResponse<T extends BgRequest["type"]> = BgResponses[T] | BgError;

export function isBgError(value: unknown): value is BgError {
  return typeof value === "object" && value !== null && (value as BgError).__error === true;
}

/**
 * UI → background. Rejects with a typed error message on failure.
 * MV3 service workers can be asleep when the first message lands (the promise
 * resolves `undefined` or rejects with a connection error) — retry once after
 * a beat so "search sometimes does nothing" can't happen. App-level errors
 * (BgError) are real answers and are never retried.
 */
export async function sendBg<T extends BgRequest["type"]>(
  request: Extract<BgRequest, { type: T }>,
): Promise<BgResponses[T]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 250 * attempt));
    try {
      const response = (await chrome.runtime.sendMessage(request)) as BgResponse<T> | undefined;
      if (response === undefined) {
        lastError = new Error("Thicket is waking up — try that again.");
        continue;
      }
      if (isBgError(response)) {
        const error = new Error(response.message) as Error & { code: BgError["code"] };
        error.code = response.code;
        throw error;
      }
      return response;
    } catch (error) {
      if (error instanceof Error && "code" in error) throw error;
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Thicket didn't respond.");
}

/** Broadcast from background → all UI surfaces when state changes. */
export const STATE_CHANGED = "thicket:state-changed";
