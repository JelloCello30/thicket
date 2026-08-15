import { buildCleanupPlan, normalizeExcludedDomainInput, normalizeUrl } from "@tabmind/core";
import type { UserPreferences } from "@tabmind/types";
import { api } from "../shared/api";
import type { BgError, BgRequest, UiState } from "../shared/messages";
import { readState, updateState, writeState } from "../shared/storage";
import { getAnalysis, notifyUi, readCached, runAnalysis, scheduleAnalysis } from "./analyzer";
import { compareGroup, hasContentPermission, summarizeGroup } from "./ai-features";
import { flushEvents, reportError, track } from "./analytics";
import { executeCommand, focusGroup } from "./commands";
import { recordClosed, recordVisit, pruneHistory } from "./history";
import { unmirrorAll } from "./mirror";
import {
  allowDomainAndReturn,
  endFocus,
  focusTick,
  maybeIntercept,
  returnToWork,
  startFocus,
  takeBreakAndReturn,
} from "./focus";
import { addRule, deleteRule, toggleRule } from "./automations";
import { focusMinutesLeft } from "@tabmind/core";
import { runSearch } from "./search";
import { flushSync, pullWorkspaces } from "./sync";
import { noteActivated, noteRemoved } from "./tabs";
import {
  closeTabs,
  deleteWorkspace,
  renameWorkspace,
  restoreWorkspace,
  saveWorkspaceFromGroup,
  setWorkspaceState,
  undoBatch,
} from "./workspaces";
import { APP_URL, EXT_VERSION } from "../shared/env";

/* ───────────────────────── lifecycle ───────────────────────── */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    void writeState({ installedAt: Date.now() });
    track("extension_installed");
    // The aha moment: open the dashboard immediately and analyze what's there.
    void chrome.tabs.create({ url: chrome.runtime.getURL("dashboard.html#/welcome") });
  }
  void chrome.alarms.create("tabmind-sync", { periodInMinutes: 1 });
  void chrome.alarms.create("tabmind-daily", { periodInMinutes: 60 * 24 });
  scheduleAnalysis("installed");
});

chrome.runtime.onStartup.addListener(() => {
  void chrome.alarms.create("tabmind-sync", { periodInMinutes: 1 });
  scheduleAnalysis("startup");
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "tabmind-sync") {
    void flushSync();
    void flushEvents();
  }
  if (alarm.name === "tabmind-focus-tick") {
    void focusTick();
  }
  if (alarm.name === "tabmind-daily") {
    void (async () => {
      const { auth } = await readState("auth");
      await pruneHistory(auth?.user.plan === "pro" ? 90 : 7);
      await pullWorkspaces();
    })();
  }
});

/* ─────────────────────── tab listeners ─────────────────────── */

chrome.tabs.onCreated.addListener(() => scheduleAnalysis("created"));
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) {
    void maybeIntercept(tabId, changeInfo.url);
  }
  if (changeInfo.status === "complete" && tab.url) {
    void recordVisit(tabId, tab.url, tab.title ?? "");
    scheduleAnalysis("updated");
  } else if (changeInfo.title && tab.url) {
    void recordVisit(tabId, tab.url, changeInfo.title);
  }
});
chrome.tabs.onRemoved.addListener((tabId) => {
  void recordClosed(tabId);
  noteRemoved(tabId);
  scheduleAnalysis("removed");
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  noteActivated(tabId);
});
chrome.tabs.onReplaced.addListener(() => scheduleAnalysis("replaced"));

chrome.commands.onCommand.addListener((command) => {
  // The global shortcut's promise is "ask TabMind anything" — land ready to type.
  if (command === "open-dashboard") void openDashboard("now", { command: true });
});

/* ─────────────────── device linking (web → ext) ─────────────────── */

