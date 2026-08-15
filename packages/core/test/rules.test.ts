import { describe, expect, it } from "vitest";
import type { TabSnapshot } from "@tabmind/types";
import { DEMO_NOW, demoTabs } from "../src/fixtures/demo";
import { groupTabs } from "../src/grouping";
import { describeRule, evaluateRules, type AutomationRule } from "../src/rules";

const ctx = { excludedDomains: new Set<string>(), preferences: { paused: false }, now: DEMO_NOW };

function rule(partial: Partial<AutomationRule> & Pick<AutomationRule, "condition" | "action">): AutomationRule {
  return { id: "r1", enabled: true, createdAt: DEMO_NOW - 86_400_000, ...partial };
}

describe("evaluateRules", () => {
  const analysis = groupTabs(demoTabs(), ctx);

  it("archives groups untouched beyond the window, never the special piles", () => {
    const planned = evaluateRules(
      [rule({ condition: { type: "group-stale", hours: 24 }, action: { type: "archive-group" } })],
      analysis,
      DEMO_NOW,
    );
    expect(planned.length).toBeGreaterThanOrEqual(1);
    const names = planned.map((p) => p.groupName);
    expect(names).toContain("Camera Research"); // last touched ~28h ago
    expect(names).not.toContain("Probably done");
    expect(names).not.toContain("Everything else");
    // The active work group is fresh — untouched.
    expect(names.some((n) => /Work|Pricing/.test(n ?? ""))).toBe(false);
  });

  it("scopes to a name query when given", () => {
    const planned = evaluateRules(
      [
        rule({
          condition: { type: "group-stale", hours: 24, nameQuery: "camera" },
          action: { type: "collapse-group" },
        }),
      ],
      analysis,
      DEMO_NOW,
    );
    expect(planned).toHaveLength(1);
    expect(planned[0]!.groupName).toBe("Camera Research");
  });

  it("plans duplicate closures excluding protected tabs", () => {
    const tabs: TabSnapshot[] = [
      ...demoTabs(),
      { id: 900, windowId: 1, index: 90, url: "https://www.zillow.com/homedetails/3421-Sunset-Blvd-Los-Angeles-CA-90026/20501234_zpid/", title: "dup", pinned: false, active: false, lastAccessed: DEMO_NOW - 1000 },
      { id: 901, windowId: 1, index: 91, url: "https://www.kayak.com/flights/LAX-TYO/2026-10-08/2026-10-22", title: "dup pinned", pinned: true, active: false, lastAccessed: DEMO_NOW - 1000 },
    ];
    const withDupes = groupTabs(tabs, ctx);
    const planned = evaluateRules(
      [rule({ condition: { type: "duplicates-exist" }, action: { type: "close-duplicates" } })],
      withDupes,
      DEMO_NOW,
    );
    expect(planned).toHaveLength(1);
    expect(planned[0]!.tabIds!.length).toBeGreaterThanOrEqual(1);
    expect(planned[0]!.tabIds).not.toContain(901); // pinned copy survives
  });

  it("tab-count trigger fires only over the threshold", () => {
    const under = evaluateRules(
      [rule({ condition: { type: "tab-count-over", count: 100 }, action: { type: "collapse-stale" } })],
      analysis,
      DEMO_NOW,
    );
    expect(under).toHaveLength(0);
    const over = evaluateRules(
      [rule({ condition: { type: "tab-count-over", count: 10 }, action: { type: "collapse-stale" } })],
      analysis,
      DEMO_NOW,
    );
    expect(over.length).toBeGreaterThanOrEqual(1);
    expect(over[0]!.action).toBe("collapse-stale");
  });

  it("respects cooldowns, disabled rules, and invalid combos", () => {
    const cooling = evaluateRules(
      [
        rule({
          condition: { type: "group-stale", hours: 24 },
          action: { type: "archive-group" },
          lastRanAt: DEMO_NOW - 60_000,
        }),
      ],
      analysis,
      DEMO_NOW,
    );
    expect(cooling).toHaveLength(0);

    const disabled = evaluateRules(
      [rule({ enabled: false, condition: { type: "duplicates-exist" }, action: { type: "close-duplicates" } })],
      analysis,
      DEMO_NOW,
    );
    expect(disabled).toHaveLength(0);

    const invalid = evaluateRules(
      [rule({ condition: { type: "duplicates-exist" }, action: { type: "archive-group" } })],
      analysis,
      DEMO_NOW,
    );
    expect(invalid).toHaveLength(0);
  });
});

describe("describeRule", () => {
  it("reads like a sentence a person would write", () => {
    expect(
      describeRule(rule({ condition: { type: "group-stale", hours: 168 }, action: { type: "archive-group" } })),
    ).toBe("When a group is untouched for a week, save it and close its tabs.");
    expect(
      describeRule(rule({ condition: { type: "tab-count-over", count: 60 }, action: { type: "collapse-stale" } })),
    ).toBe("When open tabs exceed 60, collapse stale groups.");
  });
});
