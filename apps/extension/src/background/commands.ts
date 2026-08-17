import { buildCleanupPlan, normalizeUrl, parseCommand } from "@thicket/core";
import type { AnalysisResult, CommandIntent } from "@thicket/types";
import { api } from "../shared/api";
import { readState, writeState } from "../shared/storage";
import type { CommandOutcome } from "../shared/messages";
import { getAnalysis, notifyUi, runAnalysis } from "./analyzer";
import { runSearch } from "./search";
import { closeTabs, restoreWorkspace, saveWorkspaceFromGroup } from "./workspaces";
import { summarizeGroup, compareGroup } from "./ai-features";
import { track } from "./analytics";

/**
 * The command bar's brain: parse locally first (instant, offline), fall back
 * to the server AI for free-form asks, then execute through the same actions
 * the buttons use. Never a dead end — unknown input becomes a search.
 */
export async function executeCommand(input: string): Promise<CommandOutcome> {
  const analysis = await getAnalysis();
  const { workspaces } = await readState("workspaces");
  const context = {
    groups: analysis.groups.map((g) => ({ id: g.id, name: g.name, entity: g.entity })),
    workspaces: workspaces.map((w) => ({ id: w.id, title: w.title })),
  };

  let intent = parseCommand(input, context);
  track("ai_command_used", { local: intent.type !== "ask" });

  if (intent.type === "ask" || intent.type === "unknown") {
    intent = await aiFallback(input, context, intent);
  }
  let outcome = await execute(intent, analysis);

  // Local search found nothing? Before showing an empty list, let the AI
  // reinterpret the request once — "that pdf about visas" may really mean
  // a group, a workspace, or a differently-worded search.
  if (
    outcome.kind === "searched" &&
    intent.type === "search" &&
    isEmptySearch(outcome.searchResults)
  ) {
    const escalated = await aiFallback(input, context, { type: "unknown", raw: input });
    const sameSearch = escalated.type === "search" && escalated.query === intent.query;
    if (!sameSearch) outcome = await execute(escalated, analysis);
  }
  return outcome;
}

function isEmptySearch(results: CommandOutcome["searchResults"]): boolean {
  if (!results) return true;
  return results.open.length === 0 && results.history.length === 0 && results.workspaces.length === 0;
}

async function aiFallback(
  input: string,
  context: { groups: { id: string; name: string }[]; workspaces: { id: string; title: string }[] },
  fallthrough: CommandIntent,
): Promise<CommandIntent> {
  const { auth, prefs } = await readState("auth", "prefs");
  if (!auth || !prefs.aiEnabled) {
    // Honest degradation: no AI available → search.
    return fallthrough.type === "ask"
      ? { type: "search", query: fallthrough.question, scope: "all" }
      : { type: "search", query: input, scope: "all" };
  }
  try {
    const result = await api.aiCommand({
      input,
      context: {
        groups: context.groups.map(({ id, name }) => ({ id, name })),
        workspaces: context.workspaces.map(({ id, title }) => ({ id, title })),
      },
    });
    switch (result.intent) {
      case "search":
        return { type: "search", query: result.query ?? input, scope: "all" };
      case "show_group":
        return result.groupId ? { type: "show_group", groupId: result.groupId } : fallbackSearch(input);
      case "close_group":
        return result.groupId
          ? { type: "close", target: "group", groupId: result.groupId }
          : fallbackSearch(input);
      case "close_stale":
        return { type: "close", target: "stale" };
      case "close_duplicates":
        return { type: "close", target: "duplicates" };
      case "save_group":
        return result.groupId ? { type: "save", target: "group", groupId: result.groupId } : fallbackSearch(input);
      case "restore_workspace":
        return result.workspaceId ? { type: "restore", workspaceId: result.workspaceId } : fallbackSearch(input);
      case "summarize_group":
        return result.groupId ? { type: "summarize", groupId: result.groupId } : fallbackSearch(input);
      case "compare_group":
        return { type: "compare", groupId: result.groupId };
      case "cleanup":
        return { type: "cleanup" };
      case "answer":
        return { type: "ask", question: result.answer ?? input };
      default:
        return fallbackSearch(input);
    }
  } catch {
    return fallbackSearch(input);
  }
}

function fallbackSearch(input: string): CommandIntent {
  return { type: "search", query: input, scope: "all" };
}

