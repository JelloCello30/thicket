import { describe, it } from "vitest";
import type { TabSnapshot } from "@thicket/types";
import { groupTabs } from "../src/grouping";
const NOW = 1770000000000;
let id = 1;
const t = (url: string, title: string): TabSnapshot => ({ id: id++, windowId: 1, index: id, url, title, pinned: false, active: false, lastAccessed: NOW - 20*60_000 });
const ctx = { excludedDomains: new Set<string>(), preferences: { paused: false }, now: NOW };
const show = (label: string, T: TabSnapshot[]) => {
  const r = groupTabs(T, ctx);
  console.log(`### ${label}`);
  for (const g of r.groups) console.log(`   "${g.name}" (${g.kind}) [${g.tabIds.length}]`);
};
describe("repro", () => {
  it("youtube: two token-linked subsets", () => { id=1; show("YOUTUBE-SPLIT", [
    t("https://www.youtube.com/watch?v=a1","Sourdough starter guide part 1"),
    t("https://www.youtube.com/watch?v=a2","Sourdough starter guide part 2"),
    t("https://www.youtube.com/watch?v=a3","Sourdough bread scoring tips"),
    t("https://www.youtube.com/watch?v=b1","Cello vibrato exercises lesson 1"),
    t("https://www.youtube.com/watch?v=b2","Cello vibrato exercises lesson 2"),
    t("https://www.youtube.com/watch?v=b3","Cello bow hold masterclass"),
  ]); });
  it("two reference clusters", () => { id=1; show("REFERENCE-SPLIT", [
    t("https://arxiv.org/abs/2401.001","Diffusion transformers for protein design"),
    t("https://arxiv.org/abs/2401.002","Protein folding with diffusion priors"),
    t("https://arxiv.org/abs/2401.003","Protein structure diffusion benchmark"),
    t("https://arxiv.org/abs/2402.101","Sparse autoencoders for language models"),
    t("https://arxiv.org/abs/2402.102","Language model feature sparsity"),
    t("https://arxiv.org/abs/2402.103","Sparse features in language models"),
  ]); });
});