chrome.runtime.onMessageExternal.addListener((message, _sender, sendResponse) => {
  if (message?.type === "tabmind:link" && typeof message.code === "string") {
    void linkDevice(message.code)
      .then((auth) => sendResponse({ ok: true, email: auth.user.email }))
      .catch((error: Error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  if (message?.type === "tabmind:ping") {
    sendResponse({ ok: true, version: EXT_VERSION });
  }
  return undefined;
});

async function linkDevice(code: string) {
  const platform = await chrome.runtime.getPlatformInfo();
  const result = await api.linkDevice(code, {
    name: `Chrome on ${platform.os === "mac" ? "Mac" : platform.os === "win" ? "Windows" : platform.os}`,
    browser: "Chrome",
  });
  const auth = { token: result.token, deviceId: result.deviceId, user: result.user };
  await writeState({ auth });
  await pullWorkspaces();
  await runAnalysis();
  notifyUi();
  return auth;
}

/* ──────────────────────── message router ──────────────────────── */

chrome.runtime.onMessage.addListener((message: BgRequest | { type: string }, sender, sendResponse) => {
  if (!message || typeof (message as { type?: unknown }).type !== "string") return undefined;
  if ((message as { type: string }).type.startsWith("tabmind:")) return undefined; // broadcasts

  // Focus intercept page actions carry the sender tab.
  const focusPage = message as { type: string; url?: string };
  if (focusPage.type.startsWith("focus-page:") && sender.tab?.id != null) {
    const tabId = sender.tab.id;
    void (async () => {
      if (focusPage.type === "focus-page:allow" && focusPage.url) {
        await allowDomainAndReturn(tabId, focusPage.url);
      } else if (focusPage.type === "focus-page:break" && focusPage.url) {
        await takeBreakAndReturn(tabId, focusPage.url);
      } else if (focusPage.type === "focus-page:return") {
        await returnToWork(tabId);
      } else if (focusPage.type === "focus-page:end" && focusPage.url) {
        await endFocus("manual");
        await chrome.tabs.update(tabId, { url: focusPage.url }).catch(() => undefined);
      }
      sendResponse({ ok: true });
    })();
    return true;
  }
  void handle(message as BgRequest)
    .then(sendResponse)
    .catch((error: Error & { code?: BgError["code"] }) => {
      void reportError(error, (message as BgRequest).type);
      const response: BgError = {
        __error: true,
        code: error.code ?? "internal",
        message: error.message || "Something went wrong.",
      };
      sendResponse(response);
    });
  return true; // async response
});

async function handle(request: BgRequest): Promise<unknown> {
  switch (request.type) {
    case "get-state":
      return uiState();
    case "analyze-now": {
      await runAnalysis();
      return uiState();
    }
    case "set-prefs": {
      const { prefs } = await readState("prefs");
      const next: UserPreferences = { ...prefs, ...request.patch };
      await writeState({ prefs: next });
      if (prefs.mirrorTabGroups && request.patch.mirrorTabGroups === false) await unmirrorAll();
      if (
        request.patch.paused === false ||
        request.patch.mirrorTabGroups === true ||
        request.patch.groupingStyle !== undefined ||
        request.patch.staleAfterHours !== undefined
      ) {
        await runAnalysis();
      }
      notifyUi();
      return uiState();
    }
    case "excluded-add": {
      const domain = normalizeExcludedDomainInput(request.domain);
      if (domain) {
        await updateState("excludedDomains", (list) => [...new Set([...list, domain])]);
        await runAnalysis();
      }
      return uiState();
    }
    case "excluded-remove": {
      await updateState("excludedDomains", (list) => list.filter((d) => d !== request.domain));
      await runAnalysis();
      return uiState();
    }
    case "command":
      return executeCommand(request.input);
    case "search": {
      track("search_used", { via: "search-box" });
      return runSearch(request.query, request.scope);
    }
    case "save-workspace": {
      const analysis = await getAnalysis();
      const workspace = await saveWorkspaceFromGroup(analysis, request.groupId);
      await flushSync();
      return { workspace };
    }
    case "close-group": {
      const analysis = await getAnalysis();
      const group = analysis.groups.find((g) => g.id === request.groupId);
      if (!group) throw new Error("That group is gone — tabs may have changed.");
      let workspace;
      if (request.save) {
        workspace = await saveWorkspaceFromGroup(analysis, request.groupId);
      }
      const { closedCount, undoBatchId } = await closeTabs(group.tabIds, group.name, group.name);
      track("tabs_cleaned", { count: closedCount, via: "close-group", saved: request.save });
      return { closedCount, undoBatchId, workspace };
    }
    case "restore-workspace":
      return { opened: await restoreWorkspace(request.workspaceId) };
    case "set-workspace-state": {
      await setWorkspaceState(request.workspaceId, request.state);
      await flushSync();
      return uiState();
    }
    case "delete-workspace": {
      await deleteWorkspace(request.workspaceId);
      await flushSync();
      return uiState();
    }
    case "rename-workspace": {
      await renameWorkspace(request.workspaceId, request.title);
      await flushSync();
      return uiState();
    }
    case "rename-group": {
      await renameGroup(request.groupId, request.name);
      return uiState();
    }
    case "cleanup-plan": {
      const analysis = await getAnalysis();
      const { workspaces } = await readState("workspaces");
      const savedUrls = new Set(workspaces.flatMap((w) => w.tabs.map((t) => normalizeUrl(t.url))));
      return buildCleanupPlan(analysis.tabs, { savedUrls });
    }
    case "cleanup-run": {
      const result = await closeTabs(request.tabIds, "Cleanup");
      track("tabs_cleaned", { count: result.closedCount, via: "cleanup" });
      return result;
    }
    case "undo-batch":
      return { reopened: await undoBatch(request.batchId) };
    case "focus-group": {
      const analysis = await getAnalysis();
      await focusGroup(analysis, request.groupId);
      return { ok: true };
    }
    case "focus-tab": {
      const tab = await chrome.tabs.get(request.tabId).catch(() => null);
      if (tab?.id != null) {
        await chrome.tabs.update(tab.id, { active: true });
        if (tab.windowId != null) await chrome.windows.update(tab.windowId, { focused: true });
      }
      return { ok: true };
    }
    case "move-tab": {
      await applyMoveCorrection(request.tabId, request.toGroupId);
      return uiState();
    }
    case "merge-groups": {
      await applyMergeCorrection(request.fromGroupId, request.intoGroupId);
      return uiState();
    }
    case "summarize-group": {
      const analysis = await getAnalysis();
      return { summary: await summarizeGroup(analysis, request.groupId) };
    }
    case "compare-group": {
      const analysis = await getAnalysis();
      return { comparison: await compareGroup(analysis, request.groupId) };
    }
    case "link-device":
      return { auth: await linkDevice(request.code) };
    case "sign-out": {
      const { auth } = await readState("auth");
      if (auth) await api.revokeSelf().catch(() => undefined);
      await writeState({ auth: null });
      notifyUi();
      return uiState();
    }
    case "reopen": {
      await chrome.tabs.create({ url: request.url, active: true });
      const { recentlyClosed } = await readState("recentlyClosed");
      const record = recentlyClosed.find((r) => r.url === request.url);
      if (record?.groupId) {
        const { lockUrlsToGroup } = await import("./workspaces");
        await lockUrlsToGroup([request.url], record.groupId);
      }
      scheduleAnalysis("reopen");
      return { ok: true };
    }
    case "request-content-permission": {
      const granted = await chrome.permissions.request({ origins: ["<all_urls>"] });
      if (granted) {
        const { prefs } = await readState("prefs");
        await writeState({ prefs: { ...prefs, contentAnalysis: true } });
      }
      notifyUi();
      return { granted };
    }
    case "open-dashboard": {
      await openDashboard(request.section, { command: request.command });
      return { ok: true };
    }
    case "focus-start": {
      await startFocus(request.task, { minutes: request.minutes, strictness: request.strictness });
      return uiState();
    }
    case "focus-end":
      return { summary: await endFocus("manual") };
    case "history-delete": {
      const { forgetPage } = await import("./history");
      await forgetPage(request.url);
      notifyUi();
      return uiState();
    }
    case "history-clear": {
      const { clearHistory } = await import("./history");
      await clearHistory();
      notifyUi();
      return uiState();
    }
    case "rules-add": {
      await addRule(request.condition, request.action);
      notifyUi();
      return uiState();
    }
    case "rules-toggle": {
      await toggleRule(request.id, request.enabled);
      return uiState();
    }
    case "rules-delete": {
      await deleteRule(request.id);
      return uiState();
    }
  }
}

async function uiState(): Promise<UiState> {
  const [analysis, state, contentPermission] = await Promise.all([
    readCached().then((cached) => cached ?? runAnalysis()),
    readState(
      "prefs",
      "excludedDomains",
      "auth",
      "workspaces",
      "recentlyClosed",
      "closedBatches",
      "focus",
      "rules",
      "ruleActivity",
      "onboarded",
      "appUrlOverride",
    ),
    hasContentPermission(),
  ]);
  return {
    analysis,
    prefs: state.prefs,
    excludedDomains: state.excludedDomains,
    auth: state.auth,
    workspaces: state.workspaces,
    recentlyClosed: state.recentlyClosed,
    closedBatches: state.closedBatches,
    focus: state.focus,
    focusMinutesLeft: state.focus ? focusMinutesLeft(state.focus) : null,
    rules: state.rules,
    ruleActivity: state.ruleActivity,
    onboarded: state.onboarded,
    contentPermission,
    appUrl: state.appUrlOverride || APP_URL,
    version: EXT_VERSION,
  };
}

async function openDashboard(section?: string, opts: { command?: boolean } = {}): Promise<void> {
  const url = chrome.runtime.getURL(`dashboard.html#/${section ?? "now"}${opts.command ? "?cmd=1" : ""}`);
  const existing = await chrome.tabs.query({ url: chrome.runtime.getURL("dashboard.html") + "*" });
  const first = existing[0];
  if (first?.id != null) {
    await chrome.tabs.update(first.id, { active: true, url });
    if (first.windowId != null) await chrome.windows.update(first.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}

/* ─────────────────── corrections (feedback loop) ─────────────────── */

async function renameGroup(groupId: string, name: string): Promise<void> {
  const clean = name.trim().slice(0, 60);
  if (!clean) return;
  await updateState("groupMemory", (memory) =>
    memory.map((g) => (g.id === groupId ? { ...g, name: clean, userNamed: true } : g)),
  );
  const analysis = await readCached();
  if (analysis) {
    const group = analysis.groups.find((g) => g.id === groupId);
    if (group) {
      group.name = clean;
      // Renaming their own native group through TabMind is an explicit ask —
      // apply it to the real thing so the strip and dashboard agree.
      if (group.nativeGroupId != null) {
        await chrome.tabGroups.update(group.nativeGroupId, { title: clean }).catch(() => undefined);
      }
    }
    await chrome.storage.session.set({ analysis });
  }
  notifyUi();
}

async function applyMoveCorrection(tabId: number, toGroupId: string): Promise<void> {
  const analysis = await getAnalysis();
  const tab = analysis.tabs.find((t) => t.tabId === tabId);
  const target = analysis.groups.find((g) => g.id === toGroupId);
  if (!tab || !target) return;
  const from = analysis.groups.find((g) => g.tabIds.includes(tabId));

  // Dragging into/out of the user's own native group applies natively —
  // otherwise the next analysis reads native membership and snaps back.
  if (target.nativeGroupId != null) {
    await chrome.tabs
      .group({ groupId: target.nativeGroupId, tabIds: [tabId] })
      .catch(() => undefined);
  } else if (from?.nativeGroupId != null) {
    await chrome.tabs.ungroup([tabId]).catch(() => undefined);
  }

  await updateState("corrections", (corrections) => {
    const locks = { ...corrections.locks, [tab.normalizedUrl]: toGroupId };
    const pairBoosts = [...corrections.pairBoosts];
    // Teach the clusterer: this domain belongs with the target's dominant domain.
    const targetTabs = target.tabIds
      .map((id) => analysis.tabs.find((t) => t.tabId === id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
    const domains = targetTabs.map((t) => t.domain).filter((d) => d && d !== tab.domain);
    const dominant = mode(domains);
    if (dominant && tab.domain) {
      pairBoosts.push({ a: tab.domain, b: dominant, delta: 0.25 });
    }
    if (from && from.id !== toGroupId) {
      const fromTabs = from.tabIds
        .map((id) => analysis.tabs.find((t) => t.tabId === id))
        .filter((t): t is NonNullable<typeof t> => Boolean(t) && t!.tabId !== tabId);
      const fromDominant = mode(fromTabs.map((t) => t.domain).filter((d) => d && d !== tab.domain));
      if (fromDominant && tab.domain) {
        pairBoosts.push({ a: tab.domain, b: fromDominant, delta: -0.15 });
      }
    }
    return { locks, pairBoosts: dedupeBoosts(pairBoosts).slice(-60) };
  });
  await runAnalysis();
}

async function applyMergeCorrection(fromGroupId: string, intoGroupId: string): Promise<void> {
  const analysis = await getAnalysis();
  const from = analysis.groups.find((g) => g.id === fromGroupId);
  const into = analysis.groups.find((g) => g.id === intoGroupId);
  if (!from || !into) return;
  // Merging is explicit: if either side is the user's native group, make the
  // strip agree, or the next analysis reads native membership and undoes it.
  const tabIds = from.tabIds.filter((id) => analysis.tabs.some((t) => t.tabId === id));
  if (into.nativeGroupId != null && tabIds.length > 0) {
    await chrome.tabs
      .group({ groupId: into.nativeGroupId, tabIds: tabIds as [number, ...number[]] })
      .catch(() => undefined);
  } else if (from.nativeGroupId != null && tabIds.length > 0) {
    await chrome.tabs.ungroup(tabIds as [number, ...number[]]).catch(() => undefined);
  }
  await updateState("corrections", (corrections) => {
    const locks = { ...corrections.locks };
    for (const tabId of from.tabIds) {
      const tab = analysis.tabs.find((t) => t.tabId === tabId);
      if (tab) locks[tab.normalizedUrl] = intoGroupId;
    }
    const aDom = dominantDomain(analysis, from.tabIds);
    const bDom = dominantDomain(analysis, into.tabIds);
    const pairBoosts = [...corrections.pairBoosts];
    if (aDom && bDom && aDom !== bDom) pairBoosts.push({ a: aDom, b: bDom, delta: 0.3 });
    return { locks, pairBoosts: dedupeBoosts(pairBoosts).slice(-60) };
  });
  await runAnalysis();
}

function dominantDomain(analysis: { tabs: { tabId: number; domain: string }[] }, tabIds: number[]): string | undefined {
  const domains = tabIds
    .map((id) => analysis.tabs.find((t) => t.tabId === id)?.domain)
    .filter((d): d is string => Boolean(d));
  return mode(domains);
}

function mode(items: string[]): string | undefined {
  const counts = new Map<string, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  let best: string | undefined;
  let bestCount = 0;
  for (const [item, count] of counts) {
    if (count > bestCount) {
      best = item;
      bestCount = count;
    }
  }
  return best;
}

function dedupeBoosts(
  boosts: { a: string; b: string; delta: number }[],
): { a: string; b: string; delta: number }[] {
  const map = new Map<string, { a: string; b: string; delta: number }>();
  for (const boost of boosts) {
    const key = [boost.a, boost.b].sort().join("|");
    const existing = map.get(key);
    map.set(key, existing ? { ...boost, delta: clamp(existing.delta + boost.delta) } : boost);
  }
  return [...map.values()];
}

function clamp(delta: number): number {
  return Math.max(-0.4, Math.min(0.4, delta));
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "local" && changes.onboarded?.newValue === true && !changes.onboarded.oldValue) {
    track("onboarding_completed");
  }
});

/* Initial analysis when the worker wakes with tabs already open. */
scheduleAnalysis("worker-start");