async function execute(intent: CommandIntent, analysis: AnalysisResult): Promise<CommandOutcome> {
  switch (intent.type) {
    case "search": {
      track("search_used", { via: "command" });
      const searchResults = await runSearch(intent.query, intent.scope);
      return { kind: "searched", searchResults };
    }
    case "show_group": {
      await focusGroup(analysis, intent.groupId);
      return { kind: "shown", groupId: intent.groupId };
    }
    case "close": {
      if (intent.target === "group" && intent.groupId) {
        const group = analysis.groups.find((g) => g.id === intent.groupId);
        if (!group) return { kind: "none", message: "That group is gone." };
        const { closedCount, undoBatchId } = await closeTabs(group.tabIds, group.name, group.name);
        track("tabs_cleaned", { count: closedCount, via: "command" });
        return { kind: "closed", message: `Closed ${closedCount} tabs`, undoBatchId };
      }
      const plan = buildCleanupPlan(analysis.tabs, { savedUrls: await savedUrls() });
      const targets =
        intent.target === "duplicates"
          ? plan.candidates.filter((c) => c.reason === "duplicate")
          : plan.candidates;
      if (targets.length === 0) return { kind: "none", message: "Nothing worth closing right now. Nice." };
      return { kind: "cleanup-plan", cleanupPlan: { candidates: targets, counts: plan.counts } };
    }
    case "save": {
      if (intent.target === "group" && intent.groupId) {
        const workspace = await saveWorkspaceFromGroup(analysis, intent.groupId);
        return { kind: "saved", message: `Saved “${workspace.title}”` };
      }
      // save matching: find the best group by query
      const query = intent.query ?? "";
      const match = analysis.groups.find((g) => g.name.toLowerCase().includes(query.toLowerCase()));
      if (match) {
        const workspace = await saveWorkspaceFromGroup(analysis, match.id);
        return { kind: "saved", message: `Saved “${workspace.title}”` };
      }
      return { kind: "none", message: `Couldn't find a group matching “${query}”.` };
    }
    case "restore": {
      const opened = await restoreWorkspace(intent.workspaceId);
      return { kind: "restored", message: opened > 0 ? `Reopened ${opened} tabs` : "Already open" };
    }
    case "summarize": {
      const summary = await summarizeGroup(analysis, intent.groupId);
      return { kind: "summarized", summary, groupId: intent.groupId };
    }
    case "compare": {
      const groupId = intent.groupId ?? activeGroupId(analysis);
      if (!groupId) return { kind: "none", message: "Open the group you'd like to compare first." };
      const comparison = await compareGroup(analysis, groupId);
      return { kind: "compared", comparison, groupId };
    }
    case "cleanup": {
      const plan = buildCleanupPlan(analysis.tabs, { savedUrls: await savedUrls() });
      if (plan.candidates.length === 0)
        return { kind: "none", message: "Nothing worth cleaning up right now. Nice." };
      return { kind: "cleanup-plan", cleanupPlan: plan };
    }
    case "pause":
    case "resume": {
      const { prefs } = await readState("prefs");
      await writeState({ prefs: { ...prefs, paused: intent.type === "pause" } });
      await runAnalysis();
      notifyUi();
      return { kind: "prefs", message: intent.type === "pause" ? "Thicket paused" : "Thicket resumed" };
    }
    case "help":
      return { kind: "help", helpQuery: intent.query };
    case "open_dashboard":
      return { kind: "navigate", section: intent.section ?? "now" };
    case "ask":
      return { kind: "answer", message: intent.question };
    default:
      return { kind: "none" };
  }
}

async function savedUrls(): Promise<Set<string>> {
  const { workspaces } = await readState("workspaces");
  return new Set(workspaces.flatMap((w) => w.tabs.map((t) => normalizeUrl(t.url))));
}

function activeGroupId(analysis: AnalysisResult): string | undefined {
  const active = analysis.tabs.find((t) => t.active);
  if (!active) return undefined;
  return analysis.groups.find((g) => g.tabIds.includes(active.tabId))?.id;
}

export async function focusGroup(analysis: AnalysisResult, groupId: string): Promise<void> {
  const group = analysis.groups.find((g) => g.id === groupId);
  if (!group || group.tabIds.length === 0) return;
  const byId = new Map(analysis.tabs.map((t) => [t.tabId, t]));
  const first = group.tabIds
    .map((id) => byId.get(id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t))
    .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))[0];
  if (!first) return;
  await chrome.tabs.update(first.tabId, { active: true });
  await chrome.windows.update(first.windowId, { focused: true });
  // Highlight the rest so the group is visually obvious in the strip.
  const inWindow = group.tabIds.filter((id) => byId.get(id)?.windowId === first.windowId);
  const tabs = await chrome.tabs.query({ windowId: first.windowId });
  const indices = tabs.filter((t) => t.id != null && inWindow.includes(t.id)).map((t) => t.index);
  if (indices.length > 1) {
    await chrome.tabs.highlight({ windowId: first.windowId, tabs: indices }).catch(() => undefined);
  }
}
