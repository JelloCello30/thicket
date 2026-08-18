/**
 * SCRATCH audit harness (pass 3) — command bar & help. Deleted after the audit.
 * Run: node scripts/scratch-commandbar.mjs [--headed]
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "apps/extension/dist");
const outDir = "/tmp/cmdbar";
mkdirSync(outDir, { recursive: true });
const headed = process.argv.includes("--headed");

const STUB_TABS = [
  ["https://www.zillow.com/homedetails/3421-Sunset-Blvd/20501234_zpid/", "3421 Sunset Blvd, Los Angeles, CA 90026 | Zillow"],
  ["https://www.zillow.com/homedetails/1745-Micheltorena-St/20514567_zpid/", "1745 Micheltorena St, Los Angeles, CA 90026 - 2 bd | Zillow"],
  ["https://www.apartments.com/echo-park-los-angeles-ca/2-bedrooms/", "2 Bedroom Apartments for Rent in Echo Park, Los Angeles, CA - Apartments.com"],
  ["https://www.kayak.com/flights/LAX-TYO/2026-10-08", "Los Angeles to Tokyo flights | Kayak"],
  ["https://www.booking.com/searchresults.html?ss=Shinjuku", "Booking.com: Hotels in Shinjuku, Tokyo"],
  ["https://www.dpreview.com/reviews/sony-a7-iv-review", "Sony a7 IV review: Digital Photography Review"],
  ["https://www.bhphotovideo.com/c/product/1668893-REG/sony_a7_iv.html", "Sony a7 IV Mirrorless Camera | B&H Photo Video"],
];
const titleByUrl = new Map(STUB_TABS);
const stubHtml = (t) => `<!doctype html><html><head><meta charset="utf-8"><title>${t}</title></head><body><h1>${t}</h1></body></html>`;

async function main() {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: !headed,
    viewport: { width: 1280, height: 800 },
    colorScheme: "light",
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  await context.route(/^https?:\/\//, async (route) => {
    const url = route.request().url();
    const title = titleByUrl.get(url) ?? [...titleByUrl.entries()].find(([u]) => url.startsWith(u.split("?")[0]))?.[1];
    await route.fulfill({ contentType: "text/html", body: stubHtml(title ?? url) });
  });
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(dist).digest("hex").slice(0, 32);
  const extensionId = [...hash].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
  for (let i = 0; i < 30 && context.serviceWorkers().length === 0; i++) await new Promise((r) => setTimeout(r, 500));
  for (const p of context.pages()) if (p.url().startsWith("chrome-extension://")) await p.close().catch(() => {});

  const launcher = await context.newPage();
  for (const [url] of STUB_TABS) {
    const pop = context.waitForEvent("page", { timeout: 8000 }).catch(() => null);
    await launcher.evaluate((u) => window.open(u, "_blank"), url);
    (await pop)?.waitForLoadState("domcontentloaded").catch(() => {});
  }

  const dash = await context.newPage();
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html#/now`);
  await dash.waitForTimeout(4500);
  await dash.reload();
  await dash.waitForTimeout(1800);

  const shot = (n) => dash.screenshot({ path: path.join(outDir, `${n}.png`) });
  const dlg = () => dash.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].map((d) => d.innerText));
  const toasts = () => dash.evaluate(() => document.body.innerText.split("\n").slice(-4).join(" | "));
  const R = {};
  const INPUT = 'input[aria-label="Search your tabs, or type a command"]';

  const openBar = async () => {
    await dash.keyboard.press("Escape");
    await dash.waitForTimeout(250);
    if (!(await dash.evaluate(() => !!document.querySelector('[aria-label="Command bar"]')))) {
      await dash.locator('[data-help="command"]').click();
      await dash.waitForTimeout(450);
    }
  };

  // Sidebar entry point label, cropped.
  await dash.screenshot({ path: path.join(outDir, "P1-rail.png"), clip: { x: 0, y: 220, width: 260, height: 70 } });
  R.railLabel = await dash.evaluate(() => document.querySelector('[data-help="command"]')?.innerText);
  R.placeholder = await dash.evaluate((s) => document.querySelector(s)?.placeholder, INPUT);

  // Suggestion chips run properly (click chip, click input, Enter).
  R.chips = {};
  for (const chip of ["summarize", "compare", "close duplicates"]) {
    await dash.reload();
    await dash.waitForTimeout(1400);
    await openBar();
    await dash.locator('[aria-label="Command bar"] button', { hasText: chip }).first().click();
    await dash.waitForTimeout(600);
    await dash.locator(INPUT).click();
    await dash.keyboard.press("End");
    await dash.keyboard.press("Enter");
    await dash.waitForTimeout(1600);
    await shot(`P2-chip-${chip.replace(/\s+/g, "-")}`);
    R.chips[chip] = { dialogs: await dlg(), tail: await toasts() };
  }

  // Questions, typed and entered from the input.
  R.questions = {};
  for (const [q, name] of [
    ["what should I close first?", "P3-q-close-first"],
    ["how many tabs do I have open", "P4-q-how-many"],
  ]) {
    await dash.reload();
    await dash.waitForTimeout(1400);
    await openBar();
    await dash.locator(INPUT).click();
    await dash.keyboard.type(q, { delay: 12 });
    await dash.waitForTimeout(900);
    await shot(`${name}-typed`);
    await dash.keyboard.press("Enter");
    await dash.waitForTimeout(1600);
    await shot(`${name}-enter`);
    R.questions[q] = { dialogs: await dlg(), tail: await toasts() };
  }

  // Help search: the founder's own phrasing.
  await dash.reload();
  await dash.waitForTimeout(1400);
  await dash.getByRole("button", { name: "Help", exact: true }).click();
  await dash.waitForTimeout(500);
  await dash.locator('input[aria-label="Search help"]').fill("two groups with the same name");
  await dash.waitForTimeout(700);
  await shot("P5-help-search-samename");
  R.helpSameName = await dash.evaluate(
    () => [...document.querySelectorAll('[role="dialog"] li button[aria-expanded]')].map((b) => b.innerText.replace(/\s+[+–]$/, "")),
  );
  await dash.locator('input[aria-label="Search help"]').fill("zzzzz");
  await dash.waitForTimeout(700);
  await shot("P6-help-search-gibberish");
  R.helpGibberish = await dash.evaluate(
    () => [...document.querySelectorAll('[role="dialog"] li button[aria-expanded]')].map((b) => b.innerText.replace(/\s+[+–]$/, "")),
  );

  writeFileSync("/tmp/cmdbar/report3.json", JSON.stringify(R, null, 2));
  console.log(JSON.stringify(R, null, 2));
  await context.close();
}
await main();
