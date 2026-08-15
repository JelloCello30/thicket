import { evaluateRules, type AutomationRule } from "@tabmind/core";
import type { AnalysisResult } from "@tabmind/types";
import { readState, updateState, type RuleActivityEntry } from "../shared/storage";
import { notifyUi } from "./analyzer";
import { closeTabs, saveWorkspaceFromGroup } from "./workspaces";
import { track } from "./analytics";

/**
 * Automation executor. The pure engine (core/rules) plans; this runs the
 * plan through the same code paths as manual actions — so every automated
 * close lands in an undo batch and shows up in the activity log.
 */

let running = false;

export async function runAutomations(analysis: AnalysisResult): Promise<void> {
  if (running) return;
  running = true;
  try {
    const { rules, prefs } = await readState("rules", "prefs");
    if (prefs.paused || rules.length === 0) return;

    const planned = evaluateRules(rules, analysis);
    if (planned.length === 0) return;

    const activity: RuleActivityEntry[] = [];
    const ranRuleIds = new Set<string>();

    for (const plan of planned) {
      try {
        switch (plan.action) {
          case "archive-group": {
            if (!plan.groupId || !plan.tabIds?.length) break;
            await saveWorkspaceFromGroup(analysis, plan.groupId).catch(() => undefined);
            const { undoBatchId } = await closeTabs(plan.tabIds, plan.groupName ?? "Automation", plan.groupName);
            activity.push({ at: Date.now(), description: plan.description, undoBatchId });
            break;
          }
          case "save-group": {
            if (!plan.groupId) break;
            await saveWorkspaceFromGroup(analysis, plan.groupId);
            activity.push({ at: Date.now(), description: plan.description });
            break;
          }
          case "close-duplicates": {
            if (!plan.tabIds?.length) break;
            const { undoBatchId } = await closeTabs(plan.tabIds, "Duplicates");
            activity.push({ at: Date.now(), description: plan.description, undoBatchId });
            break;
          }
          case "collapse-group":
          case "collapse-stale": {
            if (!plan.groupId) break;
            await collapseNativeGroup(plan.groupId);
            activity.push({ at: Date.now(), description: plan.description });
            break;
          }
        }
        ranRuleIds.add(plan.ruleId);
      } catch {
        /* one failed action never blocks the rest */
      }
    }

    if (ranRuleIds.size > 0) {
      await updateState("rules", (all) =>
        all.map((rule) =>
          ranRuleIds.has(rule.id)
            ? { ...rule, lastRanAt: Date.now(), runsCount: (rule.runsCount ?? 0) + 1 }
            : rule,
        ),
      );
      await updateState("ruleActivity", (log) => [...activity, ...log].slice(0, 30));
      track("automation_ran", { actions: activity.length });
      notifyUi();
    }
  } finally {
    running = false;
  }
}

async function collapseNativeGroup(groupId: string): Promise<void> {
  const raw = await chrome.storage.session.get("mirrorMap");
  const mirrorMap = (raw.mirrorMap as Record<string, number> | undefined) ?? {};
  const chromeGroupId = mirrorMap[groupId];
  if (chromeGroupId == null) return;
  await chrome.tabGroups.update(chromeGroupId, { collapsed: true }).catch(() => undefined);
}

/* ─────────────────────── rule management ─────────────────────── */

export async function addRule(
  condition: AutomationRule["condition"],
  action: AutomationRule["action"],
): Promise<void> {
  const rule: AutomationRule = {
    id: `rule_${crypto.randomUUID().replace(/-/g, "").slice(0, 10)}`,
    enabled: true,
    condition,
    action,
    createdAt: Date.now(),
  };
  await updateState("rules", (all) => [...all, rule].slice(0, 20));
  track("automation_created", { condition: condition.type, action: action.type });
}

export async function toggleRule(id: string, enabled: boolean): Promise<void> {
  await updateState("rules", (all) => all.map((r) => (r.id === id ? { ...r, enabled } : r)));
}

export async function deleteRule(id: string): Promise<void> {
  await updateState("rules", (all) => all.filter((r) => r.id !== id));
}
