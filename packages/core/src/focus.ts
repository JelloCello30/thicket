import type { AnalysisResult, AnalyzedTab, SiteCategory } from "@tabmind/types";
import { searchDocs } from "./search";
import { tokenize } from "./text";

/**
 * Focus mode's brain, kept pure and testable. Given the task you typed,
 * decide which of your groups are the work — and when a navigation lands
 * somewhere new, decide whether it's part of the task, harmless, or a
 * rabbit hole worth intercepting.
 *
 * Philosophy: interventions must be proportionate, and the user picks the
 * level. "gentle" intercepts only known leisure categories; "strict" also
 * intercepts clearly unrelated new sites; "lockdown" allows only the task's
 * groups and explicitly allowed domains — nothing new gets through quietly.
 * The user is always one click from overriding — they're the boss.
 */

export const DEFAULT_LEISURE_CATEGORIES: ReadonlySet<SiteCategory> = new Set([
  "social",
  "media",
  "discussion",
  "news",
] as SiteCategory[]);

export type FocusStrictness = "gentle" | "strict" | "lockdown";

export interface FocusSessionState {
  task: string;
  taskTokens: string[];
  startedAt: number;
  endsAt: number | null;
  strictness: FocusStrictness;
  /** Group ids judged relevant to the task at start (refreshed on analysis). */
  relevantGroupIds: string[];
  /** Domains the user marked on-task during this session. */
  allowedDomains: string[];
  /** Interception paused until this timestamp (breaks). */
  snoozedUntil: number | null;
  blockedCount: number;
  ended?: boolean;
}

export function createFocusSession(
  task: string,
  options: { minutes?: number | null; strictness?: FocusStrictness; now?: number } = {},
): FocusSessionState {
  const now = options.now ?? Date.now();
  return {
    task: task.trim().slice(0, 200),
    taskTokens: tokenize(task),
    startedAt: now,
    endsAt: options.minutes ? now + options.minutes * 60_000 : null,
    strictness: options.strictness ?? "gentle",
    relevantGroupIds: [],
    allowedDomains: [],
    snoozedUntil: null,
    blockedCount: 0,
  };
}

/**
 * Which groups belong to this task? Scores each group by its name, entity,
 * and member titles against the task text; a group clears the bar when it
 * matches meaningfully. The active tab's group is always considered work.
 */
export function findRelevantGroups(
  task: string,
  analysis: AnalysisResult,
  activeGroupId?: string,
): string[] {
  const relevant = new Set<string>();
  if (activeGroupId) relevant.add(activeGroupId);
  const byId = new Map(analysis.tabs.map((t) => [t.tabId, t]));

  for (const group of analysis.groups) {
    if (group.isCatchAll || group.isStale) continue;
    const members = group.tabIds
      .map((id) => byId.get(id))
      .filter((t): t is NonNullable<typeof t> => Boolean(t));
    const docs = [
      {
        ref: "name",
        title: `${group.name} ${group.entity ?? ""}`,
        url: "",
        domain: "",
      },
      ...members.map((t) => ({ ref: String(t.tabId), title: t.title, url: t.url, domain: t.domain })),
    ];
    const hits = searchDocs(task, docs, 3);
    const nameHit = hits.some((h) => h.ref === "name");
    // A name match, or a decent share of member matches, marks the group.
    if (nameHit || hits.length >= Math.min(2, members.length)) {
      relevant.add(group.id);
    }
  }
  return [...relevant];
}

export interface FocusVerdict {
  verdict: "relevant" | "neutral" | "distraction";
  reason: string;
}

export function assessTabFocus(
  tab: Pick<AnalyzedTab, "domain" | "siteName" | "category" | "tokens" | "entities" | "excluded">,
  groupId: string | undefined,
  session: Pick<
    FocusSessionState,
    "taskTokens" | "relevantGroupIds" | "allowedDomains" | "strictness" | "snoozedUntil"
  >,
  options: { leisureCategories?: ReadonlySet<SiteCategory>; now?: number } = {},
): FocusVerdict {
  const now = options.now ?? Date.now();
  if (session.snoozedUntil && now < session.snoozedUntil) {
    return { verdict: "neutral", reason: "On a break" };
  }
  if (tab.excluded || !tab.domain) {
    return { verdict: "neutral", reason: "Private or internal page" };
  }
  if (session.allowedDomains.includes(tab.domain)) {
    return { verdict: "relevant", reason: "You marked this site on-task" };
  }
  if (groupId && session.relevantGroupIds.includes(groupId)) {
    return { verdict: "relevant", reason: "Part of your task's group" };
  }

  const taskSet = new Set(session.taskTokens);
  const overlap =
    tab.tokens.filter((t) => taskSet.has(t)).length +
    tokenize(tab.entities.join(" ")).filter((t) => taskSet.has(t)).length;
  // In lockdown, looking related isn't enough — only the task's groups and
  // explicit allowances pass. Predictable beats clever when you asked for walls.
  if (overlap >= 1 && session.taskTokens.length > 0 && session.strictness !== "lockdown") {
    return { verdict: "relevant", reason: "Matches what you're working on" };
  }

  const leisure = options.leisureCategories ?? DEFAULT_LEISURE_CATEGORIES;
  if (leisure.has(tab.category)) {
    return {
      verdict: "distraction",
      reason: `${tab.siteName || tab.domain} tends to be a rabbit hole`,
    };
  }
  if (session.strictness === "lockdown") {
    return {
      verdict: "distraction",
      reason: "Lockdown is on — only your task's tabs pass",
    };
  }
  if (session.strictness === "strict") {
    return {
      verdict: "distraction",
      reason: `${tab.siteName || tab.domain} doesn't look related to your task`,
    };
  }
  return { verdict: "neutral", reason: "Not obviously off-task" };
}

export function focusMinutesLeft(session: FocusSessionState, now = Date.now()): number | null {
  if (!session.endsAt) return null;
  return Math.max(0, Math.ceil((session.endsAt - now) / 60_000));
}
