/**
 * SCRATCH pass 3 — settings/customization audit of the CURRENT build.
 */
import { mkdirSync, existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "apps/extension/dist");
const outDir = "/tmp/thicket-settings";
mkdirSync(outDir, { recursive: true });

const headed = process.argv.includes("--headed");

const STUB_TABS = [
  ["https://www.seriouseats.com/best-chili-recipe", "The Best Chili Recipe | Serious Eats"],
  ["https://www.bonappetit.com/recipe/weeknight-chili", "Weeknight Chili Recipe | Bon Appétit"],
  ["https://www.nytimes.com/2026/08/01/us/election-results.html", "Election results roundup - The New York Times"],
  ["https://www.theguardian.com/us-news/2026/aug/01/election-results", "Election results: what happened | The Guardian"],
  ["https://www.rei.com/product/tent-half-dome", "REI Co-op Half Dome 2 Tent"],
  ["https://www.backcountry.com/msr-hubba-hubba-tent", "MSR Hubba Hubba NX 2 Tent | Backcountry"],
  ["https://www.youtube.com/watch?v=aaaa1111", "Lofi beats to study to - YouTube"],
  ["https://www.youtube.com/watch?v=bbbb2222", "Backpacking gear I regret buying - YouTube"],
  ["https://www.youtube.com/watch?v=cccc3333", "Tokyo walking tour 4K - YouTube"],
  ["https://en.wikipedia.org/wiki/Photosynthesis", "Photosynthesis - Wikipedia"],
  ["https://www.imdb.com/title/tt0111161/", "The Shawshank Redemption (1994) - IMDb"],
  ["https://news.ycombinator.com/", "Hacker News"],
  ["https://www.figma.com/design/AbCdEf123/Pricing-page-v3", "Pricing page v3 – Figma"],
  ["https://linear.app/acme/issue/ACM-482/pricing-page-launch-checklist", "ACM-482 Pricing page launch checklist – Linear"],
];
const titleByUrl = new Map(STUB_TABS);
const stubHtml = (t) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${t}</title></head><body style="font-family:sans-serif;padding:40px">${t}</body></html>`;

async function main() {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: !headed,
    viewport: { width: 1280, height: 800 },
    colorScheme: "light",
    acceptDownloads: true,
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });

  await context.route(/^https?:\/\//, async (route) => {
    const url = route.request().url();
    const title = titleByUrl.get(url) ?? [...titleByUrl.entries()].find(([u]) => url.startsWith(u.split("?")[0]))?.[1];
    await route.fulfill({ contentType: "text/html", body: stubHtml(title ?? url) });
  });

  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(dist).digest("hex").slice(0, 32);
  const extId = [...hash].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");

  for (let i = 0; i < 30 && context.serviceWorkers().length === 0; i++) await new Promise((r) => setTimeout(r, 500));
  for (const p of context.pages()) if (p.url().startsWith("chrome-extension://")) await p.close().catch(() => {});

  const launcher = await context.newPage();
  for (const [url] of STUB_TABS) {
    const pp = context.waitForEvent("page", { timeout: 8000 }).catch(() => null);
    await launcher.evaluate((u) => window.open(u, "_blank"), url);
    (await pp)?.waitForLoadState("domcontentloaded").catch(() => {});
  }

  const d = await context.newPage();
  const consoleErrors = [];
  d.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  d.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));

  await d.goto(`chrome-extension://${extId}/dashboard.html#/now`);
  await d.waitForTimeout(4500);
  await d.reload();
  await d.waitForTimeout(1500);

  // ---------- Settings screenshot ----------
  await d.goto(`chrome-extension://${extId}/dashboard.html#/settings`);
  await d.reload();
  await d.waitForTimeout(1200);
  await d.screenshot({ path: path.join(outDir, "20-settings-full.png"), fullPage: true });
  const inv = await d.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    return {
      text: main.innerText,
      controls: [...main.querySelectorAll("button,input,select")].map((el) => ({
        t: el.tagName.toLowerCase(), r: el.getAttribute("role"),
        l: el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 40),
        c: el.getAttribute("aria-checked"), v: el.value ?? null,
      })),
    };
  });
  console.log("=== SETTINGS TEXT ===\n" + inv.text);
  console.log("=== CONTROLS ===\n" + JSON.stringify(inv.controls));

  // ---------- Keyboard shortcuts button ----------
  const before = context.pages().length;
  const newPagePromise = context.waitForEvent("page", { timeout: 5000 }).catch(() => null);
  await d.getByRole("button", { name: "Open shortcuts", exact: true }).click();
  const np = await newPagePromise;
  await d.waitForTimeout(1500);
  console.log("shortcuts: pages before", before, "after", context.pages().length);
  console.log("shortcuts: new page url =", np ? np.url() : "NONE OPENED");
  console.log("shortcuts: all page urls =", JSON.stringify(context.pages().map((p) => p.url()).filter((u) => !u.startsWith("https://"))));
  console.log("shortcuts: console errors so far =", JSON.stringify(consoleErrors.slice(-4)));
  await d.screenshot({ path: path.join(outDir, "21-after-shortcuts-click.png") });
  if (np) await np.close().catch(() => {});
  await d.bringToFront();

  // ---------- Export ----------
  let dl = null;
  d.once("download", (x) => (dl = x));
  const dlPromise = d.waitForEvent("download", { timeout: 8000 }).catch(() => null);
  await d.getByRole("button", { name: "Export a copy", exact: true }).click();
  const download = await dlPromise;
  await d.waitForTimeout(1200);
  if (download) {
    const p = path.join(outDir, "export.json");
    await download.saveAs(p);
    const body = readFileSync(p, "utf8");
    console.log("export: filename =", download.suggestedFilename(), "bytes =", body.length);
    console.log("export: top-level keys =", JSON.stringify(Object.keys(JSON.parse(body))));
  } else {
    console.log("export: NO DOWNLOAD FIRED");
  }
  await d.screenshot({ path: path.join(outDir, "22-after-export.png") });
  console.log("export: body toast =", (await d.evaluate(() => document.body.innerText)).slice(0, 200).replace(/\n/g, " | "));

  // ---------- Display prefs: do they change the Now view? ----------
  const nowSnapshot = async (label) => {
    await d.goto(`chrome-extension://${extId}/dashboard.html#/now`);
    await d.waitForTimeout(1000);
    const s = await d.evaluate(() => {
      const secs = [...document.querySelectorAll("section")];
      const rows = document.querySelectorAll("section li");
      const first = document.querySelector("section li");
      return {
        headings: secs.map((x) => x.querySelector("header")?.innerText?.split("\n")[0]?.trim()).filter(Boolean),
        visibleTabRows: rows.length,
        firstRowHeight: first ? Math.round(first.getBoundingClientRect().height) : null,
      };
    });
    console.log(`NOW[${label}]`, JSON.stringify(s));
    await d.screenshot({ path: path.join(outDir, `23-now-${label}.png`) });
    return s;
  };
  const setPref = async (patch) => {
    await d.evaluate((p) => chrome.runtime.sendMessage({ type: "set-prefs", patch: p }), patch);
    await d.waitForTimeout(800);
  };

  await setPref({ groupSort: "recent", density: "comfortable", expandGroups: true, showStalePile: true, showCatchAll: true });
  const base = await nowSnapshot("base");
  await setPref({ groupSort: "name" });
  const byName = await nowSnapshot("sort-name");
  await setPref({ groupSort: "size" });
  const bySize = await nowSnapshot("sort-size");
  await setPref({ groupSort: "recent", density: "compact" });
  const compact = await nowSnapshot("compact");
  await setPref({ density: "comfortable", expandGroups: false });
  const collapsed = await nowSnapshot("collapsed");
  await setPref({ expandGroups: true, showCatchAll: false });
  const noCatchAll = await nowSnapshot("no-catchall");
  await setPref({ showCatchAll: true, showStalePile: false });
  const noStale = await nowSnapshot("no-stale");
  await setPref({ showStalePile: true });

  console.log("SORT works:", JSON.stringify(base.headings) !== JSON.stringify(byName.headings), "| size:", JSON.stringify(base.headings) !== JSON.stringify(bySize.headings));
  console.log("DENSITY works:", base.firstRowHeight, "->", compact.firstRowHeight);
  console.log("EXPAND works:", base.visibleTabRows, "->", collapsed.visibleTabRows);
  console.log("CATCHALL hidden:", JSON.stringify(noCatchAll.headings));
  console.log("STALE hidden:", JSON.stringify(noStale.headings));

  // ---------- Excluded sites input tolerance ----------
  await d.goto(`chrome-extension://${extId}/dashboard.html#/settings`);
  await d.waitForTimeout(900);
  for (const entry of ["https://www.YouTube.com/watch?v=x", "Reddit.com"]) {
    await d.locator('[aria-label="Domain to exclude"]').fill(entry);
    await d.getByRole("button", { name: "Exclude", exact: true }).click();
    await d.waitForTimeout(700);
  }
  console.log("excluded stored:", JSON.stringify(await d.evaluate(() => chrome.storage.local.get("excludedDomains"))));
  await d.screenshot({ path: path.join(outDir, "24-excluded.png"), fullPage: true });

  // ---------- Erase everything ----------
  await d.getByRole("button", { name: "Erase everything…", exact: true }).click();
  await d.waitForTimeout(400);
  await d.screenshot({ path: path.join(outDir, "25-wipe-confirm.png") });
  await d.getByRole("button", { name: "Yes, erase everything", exact: true }).click();
  await d.waitForTimeout(1800);
  await d.screenshot({ path: path.join(outDir, "26-after-wipe.png"), fullPage: true });
  const afterWipe = await d.evaluate(() => chrome.storage.local.get(null));
  console.log("storage after wipe keys:", JSON.stringify(Object.keys(afterWipe)));
  console.log("prefs after wipe:", JSON.stringify(afterWipe.prefs));
  console.log("excluded after wipe:", JSON.stringify(afterWipe.excludedDomains));
  console.log("settings text after wipe:", (await d.evaluate(() => document.querySelector("main").innerText)).slice(0, 400).replace(/\n/g, " | "));

  console.log("CONSOLE ERRORS:", JSON.stringify(consoleErrors));
  await context.close();
  console.log("shots in", outDir);
}
await main();
