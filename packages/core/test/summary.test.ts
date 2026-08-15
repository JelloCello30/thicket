import { describe, expect, it } from "vitest";
import { DEMO_NOW, demoTabs } from "../src/fixtures/demo";
import { groupTabs } from "../src/grouping";
import { localComparison, localGroupSummary } from "../src/summary";

/**
 * The signed-out Summarize/Compare experience. These must always produce
 * something useful — and never a fabricated fact.
 */

const ctx = { excludedDomains: new Set<string>(), preferences: { paused: false }, now: DEMO_NOW };
const analysis = groupTabs(demoTabs(), ctx);

function snap(id: number, url: string, title: string) {
  return {
    id,
    windowId: 1,
    index: id,
    url,
    title,
    pinned: false,
    active: false,
    lastAccessed: DEMO_NOW - 10 * 60_000,
  };
}

function findGroup(pattern: RegExp) {
  const group = analysis.groups.find((g) => pattern.test(g.name));
  expect(group, `expected a group matching ${pattern}`).toBeDefined();
  return group!;
}

describe("localGroupSummary", () => {
  it("summarizes a group from real facts only", () => {
    const apartments = findGroup(/Apartment/);
    const summary = localGroupSummary(analysis, apartments.id, DEMO_NOW);
    expect(summary.source).toBe("local");
    expect(summary.doing).toMatch(/\d+ tabs across \d+ sites/);
    expect(summary.findings.length).toBeGreaterThan(0);
    expect(summary.keep.length).toBeGreaterThan(0);
    expect(summary.keep.every((k) => k.url.startsWith("http"))).toBe(true);
    expect(summary.nextStep).toBeTruthy();
  });

  it("extracts price ranges from titles when present", () => {
    const priced = groupTabs(
      [
        snap(1, "https://www.bhphotovideo.com/sony-a7iv", "Sony a7 IV Mirrorless Camera $2,498.00 | B&H"),
        snap(2, "https://www.bhphotovideo.com/fuji-xt5", "Fujifilm X-T5 Mirrorless Camera $1,699.00 | B&H"),
        snap(3, "https://www.bhphotovideo.com/canon-r6", "Canon R6 Mark II Body | B&H"),
      ],
      ctx,
    );
    const group = priced.groups.find((g) => g.tabIds.length >= 2)!;
    const summary = localGroupSummary(priced, group.id, DEMO_NOW);
    const priceFinding = summary.findings.find((f) => f.includes("$"));
    expect(priceFinding).toBeTruthy();
    expect(priceFinding).toContain("$1,699");
    expect(priceFinding).toContain("$2,498");
  });

  it("suggests compare for shoppable groups", () => {
    const cameras = findGroup(/Camera/);
    const summary = localGroupSummary(analysis, cameras.id, DEMO_NOW);
    expect(summary.nextStep).toMatch(/[Cc]ompare/);
  });
});

describe("localComparison", () => {
  it("builds honest rows — blanks stay blank", () => {
    const cameras = findGroup(/Camera/);
    const table = localComparison(analysis, cameras.id, DEMO_NOW);
    expect(table.source).toBe("local");
    expect(table.rows.length).toBeGreaterThanOrEqual(2);
    expect(table.columns.map((c) => c.key)).toEqual(["price", "site", "seen"]);
    // Any price cell either came from the title verbatim or is null.
    for (const row of table.rows) {
      const price = row.values.price;
      if (price != null) expect(row.title).toContain(price.replace(/\s/g, ""));
    }
  });

  it("refuses single-tab comparisons", () => {
    const single = analysis.groups.find((g) => g.tabIds.length < 2);
    if (single) expect(() => localComparison(analysis, single.id, DEMO_NOW)).toThrow(/two tabs/);
  });
});
