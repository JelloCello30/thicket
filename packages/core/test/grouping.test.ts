import { describe, expect, it } from "vitest";
import type { AnalysisResult, TabGroup } from "@thicket/types";
import { DEMO_NOW, demoTabs } from "../src/fixtures/demo";
import { groupTabs } from "../src/grouping";
import { analyzeTabs } from "../src/analyze";

const ctx = {
  excludedDomains: new Set<string>(),
  preferences: { paused: false },
  now: DEMO_NOW,
};

function run(): AnalysisResult {
  return groupTabs(demoTabs(), ctx, { idFactory: idFactory() });
}

function idFactory() {
  let n = 0;
  return () => `g${++n}`;
}

function groupContaining(result: AnalysisResult, urlPart: string): TabGroup | undefined {
  const tab = result.tabs.find((t) => t.url.includes(urlPart));
  if (!tab) return undefined;
  return result.groups.find((g) => g.tabIds.includes(tab.tabId));
}

describe("grouping the demo session (47 tabs, 5 real activities)", () => {
  const result = run();

  it("finds a sane number of groups — not a flat list, not confetti", () => {
    expect(result.groups.length).toBeGreaterThanOrEqual(4);
    expect(result.groups.length).toBeLessThanOrEqual(8);
  });

  it("groups the apartment hunt together, including the mortgage calculator", () => {
    const g = groupContaining(result, "zillow.com");
    expect(g).toBeDefined();
    const members = new Set(g!.tabIds);
    const rent = result.tabs.find((t) => t.url.includes("rent-calculator"));
    const reddit = result.tabs.find((t) => t.url.includes("silver_lake_vs_echo_park"));
    const apts = result.tabs.find((t) => t.url.includes("apartments.com"));
    expect(members.has(rent!.tabId), "mortgage calculator joins via realestate theme").toBe(true);
    expect(members.has(reddit!.tabId), "neighborhood reddit thread joins via entities").toBe(true);
    expect(members.has(apts!.tabId)).toBe(true);
    expect(g!.tabIds.length).toBeGreaterThanOrEqual(7);
  });

  it("groups the Japan trip together across flights, hotels, and guides", () => {
    const g = groupContaining(result, "kayak.com");
    expect(g).toBeDefined();
    const urls = g!.tabIds
      .map((id) => result.tabs.find((t) => t.tabId === id)!.url)
      .join(" ");
    expect(urls).toContain("booking.com");
    expect(urls).toContain("airbnb.com");
    expect(urls).toContain("japan-guide.com");
    expect(g!.tabIds.length).toBeGreaterThanOrEqual(8);
  });

  it("groups the work project together", () => {
    const g = groupContaining(result, "figma.com");
    expect(g).toBeDefined();
    const urls = g!.tabIds.map((id) => result.tabs.find((t) => t.tabId === id)!.url).join(" ");
    expect(urls).toContain("linear.app");
    expect(urls).toContain("github.com");
    expect(urls).toContain("slack.com");
    expect(g!.tabIds.length).toBeGreaterThanOrEqual(9);
  });

  it("groups the camera research together", () => {
    const g = groupContaining(result, "dpreview.com");
    expect(g).toBeDefined();
    const urls = g!.tabIds.map((id) => result.tabs.find((t) => t.tabId === id)!.url).join(" ");
    expect(urls).toContain("bhphotovideo.com");
    expect(g!.tabIds.length).toBeGreaterThanOrEqual(5);
  });

  it("does not mix the big four activities", () => {
    const apartment = groupContaining(result, "zillow.com")!;
    const japan = groupContaining(result, "kayak.com")!;
    const work = groupContaining(result, "figma.com")!;
    const camera = groupContaining(result, "dpreview.com")!;
    const ids = [apartment.id, japan.id, work.id, camera.id];
    expect(new Set(ids).size).toBe(4);
  });

  it("finds the stale pile", () => {
    const stale = result.groups.find((g) => g.isStale && g.kind === "stale");
    expect(stale).toBeDefined();
    expect(stale!.tabIds.length).toBeGreaterThanOrEqual(3);
    const urls = stale!.tabIds.map((id) => result.tabs.find((t) => t.tabId === id)!.url).join(" ");
    expect(urls).toContain("allrecipes.com");
  });

  it("names groups like a human would", () => {
    const names = result.groups.map((g) => g.name);
    for (const name of names) {
      expect(name.length).toBeLessThanOrEqual(30);
      expect(name).not.toMatch(/misc|category|generated|cluster|group \d|collection/i);
    }
    const apartment = groupContaining(result, "zillow.com")!;
    expect(apartment.name).toBe("Apartment Hunt");
    const japan = groupContaining(result, "kayak.com")!;
    expect(japan.name).toMatch(/Trip/);
    const camera = groupContaining(result, "dpreview.com")!;
    expect(camera.name).toBe("Camera Research");
  });

  it("sorts active work first and stale piles last", () => {
    const first = result.groups[0]!;
    expect(first.tabIds.some((id) => result.tabs.find((t) => t.tabId === id)?.active)).toBe(true);
    const last = result.groups[result.groups.length - 1]!;
    expect(last.isStale || last.isCatchAll).toBe(true);
  });
});

