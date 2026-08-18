/**
 * SCRATCH audit driver for the "Now" grouping surface.
 * Run: node scripts/scratch-grouping.mjs [youtube|dup|restart] [--headed]
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "apps/extension/dist");
const outDir = "/tmp/thicket-grouping";
mkdirSync(outDir, { recursive: true });

const headed = process.argv.includes("--headed");
const scenario = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "youtube";

const YT = [
  ["https://www.youtube.com/", "YouTube", "neutral"],
  ["https://www.youtube.com/watch?v=aa11", "I Tried Every Ramen Shop in Tokyo for 30 Days", 0],
  ["https://www.youtube.com/watch?v=bb22", "The Physics of Skateboarding, Explained", 0],
  ["https://www.youtube.com/watch?v=cc33", "Chopin Nocturne Op. 9 No. 2 — live at Carnegie Hall", 0],
  ["https://www.youtube.com/watch?v=dd44", "Why Rust Is Taking Over Systems Programming", 0],
  ["https://www.youtube.com/results?search_query=espresso", "espresso - YouTube", "neutral"],
  ["https://www.youtube.com/watch?v=ee55", "The Best Espresso Machine Under $500 (2026 Review)", 5],
  ["https://www.youtube.com/watch?v=ff66", "How to Dial In Espresso Like a Barista", 5],
  ["https://www.youtube.com/watch?v=gg77", "Lofi Beats to Study To — 3 Hour Mix", 5],
  ["https://github.com/acme/web/pull/1841", "feat(pricing): new plan cards · Pull Request #1841 · acme/web", "neutral"],
  ["https://docs.google.com/document/d/abc/edit", "weekly notes - Google Docs", "neutral"],
  ["https://en.wikipedia.org/wiki/Espresso", "Espresso - Wikipedia", "neutral"],
];

const DUP = [
  ["https://docs.google.com/document/d/n1/edit", "weekly notes - Google Docs", "neutral"],
  ["https://docs.google.com/document/d/n2/edit", "weekly notes archive - Google Docs", "neutral"],
  ["https://docs.google.com/document/d/n3/edit", "notes on weekly cadence - Google Docs", "neutral"],
  ["https://linear.app/x/issue/AAA-1/queue", "queue backlog triage", "neutral"],
  ["https://linear.app/x/issue/AAA-2/queue", "queue backlog cleanup", "neutral"],
  ["https://linear.app/x/issue/AAA-3/queue", "queue backlog owners", "neutral"],
  ["https://www.reddit.com/r/coffee/comments/1/grinder_advice/", "grinder advice please : r/coffee", "neutral"],
  ["https://news.ycombinator.com/item?id=1", "the case for boring technology | Hacker News", "neutral"],
  ["https://www.theverge.com/2026/1/1/handheld", "the handheld console war is heating up - The Verge", "neutral"],
];

// Phase 1 of "restart": an ordinary session Thicket mirrors into native Chrome
// tab groups (prefs.mirrorTabGroups defaults to true).
const RESTART = [
  ["https://docs.google.com/document/d/n1/edit", "weekly notes - Google Docs", "neutral"],
  ["https://docs.google.com/document/d/n2/edit", "weekly notes archive - Google Docs", "neutral"],
  ["https://docs.google.com/document/d/n3/edit", "notes on weekly cadence - Google Docs", "neutral"],
  ["https://www.zillow.com/homedetails/3421-Sunset-Blvd/20501234_zpid/", "3421 Sunset Blvd, Los Angeles, CA 90026 | Zillow", "neutral"],
  ["https://www.zillow.com/homedetails/1745-Micheltorena-St/20514567_zpid/", "1745 Micheltorena St, Los Angeles, CA 90026 - 2 bd | Zillow", "neutral"],
  ["https://www.apartments.com/echo-park-los-angeles-ca/2-bedrooms/", "2 Bedroom Apartments for Rent in Echo Park, Los Angeles, CA - Apartments.com", "neutral"],
];

// Phase 2: tabs opened AFTER the restart, in the very same two activities.
const RESTART_PHASE2 = [
  ["https://docs.google.com/document/d/n4/edit", "weekly notes q3 - Google Docs", "neutral"],
  ["https://docs.google.com/document/d/n5/edit", "weekly notes q4 - Google Docs", "neutral"],
  ["https://www.redfin.com/CA/Los-Angeles/echo-park/apartments", "Apartments for Rent in Echo Park, Los Angeles | Redfin", "neutral"],
  ["https://www.trulia.com/CA/Los_Angeles/echo-park/", "Echo Park Apartments for Rent, Los Angeles | Trulia", "neutral"],
];

const SCENARIOS = { youtube: YT, dup: DUP, restart: RESTART };
const TABS = SCENARIOS[scenario] ?? YT;

const titleByUrl = new Map([...TABS, ...RESTART_PHASE2].map(([u, t]) => [u, t]));

function stubHtml(title) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:sans-serif;padding:40px;color:#444"><h1 style="font-size:18px">${title}</h1></body></html>`;
}

function dumpGroups(state, label) {
  console.log(
    `\n${label}:`,
    JSON.stringify(
      state.analysis?.groups.map((g) => ({
        name: g.name,
        kind: g.kind,
        n: g.tabIds.length,
        nativeGroupId: g.nativeGroupId,
        catchAll: g.isCatchAll,
        signals: g.signals,
        titles: g.tabIds.map(
          (id) => state.analysis.tabs.find((t) => t.tabId === id)?.title?.slice(0, 48),
        ),
      })),
      null,
      1,
    ),
  );
}

async function main() {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: !headed,
    viewport: { width: 1280, height: 900 },
    colorScheme: "light",
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });

  await context.route(/^https?:\/\//, async (route) => {
    const url = route.request().url();
    const title =
      titleByUrl.get(url) ??
      [...titleByUrl.entries()].find(([u]) => url.startsWith(u.split("?")[0]))?.[1];
    await route.fulfill({ contentType: "text/html", body: stubHtml(title ?? url) });
  });

  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(dist).digest("hex").slice(0, 32);
  const extensionId = [...hash].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
  console.log("extension id:", extensionId);

  for (let i = 0; i < 30 && context.serviceWorkers().length === 0; i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  for (const page of context.pages()) {
    if (page.url().startsWith("chrome-extension://")) await page.close().catch(() => {});
  }

  const neutral = await context.newPage();
  const opened = [];
  const openFrom = async (page, url) => {
    const popupPromise = context.waitForEvent("page", { timeout: 8000 }).catch(() => null);
    await page.evaluate((u) => window.open(u, "_blank"), url);
    const popup = await popupPromise;
    await popup?.waitForLoadState("domcontentloaded").catch(() => {});
    return popup;
  };
  for (const [url, , from] of TABS) {
    const parent = from === "neutral" ? neutral : opened[from];
    opened.push(await openFrom(parent ?? neutral, url));
  }

  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/now`);
  await dashboard.waitForTimeout(4000);
  await dashboard.evaluate(() => chrome.runtime.sendMessage({ type: "analyze-now" }));
  await dashboard.waitForTimeout(1500);
  await dashboard.reload();
  await dashboard.waitForTimeout(1200);

  let state = await dashboard.evaluate(() => chrome.runtime.sendMessage({ type: "get-state" }));
  if (scenario !== "restart") {
    console.log(
      "\nANALYZED TABS:",
      JSON.stringify(
        state.analysis?.tabs.map((t) => ({
          id: t.tabId, dom: t.domain, cat: t.category, ex: t.excluded || undefined,
          opener: t.openerTabId, ent: t.entities, tok: t.tokens.slice(0, 8).join("|"),
        })),
        null,
        1,
      ),
    );
  }
  dumpGroups(state, "GROUPS");
  const rendered = await dashboard.evaluate(() =>
    [...document.querySelectorAll("section header")].map((h) => h.innerText.replace(/\n/g, " | ")),
  );
  console.log("\nRENDERED HEADERS:", JSON.stringify(rendered));
  console.log(
    "\nSUMMARY LINE:",
    await dashboard.evaluate(() => document.querySelector("main p")?.innerText ?? "(none)"),
  );
  await dashboard.screenshot({ path: path.join(outDir, `${scenario}-now.png`), fullPage: true });
  await dashboard.locator("section header").first().hover();
  await dashboard.waitForTimeout(300);
  await dashboard.screenshot({ path: path.join(outDir, `${scenario}-now-hover.png`) });

  if (scenario === "restart") {
    // What Thicket wrote into the tab strip, and what it remembers writing.
    const before = await dashboard.evaluate(async () => ({
      native: (await chrome.tabGroups.query({})).map((g) => ({ id: g.id, title: g.title })),
      mirrorMap: (await chrome.storage.session.get("mirrorMap")).mirrorMap ?? null,
    }));
    console.log("\nNATIVE GROUPS AFTER MIRROR:", JSON.stringify(before, null, 1));

    // ——— Simulate a browser restart ———
    // chrome.storage.session is wiped when the browser closes; native tab
    // groups are restored with the session. Reproduce exactly that skew.
    await dashboard.evaluate(() => chrome.storage.session.remove("mirrorMap"));

    // The user reopens a couple more tabs for the same two activities.
    for (const [url] of RESTART_PHASE2) await openFrom(neutral, url);

    await dashboard.evaluate(() => chrome.runtime.sendMessage({ type: "analyze-now" }));
    await dashboard.waitForTimeout(1800);
    await dashboard.reload();
    await dashboard.waitForTimeout(1500);

    state = await dashboard.evaluate(() => chrome.runtime.sendMessage({ type: "get-state" }));
    dumpGroups(state, "GROUPS AFTER RESTART");
    const after = await dashboard.evaluate(async () => ({
      native: (await chrome.tabGroups.query({})).map((g) => ({ id: g.id, title: g.title })),
    }));
    console.log("\nNATIVE GROUPS AFTER RESTART:", JSON.stringify(after, null, 1));
    const renderedAfter = await dashboard.evaluate(() =>
      [...document.querySelectorAll("section header")].map((h) => h.innerText.replace(/\n/g, " | ")),
    );
    console.log("\nRENDERED HEADERS AFTER RESTART:", JSON.stringify(renderedAfter));
    console.log(
      "\nSUMMARY LINE AFTER RESTART:",
      await dashboard.evaluate(() => document.querySelector("main p")?.innerText ?? "(none)"),
    );
    await dashboard.screenshot({ path: path.join(outDir, `restart-after.png`), fullPage: true });
  }

  await context.close();
}

await main();
