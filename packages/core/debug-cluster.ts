// Throwaway diagnostic: print clusters + suspicious pair scores.
import { demoTabs, DEMO_NOW } from "./src/fixtures/demo";
import { analyzeTabs } from "./src/analyze";
import { clusterTabs } from "./src/cluster";
import { featuresFor, pairScore } from "./src/similarity";

const ctx = { excludedDomains: new Set<string>(), preferences: { paused: false }, now: DEMO_NOW };
const tabs = analyzeTabs(demoTabs(), ctx);
const outcome = clusterTabs(tabs);

console.log("=== CLUSTERS ===");
outcome.clusters.forEach((c, i) => {
  console.log(`\n#${i} cohesion=${c.cohesion.toFixed(2)}`);
  for (const idx of c.memberIdx) {
    const t = tabs[idx]!;
    console.log(`   [${t.domain}] ${t.title.slice(0, 60)} | ent=${JSON.stringify(t.entities)}`);
  }
});
console.log("\nREADING:", outcome.readingIdx.map((i) => tabs[i]!.domain));
console.log("DONE:", outcome.probablyDoneIdx.map((i) => tabs[i]!.domain));
console.log("OTHER:", outcome.otherIdx.map((i) => tabs[i]!.domain));

const features = featuresFor(tabs);
const find = (part: string) => tabs.findIndex((t) => t.url.includes(part));
const pairs: [string, string][] = [
  ["nerdwallet", "walkscore"],
  ["nerdwallet", "zillow.com/homedetails/3421"],
  ["walkscore", "silver_lake_vs_echo_park"],
  ["tabelog", "timeout.com"],
  ["tabelog", "kayak"],
  ["figma", "linear.app/acme/issue/ACM-482"],
  ["figma", "notion.so"],
  ["notion.so", "dashboard.stripe"],
  ["vercel", "dashboard.stripe"],
  ["posthog", "vercel"],
  ["figma", "vercel"],
  ["timeout.com", "tripadvisor"],
];
console.log("\n=== PAIR SCORES ===");
for (const [a, b] of pairs) {
  const i = find(a);
  const j = find(b);
  if (i < 0 || j < 0) {
    console.log(`${a} vs ${b}: NOT FOUND`);
    continue;
  }
  console.log(
    `${a} vs ${b}: ${pairScore(features[i]!, features[j]!).toFixed(3)} | themes ${[...features[i]!.themes]} / ${[...features[j]!.themes]}`,
  );
}
