import { describe, it } from "vitest";
import { DEMO_NOW, demoTabs } from "../src/fixtures/demo";
import { groupTabs } from "../src/grouping";
describe("fixture", () => { it("shape", () => {
  const r = groupTabs(demoTabs(), { excludedDomains: new Set<string>(), preferences: { paused: false }, now: DEMO_NOW });
  console.log("FIXTURE: " + JSON.stringify(r.groups.map(g => `${g.name}:${g.tabIds.length}`)));
}); });
