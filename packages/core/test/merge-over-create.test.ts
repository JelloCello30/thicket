import { describe, expect, it } from "vitest";
import type { TabSnapshot } from "@tabmind/types";
import { DEMO_NOW, demoTabs } from "../src/fixtures/demo";
import { groupTabs } from "../src/grouping";
import { featuresFor, pairScore } from "../src/similarity";
import { analyzeTabs } from "../src/analyze";

/**
 * The merge-over-create rule, from a real founder bug report: tabs with the
 * same title or topic must land in the SAME group. The clusterer may never
 * show two groups for one topic, and near-identical titles always unite.
 */

const ctx = { excludedDomains: new Set<string>(), preferences: { paused: false }, now: DEMO_NOW };

let nextId = 100;
function snap(url: string, title: string, extra: Partial<TabSnapshot> = {}): TabSnapshot {
  return {
    id: nextId++,
    windowId: 1,
    index: nextId,
    url,
    title,
    pinned: false,
    active: false,
    lastAccessed: DEMO_NOW - 15 * 60_000,
    ...extra,
  };
}

describe("same title / same page", () => {
  it("the same page open twice scores 1.0 — inseparable", () => {
    const tabs = analyzeTabs(
      [
        snap("https://www.zillow.com/homedetails/123-Main/1_zpid/", "123 Main St | Zillow"),
        snap("https://www.zillow.com/homedetails/123-Main/1_zpid/?utm_source=share", "123 Main St | Zillow"),
      ],
      ctx,
    );
    const features = featuresFor(tabs);
    expect(pairScore(features[0]!, features[1]!)).toBe(1);
  });

  it("near-identical titles across different sites always clear the union bar", () => {
    const tabs = analyzeTabs(
      [
        snap("https://www.dpreview.com/reviews/sony-a7-iv", "Sony a7 IV review: the hybrid king"),
        snap("https://www.petapixel.com/sony-a7-iv-review", "Sony a7 IV Review: The Hybrid King"),
      ],
      ctx,
    );
    const features = featuresFor(tabs);
    expect(pairScore(features[0]!, features[1]!)).toBeGreaterThanOrEqual(0.85);
  });

  it("short/generic titles do NOT trigger the same-title glue", () => {
    const tabs = analyzeTabs(
      [
        snap("https://www.blueplate.com/menu", "Menu"),
        snap("https://www.tacostand.com/menu", "Menu"),
      ],
      ctx,
    );
    const features = featuresFor(tabs);
    // One content token each — below the 2-token floor, no forced union.
    expect(pairScore(features[0]!, features[1]!)).toBeLessThan(0.45);
    // And even same-title work tools may unite via the work suite, but never
    // through the near-identical-title floor.
    const work = analyzeTabs(
      [snap("https://app.figma.com/files", "Dashboard"), snap("https://dashboard.stripe.com/", "Dashboard")],
      ctx,
    );
    const wf = featuresFor(work);
    expect(pairScore(wf[0]!, wf[1]!)).toBeLessThan(0.85);
  });
});

describe("one topic, one group", () => {
  it("two clusters about the same entity merge instead of coexisting", () => {
    nextId = 100;
    // Two halves of a Tokyo trip engineered to cluster separately:
    // flights+hotels vs guides — linked only by the entity "Tokyo".
    const tabs = [
      snap("https://www.kayak.com/flights/LAX-TYO", "Los Angeles to Tokyo flights | Kayak"),
      snap("https://www.booking.com/searchresults?ss=Tokyo", "Booking.com: Hotels in Tokyo"),
      snap("https://www.japan-guide.com/e/e2164.html", "Tokyo Travel Guide - japan-guide.com"),
      snap("https://www.timeout.com/tokyo/things-to-do", "52 Best Things to Do in Tokyo | Time Out"),
    ];
    const result = groupTabs(tabs, ctx);
    const tokyoGroups = result.groups.filter(
      (g) => /tokyo/i.test(g.name) || /tokyo/i.test(g.entity ?? ""),
    );
    expect(tokyoGroups.length).toBe(1);
    expect(tokyoGroups[0]!.tabIds.length).toBe(4);
  });

  it("never renders two groups with the same name", () => {
    nextId = 200;
    // A large mixed session; whatever the clusterer decides, no two visible
    // groups may share a name — that IS the duplicate-group bug.
    const result = groupTabs(demoTabs(), ctx);
    const names = result.groups.map((g) => g.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
  });

  it("a straggler about an existing topic joins it rather than founding a rival", () => {
    nextId = 300;
    const tabs = [
      snap("https://www.zillow.com/homedetails/111-Oak/1_zpid/", "111 Oak Ave, Los Angeles - 2bd | Zillow"),
      snap("https://www.zillow.com/homedetails/222-Elm/2_zpid/", "222 Elm St, Los Angeles - 1bd | Zillow"),
      snap("https://www.apartments.com/los-angeles", "Apartments for Rent in Los Angeles | Apartments.com"),
      // The straggler: same activity, different site, no shared domain.
      snap("https://www.trulia.com/for_rent/Los_Angeles", "Los Angeles Rentals - Trulia"),
    ];
    const result = groupTabs(tabs, ctx);
    const housing = result.groups.filter((g) => ["realestate"].includes(g.kind) && !g.isCatchAll);
    expect(housing.length).toBe(1);
    expect(housing[0]!.tabIds.length).toBe(4);
  });
});

describe("regression: the demo session still groups correctly", () => {
  it("keeps the four expected activities distinct", () => {
    const result = groupTabs(demoTabs(), ctx);
    const names = result.groups.map((g) => g.name);
    expect(names.some((n) => /Apartment/i.test(n))).toBe(true);
    expect(names.some((n) => /Trip/i.test(n))).toBe(true);
    expect(names.some((n) => /Camera/i.test(n))).toBe(true);
    expect(names.some((n) => /Work|Pricing/i.test(n))).toBe(true);
  });
});
