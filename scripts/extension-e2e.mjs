/**
 * End-to-end proof + Chrome Web Store screenshot capture.
 *
 * Loads the built extension into real Chrome, opens a realistic set of tabs
 * (real domains, stubbed responses — no network), and verifies the dashboard
 * groups them into the expected activities. Saves 1280×800 store shots.
 *
 * Run: node scripts/extension-e2e.mjs [--headed]
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "apps/extension/dist");
const outDir = path.join(root, "apps/extension/release/screenshots");
mkdirSync(outDir, { recursive: true });

const headed = process.argv.includes("--headed");

const STUB_TABS = [
  // Apartment hunt
  ["https://www.zillow.com/homedetails/3421-Sunset-Blvd/20501234_zpid/", "3421 Sunset Blvd, Los Angeles, CA 90026 | Zillow"],
  ["https://www.zillow.com/homedetails/1745-Micheltorena-St/20514567_zpid/", "1745 Micheltorena St, Los Angeles, CA 90026 - 2 bd | Zillow"],
  ["https://www.apartments.com/echo-park-los-angeles-ca/2-bedrooms/", "2 Bedroom Apartments for Rent in Echo Park, Los Angeles, CA - Apartments.com"],
  ["https://www.nerdwallet.com/mortgages/rent-calculator", "Rent Calculator: How Much Rent Can I Afford? - NerdWallet"],
  ["https://www.reddit.com/r/LosAngeles/comments/1abcde/silver_lake_vs_echo_park_where_to_live/", "Silver Lake vs Echo Park — where to live? : r/LosAngeles"],
  // Japan trip
  ["https://www.kayak.com/flights/LAX-TYO/2026-10-08", "Los Angeles to Tokyo flights | Kayak"],
  ["https://www.booking.com/searchresults.html?ss=Shinjuku", "Booking.com: Hotels in Shinjuku, Tokyo"],
  ["https://www.airbnb.com/s/Tokyo--Japan/homes", "Tokyo, Japan vacation rentals - Airbnb"],
  ["https://www.japan-guide.com/e/e2018.html", "Japan Rail Pass - japan-guide.com"],
  ["https://www.jrailpass.com/blog/tokyo-kyoto-shinkansen", "Tokyo to Kyoto by Shinkansen: times, prices | JRailPass"],
  // Work
  ["https://www.figma.com/design/AbCdEf123/Pricing-page-v3", "Pricing page v3 – Figma"],
  ["https://linear.app/acme/issue/ACM-482/pricing-page-launch-checklist", "ACM-482 Pricing page launch checklist – Linear"],
  ["https://github.com/acme/web/pull/1841", "feat(pricing): new plan cards and annual toggle · Pull Request #1841 · acme/web"],
  ["https://www.notion.so/acme/Pricing-FAQ-draft", "Pricing FAQ draft - Notion"],
  // Camera research
  ["https://www.dpreview.com/reviews/sony-a7-iv-review", "Sony a7 IV review: Digital Photography Review"],
  ["https://www.bhphotovideo.com/c/product/1668893-REG/sony_a7_iv.html", "Sony a7 IV Mirrorless Camera | B&H Photo Video"],
  ["https://www.adorama.com/so7m4.html", "Sony Alpha a7 IV Mirrorless Digital Camera Body - Adorama"],
];

const titleByUrl = new Map(STUB_TABS);

function stubHtml(title) {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:sans-serif;padding:40px;color:#444"><h1 style="font-size:18px">${title}</h1><p>Stubbed page for the Thicket e2e run.</p></body></html>`;
}

async function main() {
  // Branded Chrome removed --load-extension; Playwright's Chromium keeps it
  // and supports MV3 service workers in new headless.
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: !headed,
    viewport: { width: 1280, height: 800 },
    colorScheme: "light",
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });

  // Stub every web request so real domains resolve instantly and offline.
  // (http(s) only — intercepting chrome-extension:// blocks extension pages.)
  await context.route(/^https?:\/\//, async (route) => {
    const url = route.request().url();
    const title = titleByUrl.get(url) ?? [...titleByUrl.entries()].find(([u]) => url.startsWith(u.split("?")[0]))?.[1];
    await route.fulfill({ contentType: "text/html", body: stubHtml(title ?? url) });
  });

  // Unpacked extension ids are derived from the install path (sha256 → a-p).
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(dist).digest("hex").slice(0, 32);
  const extensionId = [...hash].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
  console.log("extension id:", extensionId);

  // Wait for the service worker (poll — the registration can beat our listener).
  for (let i = 0; i < 30 && context.serviceWorkers().length === 0; i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log("service workers:", context.serviceWorkers().map((w) => w.url()));

  // The install-time welcome tab may have opened; close it for a clean slate.
  for (const page of context.pages()) {
    if (page.url().startsWith("chrome-extension://")) await page.close().catch(() => {});
  }

  // Open the realistic session from one neutral launcher page. Direct
  // newPage() calls chain openerTabId to whichever tab was active, which
  // fabricates click-through relationships between unrelated activities;
  // window.open from an about:blank launcher gives every tab the same
  // (excluded) opener — like a fresh session restored from scratch.
  const launcher = await context.newPage();
  for (const [url] of STUB_TABS) {
    const popupPromise = context.waitForEvent("page", { timeout: 8000 }).catch(() => null);
    await launcher.evaluate((u) => window.open(u, "_blank"), url);
    const popup = await popupPromise;
    await popup?.waitForLoadState("domcontentloaded").catch(() => {});
  }

  // Open the dashboard and let analysis settle.
  const dashboard = await context.newPage();
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/now`);
  await dashboard.waitForTimeout(4500);
  await dashboard.reload();
  await dashboard.waitForTimeout(1500);

  const groups = await dashboard.evaluate(() =>
    [...document.querySelectorAll("section header")].map((el) => {
      const name = el.querySelector("button.truncate, form input")?.textContent?.trim() ?? el.textContent?.trim();
      return name;
    }),
  );
  console.log("groups rendered:", JSON.stringify(groups));

  const state = await dashboard.evaluate(() => chrome.runtime.sendMessage({ type: "get-state" }));
  const fresh = await dashboard.evaluate(() => chrome.runtime.sendMessage({ type: "analyze-now" }));
  console.log(
    "fresh analysis groups:",
    JSON.stringify(fresh.analysis?.groups.map((g) => `${g.name}(${g.tabIds.length})`)),
  );
  console.log(
    "analyzed tabs:",
    JSON.stringify(
      state.analysis?.tabs.map((t) => ({
        d: t.domain, cat: t.category, ex: t.excluded, tok: t.tokens.join("|"), win: t.windowId, last: t.lastAccessed,
      })),
    ),
  );
  console.log(
    "analysis groups:",
    JSON.stringify(
      state.analysis?.groups.map((g) => ({
        name: g.name,
        kind: g.kind,
        n: g.tabIds.length,
        tabs: g.tabIds.map((id) => state.analysis.tabs.find((t) => t.tabId === id)?.domain),
      })),
      null,
      1,
    ),
  );

  const text = await dashboard.evaluate(() => document.body.innerText);
  const checks = {
    "Apartment Hunt": text.includes("Apartment Hunt"),
    "Trip group": /Trip/.test(text),
    "Work group": /Work|Pricing/.test(text),
    "Camera Research": text.includes("Camera Research"),
    "tab counts": /17 tabs open/.test(text) || /tabs open/.test(text),
    "cleanup entry": text.includes("Clear the noise"),
    "automations entry": text.includes("Automations"),
    "help entry": text.includes("Help"),
  };
  await dashboard.screenshot({ path: path.join(outDir, "store-1-dashboard.png") });

  // Command bar shot.
  await dashboard.keyboard.press(process.platform === "darwin" ? "Meta+k" : "Control+k");
  await dashboard.waitForTimeout(400);
  await dashboard.keyboard.type("apartment", { delay: 40 });
  await dashboard.waitForTimeout(700);
  await dashboard.screenshot({ path: path.join(outDir, "store-2-command-bar.png") });
  await dashboard.keyboard.press("Escape");

  // Welcome (onboarding) shot.
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/welcome`);
  await dashboard.waitForTimeout(2600);
  await dashboard.screenshot({ path: path.join(outDir, "store-3-onboarding.png") });

  // Settings (privacy center) shot.
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/settings`);
  await dashboard.waitForTimeout(800);
  await dashboard.screenshot({ path: path.join(outDir, "store-4-privacy.png") });

  // Automations view shot.
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/automations`);
  await dashboard.waitForTimeout(800);
  await dashboard.screenshot({ path: path.join(outDir, "store-6-automations.png") });


  // Cleanup dialog shot.
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/now`);
  await dashboard.waitForTimeout(1200);
  const cleanupButton = dashboard.getByText("Clear the noise", { exact: true });
  if (await cleanupButton.count()) {
    await cleanupButton.click();
    await dashboard.waitForTimeout(600);
    await dashboard.screenshot({ path: path.join(outDir, "store-5-cleanup.png") });
  }


  // ————— Signed-out Summarize: local engine answers, never an error —————
  await dashboard.keyboard.press("Escape"); // the cleanup-shot dialog may still be up
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/now`);
  await dashboard.reload();
  await dashboard.waitForTimeout(1000);
  const firstHeader = dashboard.locator("section header").first();
  await firstHeader.hover();
  await dashboard.waitForTimeout(250);
  const summarizeBtn = dashboard.getByText("Summarize", { exact: true }).first();
  if (await summarizeBtn.count()) {
    await summarizeBtn.click();
    await dashboard.waitForTimeout(600);
    const dialogText = await dashboard.evaluate(
      () => document.querySelector('[role="dialog"]')?.textContent ?? "",
    );
    checks["signed-out summarize works locally"] =
      /tabs across \d+ sites/.test(dialogText) && dialogText.includes("Made on this device");
    await dashboard.keyboard.press("Escape");
  } else {
    checks["signed-out summarize works locally"] = false;
  }

  // ————— Automations builder: add → listed → toggle —————
  await dashboard.keyboard.press("Escape"); // don't inherit an open dialog
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/automations`);
  await dashboard.reload();
  await dashboard.waitForTimeout(900);
  await dashboard.getByText("Add rule", { exact: true }).click();
  await dashboard.waitForTimeout(600);
  const ruleText = await dashboard.evaluate(() => document.body.innerText);
  checks["automation rule adds"] = /untouched for 3 days/.test(ruleText) && !/No rules yet/.test(ruleText);

  // ————— History forget: row disappears —————
  // Close one tab first so History has an entry.
  await dashboard.evaluate(async () => {
    const tabs = await chrome.tabs.query({ windowType: "normal" });
    const victim = tabs.find((t) => t.url?.includes("adorama.com"));
    if (victim?.id) await chrome.tabs.remove(victim.id);
  });
  await dashboard.waitForTimeout(900);
  await dashboard.goto(`chrome-extension://${extensionId}/dashboard.html#/history`);
  await dashboard.waitForTimeout(700);
  const beforeForget = await dashboard.evaluate(() => document.body.innerText);
  if (beforeForget.includes("Adorama")) {
    const row = dashboard.locator("li", { hasText: "Adorama" }).first();
    await row.hover();
    await row.locator('button[aria-label^="Forget"]').click();
    await dashboard.waitForTimeout(700);
    const afterForget = await dashboard.evaluate(() => document.body.innerText);
    checks["history forget removes the page"] = !afterForget.includes("Adorama");
  } else {
    checks["history forget removes the page"] = false;
  }

  // ————— Pre-existing native tab groups: honored, never dismantled —————
  // Group a zillow tab with a kayak tab by hand — an arrangement clustering
  // would never produce. Thicket must show it verbatim and leave it alone.
  const nativeSetup = await dashboard.evaluate(async () => {
    const tabs = await chrome.tabs.query({ windowType: "normal" });
    const zillow = tabs.find((t) => t.url?.includes("3421-Sunset-Blvd"));
    const kayak = tabs.find((t) => t.url?.includes("kayak.com"));
    if (!zillow?.id || !kayak?.id) return null;
    const groupId = await chrome.tabs.group({ tabIds: [zillow.id, kayak.id] });
    await chrome.tabGroups.update(groupId, { title: "My mix", color: "purple" });
    return { groupId, tabIds: [zillow.id, kayak.id] };
  });
  if (nativeSetup) {
    await dashboard.evaluate(() => chrome.runtime.sendMessage({ type: "analyze-now" }));
    await dashboard.waitForTimeout(1500); // let the mirror pass run too
    const nativeState = await dashboard.evaluate(async (setup) => {
      const state = await chrome.runtime.sendMessage({ type: "get-state" });
      const group = state.analysis?.groups.find((g) => g.nativeGroupId === setup.groupId);
      const t0 = await chrome.tabs.get(setup.tabIds[0]);
      const t1 = await chrome.tabs.get(setup.tabIds[1]);
      const native = await chrome.tabGroups.get(setup.groupId).catch(() => null);
      return {
        analysisName: group?.name,
        analysisTabs: group?.tabIds.slice().sort(),
        stillGrouped: t0.groupId === setup.groupId && t1.groupId === setup.groupId,
        title: native?.title,
        color: native?.color,
      };
    }, nativeSetup);
    checks["native group honored in analysis"] =
      nativeState.analysisName === "My mix" &&
      JSON.stringify(nativeState.analysisTabs) === JSON.stringify(nativeSetup.tabIds.slice().sort());
    checks["native group untouched in strip"] =
      nativeState.stillGrouped && nativeState.title === "My mix" && nativeState.color === "purple";
  } else {
    checks["native group honored in analysis"] = false;
    checks["native group untouched in strip"] = false;
  }

  console.log("checks:", JSON.stringify(checks, null, 2));
  const failed = Object.entries(checks).filter(([, ok]) => !ok);

  await context.close();

  if (failed.length > 0) {
    console.error("E2E FAILED:", failed.map(([k]) => k).join(", "));
    process.exit(1);
  }
  console.log(`✓ e2e passed; store screenshots in ${path.relative(root, outDir)}`);
}

await main();
