import { describe, expect, it } from "vitest";
import type { TabSnapshot } from "@thicket/types";
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

  it("does NOT fuse different activities that merely share an entity", () => {
    nextId = 400;
    // "Los Angeles" is the entity of both an apartment hunt and a trip.
    // Same word, two intentions — merging them would be the over-merge bug.
    const tabs = [
      snap("https://www.zillow.com/homedetails/111-Oak/1_zpid/", "111 Oak Ave, Los Angeles - 2bd | Zillow"),
      snap("https://www.zillow.com/homedetails/222-Elm/2_zpid/", "222 Elm St, Los Angeles - 1bd | Zillow"),
      snap("https://www.apartments.com/los-angeles", "Apartments for Rent in Los Angeles | Apartments.com"),
      snap("https://www.kayak.com/flights/JFK-LAX", "New York to Los Angeles flights | Kayak"),
      snap("https://www.booking.com/searchresults?ss=Los+Angeles", "Booking.com: Hotels in Los Angeles"),
      snap("https://www.airbnb.com/s/Los-Angeles/homes", "Los Angeles vacation rentals - Airbnb"),
    ];
    const result = groupTabs(tabs, ctx);
    const real = result.groups.filter((g) => !g.isCatchAll && !g.isStale);
    const housing = real.find((g) => g.kind === "realestate");
    const travel = real.find((g) => g.kind === "travel");
    expect(housing).toBeDefined();
    expect(travel).toBeDefined();
    expect(housing!.id).not.toBe(travel!.id);
    // No listing tab leaked into the trip and vice versa.
    const titleOf = (id: number) => result.tabs.find((t) => t.tabId === id)!.title;
    expect(housing!.tabIds.map(titleOf).every((t) => /Zillow|Apartments\.com/.test(t))).toBe(true);
    expect(travel!.tabIds.map(titleOf).every((t) => /Kayak|Booking|Airbnb/.test(t))).toBe(true);
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

describe("merging must not overreach", () => {
  it("hash-routed apps are not 'the same page' just because the hash is gone", () => {
    const tabs = analyzeTabs(
      [
        snap("https://mail.google.com/mail/u/0/#inbox", "Inbox (42) - me@example.com - Gmail"),
        snap("https://mail.google.com/mail/u/0/#search/greenhouse", "Search results - Gmail"),
      ],
      ctx,
    );
    // Gmail routes in the fragment; flattening it made every view identical.
    expect(tabs[0]!.normalizedUrl).not.toBe(tabs[1]!.normalizedUrl);
    const features = featuresFor(tabs);
    expect(pairScore(features[0]!, features[1]!)).toBeLessThan(1);
  });

  it("two different purchases that both fall back to 'Shopping' stay apart and get distinct names", () => {
    nextId = 500;
    const tabs = [
      // A coffee machine hunt.
      snap("https://www.bestbuy.com/site/breville-barista-express", "Breville Barista Express Espresso Machine - Best Buy"),
      snap("https://www.target.com/p/breville-barista-express", "Breville Barista Express Espresso Machine : Target"),
      snap("https://www.walmart.com/ip/breville-barista-express", "Breville Barista Express Espresso Machine - Walmart.com"),
      // An unrelated mattress hunt.
      snap("https://www.bestbuy.com/site/casper-original-mattress", "Casper Original Foam Mattress Queen - Best Buy"),
      snap("https://www.target.com/p/casper-original-mattress", "Casper Original Foam Mattress Queen : Target"),
      snap("https://www.walmart.com/ip/casper-original-mattress", "Casper Original Foam Mattress Queen - Walmart.com"),
    ];
    const result = groupTabs(tabs, ctx);
    const real = result.groups.filter((g) => !g.isCatchAll);
    const names = real.map((g) => g.name.toLowerCase());
    // Whatever the split, the user must never see two identical labels.
    expect(new Set(names).size).toBe(names.length);
    // And the two products must not have been fused on the shared "Shopping" label.
    const titleOf = (id: number) => result.tabs.find((t) => t.tabId === id)!.title;
    for (const group of real) {
      const titles = group.tabIds.map(titleOf).join(" ");
      const hasCoffee = /Breville/.test(titles);
      const hasMattress = /Casper/.test(titles);
      expect(hasCoffee && hasMattress).toBe(false);
    }
  });
});

describe("same topic across different sites", () => {
  it("several outlets covering one story land in one group named for it", () => {
    nextId = 600;
    const tabs = [
      snap("https://www.reuters.com/world/eaton-fire-containment", "Eaton Fire Containment Grows To 45 Percent"),
      snap("https://www.bbc.com/news/eaton-fire-evacuations", "Eaton Fire Evacuation Orders Lifted For Altadena"),
      snap("https://apnews.com/article/eaton-fire-damage", "Eaton Fire Damage Assessment Begins"),
    ];
    const result = groupTabs(tabs, ctx);
    const real = result.groups.filter((g) => !g.isCatchAll);
    expect(real).toHaveLength(1);
    expect(real[0]!.tabIds).toHaveLength(3);
    expect(real[0]!.name).toMatch(/Eaton Fire/i);
  });

  it("site chrome is never an entity, so unrelated repos don't fuse on it", () => {
    const tabs = analyzeTabs(
      [
        snap("https://github.com/acme/checkout-service/pull/482", "feat(webhooks): idempotency · Pull Request #482 · acme/checkout-service"),
        snap("https://github.com/acme/atlas-dashboard/pull/77", "fix(table): virtualized rows · Pull Request #77 · acme/atlas-dashboard"),
      ],
      ctx,
    );
    for (const tab of tabs) {
      expect(tab.entities.map((e) => e.toLowerCase())).not.toContain("pull request");
    }
    const features = featuresFor(tabs);
    // Different repos on the same host must not clear the union bar on chrome.
    expect(pairScore(features[0]!, features[1]!)).toBeLessThan(0.45);
  });

  it("one product listed under a shorter title on another retailer still merges", () => {
    const tabs = analyzeTabs(
      [
        snap("https://www.bestbuy.com/site/breville-barista-express", "Breville Barista Express Espresso Machine Stainless Steel"),
        snap("https://www.williams-sonoma.com/products/breville-barista-express", "Breville Barista Express Espresso Machine"),
      ],
      ctx,
    );
    const features = featuresFor(tabs);
    // The shorter title is a strict subset of the longer — same product.
    expect(pairScore(features[0]!, features[1]!)).toBeGreaterThanOrEqual(0.85);
  });
});

describe("names the user chose are never rewritten", () => {
  it("disambiguation suffixes the other group, not the user's own name", () => {
    nextId = 700;
    const tabs = [
      snap("https://www.bestbuy.com/site/breville-barista-express", "Breville Barista Express Espresso Machine - Best Buy"),
      snap("https://www.target.com/p/breville-barista-express", "Breville Barista Express Espresso Machine : Target"),
      snap("https://www.walmart.com/ip/casper-original-mattress", "Casper Original Foam Mattress Queen - Walmart.com"),
      snap("https://www.target.com/p/casper-original-mattress", "Casper Original Foam Mattress Queen : Target"),
    ];
    const first = groupTabs(tabs, ctx);
    const target = first.groups.find((g) => !g.isCatchAll);
    expect(target).toBeDefined();
    // The user renames that group to a word that is also a fallback label.
    const previous = first.groups
      .filter((g) => !g.isCatchAll)
      .map((g) => ({
        id: g.id,
        name: g.id === target!.id ? "Shopping" : g.name,
        kind: g.kind,
        color: g.color,
        userNamed: g.id === target!.id,
        memberUrls: g.tabIds.map((id) => first.tabs.find((t) => t.tabId === id)!.normalizedUrl),
      }));
    const second = groupTabs(tabs, ctx, { previous });
    const kept = second.groups.find((g) => g.id === target!.id);
    expect(kept?.name).toBe("Shopping");
    const names = second.groups.filter((g) => !g.isCatchAll).map((g) => g.name.toLowerCase());
    expect(new Set(names).size).toBe(names.length);
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
