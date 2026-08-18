/**
 * SCRATCH pass 5 — does "Excluded sites" keep its promise?
 * Settings copy: "Pages on these sites are never grouped, never remembered,
 * and never leave this device. Banking and healthcare sites are excluded
 * automatically."  Test all three clauses for a user-added domain and for a
 * default-sensitive (banking) domain.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "apps/extension/dist");
const outDir = "/tmp/thicket-settings";
mkdirSync(outDir, { recursive: true });
const headed = process.argv.includes("--headed");

const BASE_TABS = [
  ["https://www.seriouseats.com/best-chili-recipe", "The Best Chili Recipe | Serious Eats"],
  ["https://www.bonappetit.com/recipe/weeknight-chili", "Weeknight Chili Recipe | Bon Appétit"],
  ["https://www.figma.com/design/AbCdEf123/Pricing-page-v3", "Pricing page v3 – Figma"],
  ["https://linear.app/acme/issue/ACM-482/pricing", "ACM-482 Pricing page launch checklist – Linear"],
];
const SECRET_TABS = [
  ["https://www.youtube.com/watch?v=zzzz9999", "Embarrassing karaoke fails - YouTube"],
  ["https://www.chase.com/personal/credit-cards/account-summary", "Account summary | Chase"],
  ["https://www.plannedparenthood.org/learn/birth-control", "Birth Control | Planned Parenthood"],
];
const titleByUrl = new Map([...BASE_TABS, ...SECRET_TABS]);
const stubHtml = (t) => `<!doctype html><html><head><meta charset="utf-8"><title>${t}</title></head><body>${t}</body></html>`;

async function main() {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium", headless: !headed, viewport: { width: 1280, height: 800 },
    colorScheme: "light",
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  await context.route(/^https?:\/\//, async (route) => {
    const url = route.request().url();
    const t = titleByUrl.get(url) ?? [...titleByUrl.entries()].find(([u]) => url.startsWith(u.split("?")[0]))?.[1];
    await route.fulfill({ contentType: "text/html", body: stubHtml(t ?? url) });
  });
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(dist).digest("hex").slice(0, 32);
  const extId = [...hash].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
  for (let i = 0; i < 30 && context.serviceWorkers().length === 0; i++) await new Promise((r) => setTimeout(r, 500));
  for (const p of context.pages()) if (p.url().startsWith("chrome-extension://")) await p.close().catch(() => {});

  const launcher = await context.newPage();
  const open = async (url) => {
    const pp = context.waitForEvent("page", { timeout: 8000 }).catch(() => null);
    await launcher.evaluate((u) => window.open(u, "_blank"), url);
    const p = await pp;
    await p?.waitForLoadState("domcontentloaded").catch(() => {});
    await new Promise((r) => setTimeout(r, 400));
  };
  for (const [url] of BASE_TABS) await open(url);

  const d = await context.newPage();
  await d.goto(`chrome-extension://${extId}/dashboard.html#/now`);
  await d.waitForTimeout(4000);

  // ---- add youtube.com to Excluded sites through the real UI ----
  await d.goto(`chrome-extension://${extId}/dashboard.html#/settings`);
  await d.reload();
  await d.waitForTimeout(1200);
  await d.locator('[aria-label="Domain to exclude"]').fill("youtube.com");
  await d.getByRole("button", { name: "Exclude", exact: true }).click();
  await d.waitForTimeout(1000);
  console.log("excluded list:", JSON.stringify((await d.evaluate(() => chrome.storage.local.get("excludedDomains"))).excludedDomains));
  await d.screenshot({ path: path.join(outDir, "40-excluded-added.png") });

  // ---- now open the sensitive tabs, AFTER the exclusion is in place ----
  await launcher.bringToFront();
  for (const [url] of SECRET_TABS) await open(url);
  await d.bringToFront();
  await d.waitForTimeout(1500);
  await d.evaluate(() => chrome.runtime.sendMessage({ type: "analyze-now" }));
  await d.waitForTimeout(1500);

  // Clause 1: never grouped?
  const grouped = await d.evaluate(async () => {
    const s = await chrome.runtime.sendMessage({ type: "get-state" });
    return {
      groups: s.analysis?.groups.map((g) => `${g.name}(${g.tabIds.length})`),
      sensitiveTabs: s.analysis?.tabs
        .filter((t) => /youtube|chase|plannedparenthood/.test(t.domain ?? ""))
        .map((t) => ({ d: t.domain, excluded: t.excluded, why: t.excludedReason })),
    };
  });
  console.log("CLAUSE 1 grouped:", JSON.stringify(grouped, null, 1));

  // Clause 2: never remembered?
  const remembered = await d.evaluate(async () => {
    const { localHistory = [] } = await chrome.storage.local.get("localHistory");
    return localHistory
      .filter((p) => /youtube|chase|plannedparenthood/.test(p.domain))
      .map((p) => ({ domain: p.domain, title: p.title, url: p.url, pendingSync: p.pendingSync }));
  });
  console.log("CLAUSE 2 remembered in localHistory:", JSON.stringify(remembered, null, 1));

  // And what the user actually sees in the History screen
  await d.goto(`chrome-extension://${extId}/dashboard.html#/history`);
  await d.reload();
  await d.waitForTimeout(1500);
  const historyText = await d.evaluate(() => document.querySelector("main").innerText);
  console.log("HISTORY SCREEN shows youtube:", /youtube|karaoke/i.test(historyText));
  console.log("HISTORY SCREEN shows chase:", /chase|account summary/i.test(historyText));
  console.log("HISTORY SCREEN shows planned parenthood:", /planned parenthood|birth control/i.test(historyText));
  console.log("--- history text ---\n" + historyText.slice(0, 1200));
  await d.screenshot({ path: path.join(outDir, "41-history-after-exclusion.png"), fullPage: true });

  // Search should not surface them either, if "never remembered" is true
  const search = await d.evaluate(() => chrome.runtime.sendMessage({ type: "search", query: "karaoke", scope: "all" }));
  console.log("SEARCH 'karaoke' results:", JSON.stringify(search?.results?.map((r) => r.title ?? r.url)));
  const search2 = await d.evaluate(() => chrome.runtime.sendMessage({ type: "search", query: "birth control", scope: "all" }));
  console.log("SEARCH 'birth control' results:", JSON.stringify(search2?.results?.map((r) => r.title ?? r.url)));

  await context.close();
  console.log("done", outDir);
}
await main();