describe("group stability across re-analysis", () => {
  it("keeps ids and user names when membership barely changes", () => {
    const first = groupTabs(demoTabs(), ctx, { idFactory: idFactory() });
    const apartment = first.groups.find((g) => g.name === "Apartment Hunt")!;
    const previous = first.groups.map((g) => ({
      id: g.id,
      name: g.id === apartment.id ? "Eastside Apartment Search" : g.name,
      kind: g.kind,
      memberUrls: g.tabIds.map((id) => first.tabs.find((t) => t.tabId === id)!.normalizedUrl),
      userNamed: g.id === apartment.id,
      color: g.color,
    }));

    // Same session, one tab closed.
    const tabs = demoTabs().filter((t) => !t.url.includes("walkscore"));
    const second = groupTabs(tabs, ctx, { previous, idFactory: idFactory() });
    const again = second.groups.find((g) => g.id === apartment.id);
    expect(again, "group id survives").toBeDefined();
    expect(again!.name).toBe("Eastside Apartment Search");
  });
});

describe("excluded tabs never reach groups", () => {
  it("keeps banking tabs out of every group", () => {
    const tabs = [
      ...demoTabs(),
      {
        id: 999,
        windowId: 1,
        index: 99,
        url: "https://www.chase.com/personal/credit-cards",
        title: "Chase Credit Cards",
        pinned: false,
        active: false,
        lastAccessed: DEMO_NOW - 1000,
      },
    ];
    const result = groupTabs(tabs, ctx, { idFactory: idFactory() });
    for (const g of result.groups) {
      expect(g.tabIds).not.toContain(999);
    }
    const analyzed = result.tabs.find((t) => t.tabId === 999)!;
    expect(analyzed.excluded).toBe(true);
    expect(analyzed.excludedReason).toBe("excluded-domain");
  });
});

describe("small sessions", () => {
  it("handles 5 tabs without inventing structure", () => {
    const five = demoTabs().slice(0, 5);
    const result = groupTabs(five, ctx, { idFactory: idFactory() });
    expect(result.groups.length).toBeLessThanOrEqual(2);
    const total = result.groups.reduce((s, g) => s + g.tabIds.length, 0);
    expect(total).toBe(5);
  });

  it("handles zero tabs", () => {
    const result = groupTabs([], ctx, { idFactory: idFactory() });
    expect(result.groups).toEqual([]);
  });
});

describe("analyzeTabs privacy routing", () => {
  it("marks paused sessions excluded", () => {
    const tabs = analyzeTabs(demoTabs().slice(0, 3), { ...ctx, preferences: { paused: true } });
    expect(tabs.every((t) => t.excluded && t.excludedReason === "paused")).toBe(true);
  });
});
