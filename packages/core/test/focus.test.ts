import { describe, expect, it } from "vitest";
import { DEMO_NOW, demoTabs } from "../src/fixtures/demo";
import { groupTabs } from "../src/grouping";
import { analyzeTab } from "../src/analyze";
import {
  assessTabFocus,
  createFocusSession,
  findRelevantGroups,
  focusMinutesLeft,
} from "../src/focus";
import type { TabSnapshot } from "@tabmind/types";

const ctx = { excludedDomains: new Set<string>(), preferences: { paused: false }, now: DEMO_NOW };

function analyzed(url: string, title: string) {
  const snapshot: TabSnapshot = {
    id: 1,
    windowId: 1,
    index: 0,
    url,
    title,
    pinned: false,
    active: false,
    lastAccessed: DEMO_NOW,
  };
  return analyzeTab(snapshot, ctx);
}

describe("findRelevantGroups", () => {
  const analysis = groupTabs(demoTabs(), ctx);

  it("maps a work task onto the work group and nothing else", () => {
    const relevant = findRelevantGroups("finish the pricing page launch", analysis);
    const names = relevant.map((id) => analysis.groups.find((g) => g.id === id)?.name);
    expect(names.some((n) => /Work|Pricing/.test(n ?? ""))).toBe(true);
    expect(names.some((n) => n === "Apartment Hunt")).toBe(false);
  });

  it("maps a trip task onto the trip group", () => {
    const relevant = findRelevantGroups("plan the tokyo trip itinerary", analysis);
    const names = relevant.map((id) => analysis.groups.find((g) => g.id === id)?.name);
    expect(names.some((n) => /Trip/.test(n ?? ""))).toBe(true);
  });

  it("always includes the active group", () => {
    const relevant = findRelevantGroups("something unrelated entirely", analysis, "g-active");
    expect(relevant).toContain("g-active");
  });
});

describe("assessTabFocus", () => {
  const session = {
    ...createFocusSession("finish the pricing page copy", { now: DEMO_NOW }),
    relevantGroupIds: ["g-work"],
  };

  it("passes tabs in relevant groups", () => {
    const tab = analyzed("https://linear.app/acme/issue/ACM-1", "ACM-1 Some ticket – Linear");
    expect(assessTabFocus(tab, "g-work", session).verdict).toBe("relevant");
  });

  it("passes tabs whose content matches the task", () => {
    const tab = analyzed("https://docs.google.com/document/d/xyz", "Pricing copy draft - Google Docs");
    expect(assessTabFocus(tab, undefined, session).verdict).toBe("relevant");
  });

  it("intercepts leisure sites that don't match the task", () => {
    const tab = analyzed("https://www.youtube.com/watch?v=abc", "Top 10 unbelievable moments");
    const verdict = assessTabFocus(tab, undefined, session);
    expect(verdict.verdict).toBe("distraction");
    expect(verdict.reason).toContain("YouTube");
  });

  it("lets leisure sites through when they match the task", () => {
    const tab = analyzed("https://www.youtube.com/watch?v=abc", "How to write pricing page copy");
    expect(assessTabFocus(tab, undefined, session).verdict).toBe("relevant");
  });

  it("respects the session allowlist above everything", () => {
    const tab = analyzed("https://www.reddit.com/r/all", "reddit: the front page");
    const allowed = { ...session, allowedDomains: ["reddit.com"] };
    expect(assessTabFocus(tab, undefined, allowed).verdict).toBe("relevant");
  });

  it("is quiet during a break", () => {
    const snoozed = { ...session, snoozedUntil: DEMO_NOW + 5 * 60_000 };
    const tab = analyzed("https://www.youtube.com/watch?v=abc", "Top 10 unbelievable moments");
    expect(assessTabFocus(tab, undefined, snoozed, { now: DEMO_NOW }).verdict).toBe("neutral");
  });

  it("gentle mode lets unknown work-adjacent sites through; strict doesn't", () => {
    const tab = analyzed("https://www.some-random-store.com/products", "Novelty desk lamps");
    expect(assessTabFocus(tab, undefined, session).verdict).toBe("neutral");
    const strict = { ...session, strictness: "strict" as const };
    expect(assessTabFocus(tab, undefined, strict).verdict).toBe("distraction");
  });

  it("never intercepts excluded/private pages", () => {
    const tab = analyzed("https://www.chase.com/personal/checking", "Chase Checking");
    expect(tab.excluded).toBe(true);
    expect(assessTabFocus(tab, undefined, session).verdict).toBe("neutral");
  });

  it("lockdown intercepts even task-matching new sites", () => {
    const lockdown = { ...session, strictness: "lockdown" as const };
    // Looks related — passes in gentle/strict, but lockdown wants walls.
    const related = analyzed("https://docs.google.com/document/d/xyz", "Pricing copy draft - Google Docs");
    expect(assessTabFocus(related, undefined, session).verdict).toBe("relevant");
    expect(assessTabFocus(related, undefined, lockdown).verdict).toBe("distraction");
    const unknown = analyzed("https://www.some-random-store.com/products", "Novelty desk lamps");
    expect(assessTabFocus(unknown, undefined, lockdown).verdict).toBe("distraction");
  });

  it("lockdown still passes the task's groups and the allowlist", () => {
    const lockdown = { ...session, strictness: "lockdown" as const };
    const grouped = analyzed("https://linear.app/acme/issue/ACM-1", "ACM-1 Some ticket – Linear");
    expect(assessTabFocus(grouped, "g-work", lockdown).verdict).toBe("relevant");
    const allowed = { ...lockdown, allowedDomains: ["reddit.com"] };
    const reddit = analyzed("https://www.reddit.com/r/all", "reddit: the front page");
    expect(assessTabFocus(reddit, undefined, allowed).verdict).toBe("relevant");
  });
});

describe("session shape", () => {
  it("computes minutes left only for timed sessions", () => {
    const timed = createFocusSession("write", { minutes: 50, now: DEMO_NOW });
    expect(focusMinutesLeft(timed, DEMO_NOW + 20 * 60_000)).toBe(30);
    const open = createFocusSession("write", { now: DEMO_NOW });
    expect(focusMinutesLeft(open)).toBeNull();
  });
});
