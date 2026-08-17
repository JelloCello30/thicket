import { describe, expect, it } from "vitest";
import type { TabSnapshot } from "@thicket/types";
import { DEMO_NOW } from "../src/fixtures/demo";
import { groupTabs } from "../src/grouping";

/**
 * Tab groups the user created in Chrome before (or outside) Thicket are
 * sacred: they come through analysis as locked groups with the user's own
 * title and color, clustering never splits or absorbs them, and automations
 * treat their tabs as protected.
 */

const ctx = { excludedDomains: new Set<string>(), preferences: { paused: false }, now: DEMO_NOW };

let nextId = 1;
function snap(url: string, title: string, chromeGroupId?: number): TabSnapshot {
  return {
    id: nextId++,
    windowId: 1,
    index: nextId,
    url,
    title,
    pinned: false,
    active: false,
    groupId: chromeGroupId ?? -1,
    lastAccessed: DEMO_NOW - 5 * 60_000,
  };
}

describe("user-created native groups", () => {
  it("keeps a native group together even when members wouldn't cluster", () => {
    nextId = 1;
    const tabs = [
      // A deliberately incoherent group only a human would make.
      snap("https://www.youtube.com/watch?v=abc", "Lo-fi beats to work to", 7),
      snap("https://www.zillow.com/homedetails/123", "123 Main St - Zillow", 7),
      snap("https://en.wikipedia.org/wiki/Cheese", "Cheese - Wikipedia", 7),
      // Ungrouped tabs that should cluster normally.
      snap("https://www.zillow.com/homedetails/456", "456 Oak Ave 2bd - Zillow"),
      snap("https://www.apartments.com/los-angeles", "LA apartments for rent"),
      snap("https://www.zillow.com/homedetails/789", "789 Elm St 1bd - Zillow"),
    ];
    const result = groupTabs(tabs, ctx, {
      nativeGroups: [{ id: 7, title: "Weekend stuff", color: "purple" }],
    });

    const native = result.groups.find((g) => g.nativeGroupId === 7);
    expect(native).toBeDefined();
    expect(native!.name).toBe("Weekend stuff");
    expect(native!.color).toBe("purple");
    expect(native!.tabIds.sort()).toEqual([1, 2, 3]);
    expect(native!.id).toBe("native-7");
    expect(native!.isStale).toBeFalsy();

    // The native members never leak into other groups.
    for (const group of result.groups) {
      if (group.nativeGroupId != null) continue;
      expect(group.tabIds.some((id) => [1, 2, 3].includes(id))).toBe(false);
    }
    // And the loose apartment tabs still cluster on their own.
    const apartments = result.groups.find(
      (g) => g.nativeGroupId == null && g.tabIds.includes(4) && g.tabIds.includes(6),
    );
    expect(apartments).toBeDefined();
  });

  it("names unnamed native groups honestly and ignores Thicket-owned mirrors", () => {
    nextId = 1;
    const tabs = [
      snap("https://www.kayak.com/flights", "LAX to Tokyo flights", 3),
      snap("https://www.booking.com/tokyo", "Tokyo hotels", 3),
      snap("https://linear.app/acme", "Sprint board - Linear", 9),
      snap("https://github.com/acme/api/pulls", "Pull requests - GitHub", 9),
    ];
    // Group 9 is one of ours (a mirror) — not passed in nativeGroups, so its
    // members cluster normally. Group 3 is the user's, untitled.
    const result = groupTabs(tabs, ctx, {
      nativeGroups: [{ id: 3, title: "", color: "cyan" }],
    });
    const native = result.groups.find((g) => g.nativeGroupId === 3);
    expect(native).toBeDefined();
    expect(native!.name).toBe("Grouped by you");
    expect(result.groups.some((g) => g.nativeGroupId === 9)).toBe(false);
    const work = result.groups.find((g) => g.tabIds.includes(3) && g.tabIds.includes(4));
    expect(work?.nativeGroupId).toBeUndefined();
  });
});
