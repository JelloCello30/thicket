import type { AnalysisResult } from "@tabmind/types";
import { findDuplicates } from "./cleanup";
import { tokenize } from "./text";

/**
 * The automation engine's pure half: given the user's rules and the current
 * analysis, decide what should happen. The extension executes the plan and
 * records it — every destructive action goes through the same close path as
 * manual actions, so it lands in an undo batch.
 *
 * Rules are deliberately a curated vocabulary, not a free-form builder:
 * every combination in the UI is one a human can reason about.
 */

export type RuleCondition =
  | { type: "group-stale"; hours: number; nameQuery?: string }
  | { type: "duplicates-exist" }
  | { type: "tab-count-over"; count: number };

export type RuleAction =
  | { type: "archive-group" } // save as workspace, then close the tabs
  | { type: "save-group" } // save silently, leave tabs open
  | { type: "collapse-group" } // collapse the native tab group
  | { type: "close-duplicates" }
  | { type: "collapse-stale" };

export interface AutomationRule {
  id: string;
  enabled: boolean;
  condition: RuleCondition;
  action: RuleAction;
  createdAt: number;
  lastRanAt?: number;
  runsCount?: number;
}

/** Which actions each condition supports — the UI builder enforces the same table. */
export const VALID_ACTIONS: Record<RuleCondition["type"], RuleAction["type"][]> = {
  "group-stale": ["archive-group", "save-group", "collapse-group"],
  "duplicates-exist": ["close-duplicates"],
  "tab-count-over": ["close-duplicates", "collapse-stale"],
};

export interface PlannedRuleAction {
  ruleId: string;
  action: RuleAction["type"];
  description: string;
  groupId?: string;
  groupName?: string;
  tabIds?: number[];
}

const DEFAULT_COOLDOWN_MS = 30 * 60_000;

/** Tabs a rule may never close: pinned, active, or audibly in use. */
function closableTabs(analysis: AnalysisResult, tabIds: number[]): number[] {
  const byId = new Map(analysis.tabs.map((t) => [t.tabId, t]));
  // Tabs inside a native group the user made are protected from automation —
  // even duplicate copies. The user arranged those on purpose.
  const nativeProtected = new Set(
    analysis.groups.filter((g) => g.nativeGroupId != null).flatMap((g) => g.tabIds),
  );
  return tabIds.filter((id) => {
    const tab = byId.get(id);
    return tab && !tab.pinned && !tab.active && !tab.audible && !nativeProtected.has(id);
  });
}

function groupInactiveHours(analysis: AnalysisResult, tabIds: number[], now: number): number {
  const byId = new Map(analysis.tabs.map((t) => [t.tabId, t]));
  let lastActive = 0;
  for (const id of tabIds) {
    const tab = byId.get(id);
    if (!tab) continue;
    if (tab.active) return 0;
    lastActive = Math.max(lastActive, tab.lastAccessed ?? 0);
  }
  if (lastActive === 0) return 0; // unknown activity — never treat as stale
  return (now - lastActive) / 3_600_000;
}

function nameMatches(query: string | undefined, name: string, entity?: string): boolean {
  if (!query) return true;
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return true;
  const label = new Set(tokenize(`${name} ${entity ?? ""}`));
  return queryTokens.every((t) => label.has(t));
}

export function evaluateRules(
  rules: AutomationRule[],
  analysis: AnalysisResult,
  now = Date.now(),
  cooldownMs = DEFAULT_COOLDOWN_MS,
): PlannedRuleAction[] {
  const planned: PlannedRuleAction[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.lastRanAt && now - rule.lastRanAt < cooldownMs) continue;
    if (!VALID_ACTIONS[rule.condition.type].includes(rule.action.type)) continue;

    switch (rule.condition.type) {
      case "group-stale": {
        for (const group of analysis.groups) {
          // Special piles aren't projects: never archive them automatically;
          // collapsing them is fine. Native groups the user made themselves
          // are theirs — automations never touch them.
          if (group.isCatchAll || group.nativeGroupId != null) continue;
          if (group.isStale && rule.action.type !== "collapse-group") continue;
          if (group.savedWorkspaceId && rule.action.type === "save-group") continue;
          if (!nameMatches(rule.condition.nameQuery, group.name, group.entity)) continue;
          const hours = groupInactiveHours(analysis, group.tabIds, now);
          if (hours < rule.condition.hours) continue;
          const tabIds =
            rule.action.type === "archive-group" ? closableTabs(analysis, group.tabIds) : group.tabIds;
          if (tabIds.length < 2) continue;
          planned.push({
            ruleId: rule.id,
            action: rule.action.type,
            groupId: group.id,
            groupName: group.name,
            tabIds,
            description: describeAction(rule.action.type, group.name, tabIds.length),
          });
        }
        break;
      }
      case "duplicates-exist": {
        const duplicates = findDuplicates(analysis.tabs);
        const tabIds = closableTabs(analysis, duplicates.map((d) => d.tabId));
        if (tabIds.length === 0) break;
        planned.push({
          ruleId: rule.id,
          action: "close-duplicates",
          tabIds,
          description: `Closed ${tabIds.length} duplicate ${tabIds.length === 1 ? "tab" : "tabs"}`,
        });
        break;
      }
      case "tab-count-over": {
        if (analysis.totalTabs <= rule.condition.count) break;
        if (rule.action.type === "close-duplicates") {
          const duplicates = findDuplicates(analysis.tabs);
          const tabIds = closableTabs(analysis, duplicates.map((d) => d.tabId));
          if (tabIds.length === 0) break;
          planned.push({
            ruleId: rule.id,
            action: "close-duplicates",
            tabIds,
            description: `Over ${rule.condition.count} tabs — closed ${tabIds.length} duplicates`,
          });
        } else {
          const staleGroups = analysis.groups.filter((g) => g.isStale);
          if (staleGroups.length === 0) break;
          for (const group of staleGroups) {
            planned.push({
              ruleId: rule.id,
              action: "collapse-stale",
              groupId: group.id,
              groupName: group.name,
              description: `Over ${rule.condition.count} tabs — collapsed “${group.name}”`,
            });
          }
        }
        break;
      }
    }
  }

  return planned;
}

function describeAction(action: RuleAction["type"], groupName: string, count: number): string {
  switch (action) {
    case "archive-group":
      return `Saved “${groupName}” and closed its ${count} tabs`;
    case "save-group":
      return `Saved “${groupName}” (${count} tabs stay open)`;
    case "collapse-group":
      return `Collapsed “${groupName}”`;
    default:
      return groupName;
  }
}

/** Human sentence for the rule list. */
export function describeRule(rule: AutomationRule): string {
  const condition =
    rule.condition.type === "group-stale"
      ? `a group${rule.condition.nameQuery ? ` matching “${rule.condition.nameQuery}”` : ""} is untouched for ${formatHours(rule.condition.hours)}`
      : rule.condition.type === "duplicates-exist"
        ? "duplicate tabs appear"
        : `open tabs exceed ${rule.condition.count}`;
  const action =
    rule.action.type === "archive-group"
      ? "save it and close its tabs"
      : rule.action.type === "save-group"
        ? "save it as a workspace"
        : rule.action.type === "collapse-group"
          ? "collapse it"
          : rule.action.type === "close-duplicates"
            ? "close the extras"
            : "collapse stale groups";
  return `When ${condition}, ${action}.`;
}

function formatHours(hours: number): string {
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  return days === 7 ? "a week" : `${days}d`;
}
