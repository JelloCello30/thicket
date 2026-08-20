import { describe, expect, it } from "vitest";
import { DEMO_NOW, demoTabs } from "../src/fixtures/demo";
import { analyzeTabs } from "../src/analyze";
import { buildCleanupPlan, findDuplicates } from "../src/cleanup";
import type { TabSnapshot } from "@thicket/types";

const ctx = { excludedDomains: new Set<string>(), preferences: { paused: false }, now: DEMO_NOW };

function snap(partial: Partial<TabSnapshot> & { id: number; url: string; title: string }): TabSnapshot {
  return { windowId: 1, index: 0, pinned: false, active: false, ...partial } as TabSnapshot;
}

describe("findDuplicates", () => {
  it("keeps the most recently used copy", () => {
    const tabs = analyzeTabs(
      [
        snap({ id: 1, url: "https://ex.com/a?utm_source=x", title: "A", lastAccessed: DEMO_NOW - 5000 }),
        snap({ id: 2, url: "https://www.ex.com/a", title: "A", lastAccessed: DEMO_NOW - 1000 }),
        snap({ id: 3, url: "https://ex.com/b", title: "B", lastAccessed: DEMO_NOW - 1000 }),
      ],
      ctx,
    );
    const dups = findDuplicates(tabs);
    expect(dups).toHaveLength(1);
    expect(dups[0]!.tabId).toBe(1);
    expect(dups[0]!.duplicateOfTabId).toBe(2);
  });

  it("never closes the pinned copy", () => {
    const tabs = analyzeTabs(
      [
        snap({ id: 1, url: "https://ex.com/a", title: "A", pinned: true, lastAccessed: DEMO_NOW - 99_000 }),
        snap({ id: 2, url: "https://ex.com/a", title: "A", lastAccessed: DEMO_NOW - 1000 }),
      ],
      ctx,
    );
    const dups = findDuplicates(tabs);
    expect(dups[0]!.tabId).toBe(2);
  });
});

describe("buildCleanupPlan", () => {
  it("proposes stale + newtab + duplicate closures, never active/pinned/audible", () => {
    const raw = [
      ...demoTabs(),
      snap({ id: 900, url: "chrome://newtab/", title: "New Tab" }),
      snap({ id: 901, url: "https://www.zillow.com/homedetails/3421-Sunset-Blvd-Los-Angeles-CA-90026/20501234_zpid/", title: "dup", lastAccessed: DEMO_NOW - 90_000_000 }),
      snap({ id: 902, url: "https://mysong.example.com/radio", title: "Radio", audible: true, lastAccessed: DEMO_NOW - 900_000_000 }),
    ];
    const tabs = analyzeTabs(raw, ctx);
    const plan = buildCleanupPlan(tabs);

    expect(plan.counts.newtab).toBe(1);
    expect(plan.counts.duplicate).toBeGreaterThanOrEqual(1);
    expect(plan.counts.stale).toBeGreaterThanOrEqual(3);

    const ids = plan.candidates.map((c) => c.tabId);
    const active = tabs.find((t) => t.active)!;
    expect(ids).not.toContain(active.tabId);
    expect(ids).not.toContain(902);
  });

  it("flags tabs already saved in a workspace", () => {
    const tabs = analyzeTabs(demoTabs(), ctx);
    const verge = tabs.find((t) => t.url.includes("theverge.com"))!;
    const plan = buildCleanupPlan(tabs, { savedUrls: new Set([verge.normalizedUrl]) });
    const saved = plan.candidates.find((c) => c.tabId === verge.tabId);
    expect(saved).toBeDefined();
    expect(saved!.reason).toBe("saved");
  });
});

describe("buildCleanupPlan privacy", () => {
  it("never offers to close a private or excluded tab", () => {
    /**
     * Private and excluded tabs have a blanked url, and a blank url reads as
     * an empty tab — so before the guard, cleanup listed someone's private
     * window under "empty tabs" and offered to close it.
     */
    const tabs = analyzeTabs(
      [
        snap({ id: 1, url: "https://example.com/secret", title: "Secret", incognito: true } as never),
        snap({ id: 2, url: "https://chase.com/accounts", title: "Checking" }),
        snap({ id: 3, url: "chrome://newtab/", title: "New Tab" }),
      ],
      { ...ctx, excludedDomains: new Set(["chase.com"]) },
    );
    const plan = buildCleanupPlan(tabs);
    expect(plan.candidates.map((c) => c.tabId)).toEqual([3]);
    expect(plan.counts.newtab).toBe(1);
  });
});
