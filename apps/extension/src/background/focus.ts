import {
  analyzeTab,
  assessTabFocus,
  createFocusSession,
  findRelevantGroups,
  focusMinutesLeft,
  type FocusSessionState,
} from "@tabmind/core";
import type { TabSnapshot } from "@tabmind/types";
import { readState, updateState, writeState } from "../shared/storage";
import { getAnalysis, notifyUi, readCached } from "./analyzer";
import { track } from "./analytics";

/**
 * Focus mode. You type the task; TabMind works out which groups are that
 * task, watches navigations, and steps in — gently — when a known rabbit
 * hole opens. All local. The user can always override in one click.
 */

export interface FocusSummary {
  task: string;
  minutes: number;
  blocked: number;
}

export async function startFocus(
  task: string,
  options: { minutes?: number | null; strictness?: "gentle" | "strict" | "lockdown" } = {},
): Promise<FocusSessionState> {
  const { prefs } = await readState("prefs");
  const session = createFocusSession(task, {
    minutes: options.minutes ?? null,
    strictness: options.strictness ?? prefs.focusStrictness,
  });

  const analysis = await getAnalysis();
  const [activeTab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  const activeGroupId = activeTab?.id
    ? analysis.groups.find((g) => g.tabIds.includes(activeTab.id!))?.id
    : undefined;
  session.relevantGroupIds = findRelevantGroups(session.task, analysis, activeGroupId);

  await writeState({ focus: session });
  await chrome.alarms.create("tabmind-focus-tick", { periodInMinutes: 1 });
  await updateBadge(session);
  track("focus_started", { timed: Boolean(session.endsAt), strictness: session.strictness });
  notifyUi();
  return session;
}

export async function endFocus(reason: "manual" | "timer" = "manual"): Promise<FocusSummary | null> {
  const { focus } = await readState("focus");
  if (!focus) return null;
  const minutes = Math.max(1, Math.round((Date.now() - focus.startedAt) / 60_000));
  await writeState({ focus: null });
  await chrome.alarms.clear("tabmind-focus-tick");
  await chrome.action.setBadgeText({ text: "" });
  track("focus_ended", { minutes, blocked: focus.blockedCount, reason });
  notifyUi();
  return { task: focus.task, minutes, blocked: focus.blockedCount };
}

/** Re-anchor which groups count as the task after each re-analysis. */
export async function refreshFocusGroups(): Promise<void> {
  const { focus } = await readState("focus");
  if (!focus || focus.ended) return;
  const analysis = await readCached();
  if (!analysis) return;
  const relevant = new Set([
    ...focus.relevantGroupIds,
    ...findRelevantGroups(focus.task, analysis),
  ]);
  await writeState({ focus: { ...focus, relevantGroupIds: [...relevant] } });
}

/** Called every minute while focused: badge countdown + timer end. */
export async function focusTick(): Promise<void> {
  const { focus } = await readState("focus");
  if (!focus) {
    await chrome.alarms.clear("tabmind-focus-tick");
    await chrome.action.setBadgeText({ text: "" });
    return;
  }
  if (focus.endsAt && Date.now() >= focus.endsAt) {
    await endFocus("timer");
    return;
  }
  await updateBadge(focus);
}

async function updateBadge(session: FocusSessionState): Promise<void> {
  const left = focusMinutesLeft(session);
  await chrome.action.setBadgeBackgroundColor({ color: "#2f6b4f" });
  await chrome.action.setBadgeTextColor?.({ color: "#ffffff" }).catch(() => undefined);
  await chrome.action.setBadgeText({ text: left == null ? "on" : String(left) });
}

/* ─────────────────── navigation interception ─────────────────── */

const recentlyIntercepted = new Map<number, number>();

export async function maybeIntercept(tabId: number, url: string): Promise<void> {
  const { focus, prefs, excludedDomains } = await readState("focus", "prefs", "excludedDomains");
  if (!focus || focus.ended || prefs.paused) return;
  if (!url.startsWith("http")) return;
  if (focus.snoozedUntil && Date.now() < focus.snoozedUntil) return;
  // Don't re-intercept a tab we just intercepted (user is deciding).
  const last = recentlyIntercepted.get(tabId);
  if (last && Date.now() - last < 4000) return;

  const snapshot: TabSnapshot = {
    id: tabId,
    windowId: 0,
    index: 0,
    url,
    title: url,
    pinned: false,
    active: true,
    lastAccessed: Date.now(),
  };
  const analyzed = analyzeTab(snapshot, {
    excludedDomains: new Set(excludedDomains),
    preferences: { paused: false },
    now: Date.now(),
  });
  const analysis = await readCached();
  const groupId = analysis?.groups.find((g) => g.tabIds.includes(tabId))?.id;

  const verdict = assessTabFocus(analyzed, groupId, focus);
  if (verdict.verdict !== "distraction") return;

  recentlyIntercepted.set(tabId, Date.now());
  await updateState("focus", (current) =>
    current ? { ...current, blockedCount: current.blockedCount + 1 } : current,
  );
  const intercept = chrome.runtime.getURL(
    `focus.html?url=${encodeURIComponent(url)}&reason=${encodeURIComponent(verdict.reason)}`,
  );
  await chrome.tabs.update(tabId, { url: intercept }).catch(() => undefined);
  notifyUi();
}

/* ─────────────────── intercept-page actions ─────────────────── */

export async function allowDomainAndReturn(tabId: number, url: string): Promise<void> {
  const { getDomain } = await import("@tabmind/core");
  const domain = getDomain(url);
  if (domain) {
    await updateState("focus", (focus) =>
      focus ? { ...focus, allowedDomains: [...new Set([...focus.allowedDomains, domain])] } : focus,
    );
  }
  await chrome.tabs.update(tabId, { url }).catch(() => undefined);
  notifyUi();
}

export async function takeBreakAndReturn(tabId: number, url: string): Promise<void> {
  const { prefs } = await readState("prefs");
  await updateState("focus", (focus) =>
    focus ? { ...focus, snoozedUntil: Date.now() + prefs.focusBreakMinutes * 60_000 } : focus,
  );
  await chrome.tabs.update(tabId, { url }).catch(() => undefined);
  notifyUi();
}

/** "Back to work": focus the most recent on-task tab and drop the intercept tab. */
export async function returnToWork(interceptTabId: number): Promise<void> {
  const { focus } = await readState("focus");
  const analysis = await readCached();
  if (focus && analysis) {
    const relevant = new Set(focus.relevantGroupIds);
    const candidates = analysis.tabs
      .filter((t) => {
        const group = analysis.groups.find((g) => g.tabIds.includes(t.tabId));
        return group && relevant.has(group.id);
      })
      .sort((a, b) => (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0));
    const target = candidates[0];
    if (target) {
      await chrome.tabs.update(target.tabId, { active: true }).catch(() => undefined);
      await chrome.windows.update(target.windowId, { focused: true }).catch(() => undefined);
    }
  }
  await chrome.tabs.remove(interceptTabId).catch(() => undefined);
}
