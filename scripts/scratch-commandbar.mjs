/**
 * SCRATCH audit harness (pass 2) — command bar & help. Deleted after the audit.
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
  ["https://www.zillow.com/homedetails/3421-Sunset-Blvd/20501234_zpid/", "3421 Sunset Blvd, Los Angeles, CA 90026 | Zillow"],
];

const titleByUrl = new Map(STUB_TABS);
const stubHtml = (t) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${t}</title></head><body><h1>${t}</h1></body></html>`;

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
  const dlg = () =>
    dash.evaluate(() => [...document.querySelectorAll('[role="dialog"]')].map((d) => d.innerText));
  const R = {};

  const openBar = async () => {
    await dash.keyboard.press("Escape");
    await dash.waitForTimeout(200);
    if (!(await dash.evaluate(() => !!document.querySelector('[aria-label="Command bar"]')))) {
      await dash.locator('[data-help="command"]').click();
      await dash.waitForTimeout(500);
    }
    console.log("bar open:", await dash.evaluate(() => !!document.querySelector('[aria-label="Command bar"]')));
  };

  // ── A. chip click, then Enter: does the command actually run? ───────────
  await openBar();
  await dash.locator('[aria-label="Command bar"] button', { hasText: "close duplicates" }).first().click();
  await dash.waitForTimeout(700);
  R.afterChipClick = {
    activeElement: await dash.evaluate(() => {
      const a = document.activeElement;
      return a ? `${a.tagName}:${(a.innerText || a.placeholder || "").slice(0, 40)}` : "none";
    }),
    inputValue: await dash.evaluate(
      () => document.querySelector('input[aria-label="Search your tabs, or type a command"]')?.value,
    ),
  };
  await shot("A1-chip-clicked");
  await dash.keyboard.press("Enter");
  await dash.waitForTimeout(1500);
  R.afterChipEnter = { dialogs: await dlg() };
  await shot("A2-chip-enter");
  // now click into the input and press Enter — does it work then?
  await dash.locator('input[aria-label="Search your tabs, or type a command"]').click();
  await dash.keyboard.press("End");
  await dash.keyboard.press("Enter");
  await dash.waitForTimeout(1500);
  R.afterInputEnter = { dialogs: await dlg() };
  await shot("A3-input-enter");
  await dash.keyboard.press("Escape");
  await dash.waitForTimeout(400);

  // ── B. "where was …" run as a command (the popup / no-results path) ────
  R.whereWasCommand = await dash.evaluate(() =>
    chrome.runtime.sendMessage({ type: "command", input: "where was that apartment with the rooftop" }),
  );
  R.whereWasCommandCounts = {
    open: R.whereWasCommand.searchResults?.open.length,
    history: R.whereWasCommand.searchResults?.history.length,
    workspaces: R.whereWasCommand.searchResults?.workspaces.length,
    query: R.whereWasCommand.searchResults?.query,
  };
  R.findApartmentCommand = await dash.evaluate(() =>
    chrome.runtime.sendMessage({ type: "command", input: "find the apartment with the rooftop" }),
  );
  R.findApartmentCounts = {
    open: R.findApartmentCommand.searchResults?.open.length,
    history: R.findApartmentCommand.searchResults?.history.length,
    query: R.findApartmentCommand.searchResults?.query,
  };
  R.whereIsSony = await dash.evaluate(() =>
    chrome.runtime.sendMessage({ type: "command", input: "where was the sony camera review" }),
  );
  R.whereIsSonyCounts = {
    open: R.whereIsSony.searchResults?.open.length,
    history: R.whereIsSony.searchResults?.history.length,
    query: R.whereIsSony.searchResults?.query,
  };

  // The five suggestion chips, run exactly as typed.
  R.chipCommands = {};
  for (const chip of ["close duplicates", "clean up", "summarize", "compare", "help"]) {
    const o = await dash.evaluate((x) => chrome.runtime.sendMessage({ type: "command", input: x }), chip);
    R.chipCommands[chip] = {
      kind: o.kind,
      message: o.message,
      helpQuery: o.helpQuery,
      candidates: o.cleanupPlan?.candidates.length,
      hits: o.searchResults
        ? o.searchResults.open.length + o.searchResults.history.length + o.searchResults.workspaces.length
        : undefined,
    };
  }

  // A few more free-form asks, straight to the background.
  R.asks = {};
  for (const q of [
    "what should I close first?",
    "why are there two research groups",
    "how many tabs do I have open",
    "which of these apartments is cheapest",
  ]) {
    const o = await dash.evaluate((x) => chrome.runtime.sendMessage({ type: "command", input: x }), q);
    R.asks[q] = {
      kind: o.kind,
      message: o.message,
      hits: o.searchResults
        ? o.searchResults.open.length + o.searchResults.history.length + o.searchResults.workspaces.length
        : undefined,
    };
  }

  // ── C. Help panel search behaviour, from a fresh panel ─────────────────
  await dash.reload();
  await dash.waitForTimeout(1500);
  await dash.getByRole("button", { name: "Help", exact: true }).click();
  await dash.waitForTimeout(500);
  R.helpDefaultList = await dash.evaluate(
    () => [...document.querySelectorAll('[role="dialog"] li button[aria-expanded]')].map((b) => b.innerText.replace(/\s+[+–]$/, "")),
  );
  await dash.locator('input[aria-label="Search help"]').fill("delete history");
  await dash.waitForTimeout(600);
  R.helpSearchMatch = await dash.evaluate(
    () => [...document.querySelectorAll('[role="dialog"] li button[aria-expanded]')].map((b) => b.innerText.replace(/\s+[+–]$/, "")),
  );
  await shot("C1-help-search-match");
  await dash.locator('input[aria-label="Search help"]').fill("why are there two research groups");
  await dash.waitForTimeout(600);
  R.helpSearchMiss = await dash.evaluate(
    () => [...document.querySelectorAll('[role="dialog"] li button[aria-expanded]')].map((b) => b.innerText.replace(/\s+[+–]$/, "")),
  );
  await shot("C2-help-search-miss");
  await dash.locator('input[aria-label="Search help"]').fill("merge two groups with the same name");
  await dash.waitForTimeout(600);
  R.helpSearchMerge = await dash.evaluate(
    () => [...document.querySelectorAll('[role="dialog"] li button[aria-expanded]')].map((b) => b.innerText.replace(/\s+[+–]$/, "")),
  );
  await shot("C3-help-search-merge");
  await dash.keyboard.press("Escape");
  await dash.waitForTimeout(300);

  // ── D. Help "do it for me" actions, one fresh panel each ───────────────
  R.helpActions = {};
  const runHelpAction = async (topic, label, name) => {
    await dash.reload();
    await dash.waitForTimeout(1400);
    await dash.getByRole("button", { name: "Help", exact: true }).click();
    await dash.waitForTimeout(500);
    await dash.locator('[role="dialog"] li button[aria-expanded]', { hasText: topic }).first().click();
    await dash.waitForTimeout(400);
    const btn = dash.locator('[role="dialog"] button', { hasText: label }).first();
    if (!(await btn.count())) return (R.helpActions[label] = "BUTTON NOT FOUND");
    const before = { route: await dash.evaluate(() => location.hash), pages: context.pages().length };
    await btn.click();
    await dash.waitForTimeout(1500);
    await shot(name);
    R.helpActions[label] = {
      before,
      afterRoute: await dash.evaluate(() => location.hash),
      newPages: context.pages().length - before.pages,
      newPageUrls: context.pages().slice(before.pages).map((p) => p.url()),
      commandBarOpen: await dash.evaluate(() => !!document.querySelector('[aria-label="Command bar"]')),
      dialogs: (await dlg()).map((t) => t.slice(0, 220)),
      bodyTail: (await dash.evaluate(() => document.body.innerText)).slice(-220),
    };
  };
  await runHelpAction("Find any page again", "Open the command bar", "D1-help-open-commandbar");
  await runHelpAction("Save a group for later", "Save my first group now", "D2-help-save-group");
  await runHelpAction("Clear the noise", "Run cleanup now", "D3-help-run-cleanup");
  await runHelpAction("Sync across devices", "Sign in", "D4-help-sign-in");

  // ── E. "Show me" tour for the two topics that have steps ───────────────
  R.tours = {};
  for (const [topic, name] of [
    ["Fix a wrong group", "E1-tour-fix-group"],
    ["Set up an automation", "E2-tour-automations"],
  ]) {
    await dash.reload();
    await dash.waitForTimeout(1400);
    await dash.getByRole("button", { name: "Help", exact: true }).click();
    await dash.waitForTimeout(500);
    await dash.locator('[role="dialog"] li button[aria-expanded]', { hasText: topic }).first().click();
    await dash.waitForTimeout(300);
    const show = dash.locator('[role="dialog"] button', { hasText: "Show me" }).first();
    if (await show.count()) {
      await show.click();
      await dash.waitForTimeout(1200);
      await shot(name);
      R.tours[topic] = await dash.evaluate(
        () => document.querySelector('[aria-label="Guided tour"]')?.innerText ?? "(no tour)",
      );
      await dash.keyboard.press("Escape");
    } else R.tours[topic] = "(no Show me)";
  }

  writeFileSync("/tmp/cmdbar/report2.json", JSON.stringify(R, null, 2));
  console.log(JSON.stringify(R, null, 2));
  await context.close();
}
await main();
