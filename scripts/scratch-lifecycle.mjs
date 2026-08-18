/**
 * Scratch audit harness — WORKSPACES / HISTORY / AUTOMATIONS lifecycle.
 * Derived from scripts/extension-e2e.mjs. Deleted when the audit ends.
 */
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, "apps/extension/dist");
const outDir = "/tmp/lifecycle";
mkdirSync(outDir, { recursive: true });

const headed = process.argv.includes("--headed");
const PHASE = process.argv.find((a) => a.startsWith("--phase="))?.split("=")[1] ?? "1";

const STUB_TABS = [
  ["https://www.zillow.com/homedetails/3421-Sunset-Blvd/20501234_zpid/", "3421 Sunset Blvd, Los Angeles, CA 90026 | Zillow"],
  ["https://www.zillow.com/homedetails/1745-Micheltorena-St/20514567_zpid/", "1745 Micheltorena St, Los Angeles, CA 90026 - 2 bd | Zillow"],
  ["https://www.apartments.com/echo-park-los-angeles-ca/2-bedrooms/", "2 Bedroom Apartments for Rent in Echo Park, Los Angeles, CA - Apartments.com"],
  ["https://www.nerdwallet.com/mortgages/rent-calculator", "Rent Calculator: How Much Rent Can I Afford? - NerdWallet"],
  ["https://www.reddit.com/r/LosAngeles/comments/1abcde/silver_lake_vs_echo_park_where_to_live/", "Silver Lake vs Echo Park — where to live? : r/LosAngeles"],
  ["https://www.kayak.com/flights/LAX-TYO/2026-10-08", "Los Angeles to Tokyo flights | Kayak"],
  ["https://www.booking.com/searchresults.html?ss=Shinjuku", "Booking.com: Hotels in Shinjuku, Tokyo"],
  ["https://www.airbnb.com/s/Tokyo--Japan/homes", "Tokyo, Japan vacation rentals - Airbnb"],
  ["https://www.japan-guide.com/e/e2018.html", "Japan Rail Pass - japan-guide.com"],
  ["https://www.jrailpass.com/blog/tokyo-kyoto-shinkansen", "Tokyo to Kyoto by Shinkansen: times, prices | JRailPass"],
  ["https://www.figma.com/design/AbCdEf123/Pricing-page-v3", "Pricing page v3 – Figma"],
  ["https://linear.app/acme/issue/ACM-482/pricing-page-launch-checklist", "ACM-482 Pricing page launch checklist – Linear"],
  ["https://github.com/acme/web/pull/1841", "feat(pricing): new plan cards and annual toggle · Pull Request #1841 · acme/web"],
  ["https://www.notion.so/acme/Pricing-FAQ-draft", "Pricing FAQ draft - Notion"],
  ["https://www.dpreview.com/reviews/sony-a7-iv-review", "Sony a7 IV review: Digital Photography Review"],
  ["https://www.bhphotovideo.com/c/product/1668893-REG/sony_a7_iv.html", "Sony a7 IV Mirrorless Camera | B&H Photo Video"],
  ["https://www.adorama.com/so7m4.html", "Sony Alpha a7 IV Mirrorless Digital Camera Body - Adorama"],
];

const titleByUrl = new Map(STUB_TABS);
const stubHtml = (title) =>
  `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head><body style="font-family:sans-serif;padding:40px;color:#444"><h1 style="font-size:18px">${title}</h1></body></html>`;

const log = (...a) => console.log(...a);

async function boot() {
  const context = await chromium.launchPersistentContext("", {
    channel: "chromium",
    headless: !headed,
    viewport: { width: 1280, height: 800 },
    colorScheme: "light",
    args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
  });
  await context.route(/^https?:\/\//, async (route) => {
    const url = route.request().url();
    const title =
      titleByUrl.get(url) ?? [...titleByUrl.entries()].find(([u]) => url.startsWith(u.split("?")[0]))?.[1];
    await route.fulfill({ contentType: "text/html", body: stubHtml(title ?? url) });
  });
  const { createHash } = await import("node:crypto");
  const hash = createHash("sha256").update(dist).digest("hex").slice(0, 32);
  const extensionId = [...hash].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join("");
  for (let i = 0; i < 30 && context.serviceWorkers().length === 0; i++) {
    await new Promise((r) => setTimeout(r, 500));
  }
  for (const page of context.pages()) {
    if (page.url().startsWith("chrome-extension://")) await page.close().catch(() => {});
  }
  return { context, extensionId };
}

async function openSession(context, urls) {
  const launcher = await context.newPage();
  for (const url of urls) {
    const popupPromise = context.waitForEvent("page", { timeout: 8000 }).catch(() => null);
    await launcher.evaluate((u) => window.open(u, "_blank"), url);
    const popup = await popupPromise;
    await popup?.waitForLoadState("domcontentloaded").catch(() => {});
  }
}

const shot = (page, name) => page.screenshot({ path: path.join(outDir, `${name}.png`) });

async function groupsNow(page) {
  return page.evaluate(async () => {
    const s = await chrome.runtime.sendMessage({ type: "get-state" });
    return (s.analysis?.groups ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      n: g.tabIds.length,
      saved: g.savedWorkspaceId ?? null,
      native: g.nativeGroupId ?? null,
    }));
  });
}

// ─────────────────────────────── PHASE 1 ───────────────────────────────
// Empty states, save a group, close it, restore it, workspace cap.
async function phase1() {
  const { context, extensionId } = await boot();
  const dash = await context.newPage();

  // Empty states, before any tabs.
  for (const view of ["workspaces", "archived", "history", "automations"]) {
    await dash.goto(`chrome-extension://${extensionId}/dashboard.html#/${view}`);
    await dash.waitForTimeout(900);
    await shot(dash, `p1-empty-${view}`);
    log(`EMPTY ${view}:`, JSON.stringify(await dash.evaluate(() => document.body.innerText)));
  }

  await openSession(context, STUB_TABS.map(([u]) => u));
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html#/now`);
  await dash.waitForTimeout(4500);
  await dash.reload();
  await dash.waitForTimeout(1500);
  log("groups:", JSON.stringify(await groupsNow(dash), null, 1));
  await shot(dash, "p1-now");

  // Save the first group.
  const header = dash.locator("section header").first();
  await header.hover();
  await dash.waitForTimeout(200);
  await header.getByText("Save", { exact: true }).click();
  await dash.waitForTimeout(900);
  await shot(dash, "p1-after-save");
  log("after save toast:", await dash.evaluate(() => document.body.innerText.slice(0, 400)));

  // Save 3 more groups → free cap is 3, so #4 should fail.
  const g = await groupsNow(dash);
  for (let i = 1; i < Math.min(4, g.length); i++) {
    const h = dash.locator("section header").nth(i);
    await h.hover();
    await dash.waitForTimeout(200);
    const btn = h.getByText("Save", { exact: true });
    if (await btn.count()) await btn.click();
    await dash.waitForTimeout(800);
    await shot(dash, `p1-save-${i + 1}`);
    log(
      `save #${i + 1} toast:`,
      await dash.evaluate(() =>
        [...document.querySelectorAll("[role='status'],[role='alert'],.fixed")].map((e) => e.textContent).join(" | "),
      ),
    );
  }
  await shot(dash, "p1-save-4th-toast");
  const wsCount = await dash.evaluate(async () => {
    const s = await chrome.runtime.sendMessage({ type: "get-state" });
    return s.workspaces.length;
  });
  log("workspaces saved:", wsCount);

  // Workspaces list.
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html#/workspaces`);
  await dash.waitForTimeout(900);
  await shot(dash, "p1-workspaces");

  // Hover a row so the actions show.
  const row = dash.locator("li").first();
  await row.hover();
  await dash.waitForTimeout(300);
  await shot(dash, "p1-workspaces-hover");

  // Expand a row.
  await dash.locator("li button").first().click();
  await dash.waitForTimeout(400);
  await shot(dash, "p1-workspaces-expanded");

  await context.close();
}

// ─────────────────────────────── PHASE 2 ───────────────────────────────
// Close a saved group, then restore the workspace. Does it come back
// into its original group?
async function phase2() {
  const { context, extensionId } = await boot();
  await openSession(context, STUB_TABS.map(([u]) => u));
  const dash = await context.newPage();
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html#/now`);
  await dash.waitForTimeout(4500);
  await dash.reload();
  await dash.waitForTimeout(1500);
  const before = await groupsNow(dash);
  log("BEFORE:", JSON.stringify(before, null, 1));

  // Pick the first non-catch-all group and "Close all" (which saves first).
  const header = dash.locator("section header").first();
  await header.hover();
  await dash.waitForTimeout(200);
  const closeLabel = (await header.getByText("Close all", { exact: true }).count())
    ? "Close all"
    : "Archive all";
  log("close button label:", closeLabel);
  await header.getByText(closeLabel, { exact: true }).click();
  await dash.waitForTimeout(1200);
  await shot(dash, "p2-after-close-toast");
  log("toast:", await dash.evaluate(() => document.body.innerText.slice(0, 300)));

  const afterClose = await groupsNow(dash);
  log("AFTER CLOSE:", JSON.stringify(afterClose, null, 1));
  const wsList = await dash.evaluate(async () => {
    const s = await chrome.runtime.sendMessage({ type: "get-state" });
    return s.workspaces.map((w) => ({ id: w.id, title: w.title, tabs: w.tabs.length, origin: w.originGroupId }));
  });
  log("workspaces:", JSON.stringify(wsList));

  // Restore it.
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html#/workspaces`);
  await dash.waitForTimeout(800);
  await shot(dash, "p2-workspaces-before-restore");
  await dash.getByText("Restore", { exact: true }).first().click();
  await dash.waitForTimeout(3000);
  await shot(dash, "p2-after-restore");

  // Wait for a re-analysis and inspect.
  await dash.evaluate(() => chrome.runtime.sendMessage({ type: "analyze-now" }));
  await dash.waitForTimeout(2500);
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html#/now`);
  await dash.reload();
  await dash.waitForTimeout(2000);
  const after = await groupsNow(dash);
  log("AFTER RESTORE:", JSON.stringify(after, null, 1));
  await shot(dash, "p2-now-after-restore");

  // Chrome-native group state for the restored tabs.
  const native = await dash.evaluate(async () => {
    const tabs = await chrome.tabs.query({ windowType: "normal" });
    const groups = await chrome.tabGroups.query({});
    return {
      groups: groups.map((g) => ({ id: g.id, title: g.title, color: g.color })),
      tabs: tabs.map((t) => ({ url: t.url?.slice(0, 60), groupId: t.groupId })),
    };
  });
  log("NATIVE:", JSON.stringify(native, null, 1));

  await context.close();
}

// ─────────────────────────────── PHASE 3 ───────────────────────────────
// History: reopen, forget (undo?), clear (confirm?).
async function phase3() {
  const { context, extensionId } = await boot();
  await openSession(context, STUB_TABS.map(([u]) => u));
  const dash = await context.newPage();
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html#/now`);
  await dash.waitForTimeout(4500);
  await dash.reload();
  await dash.waitForTimeout(1500);

  // Close a group so History has a batch + records.
  const header = dash.locator("section header").first();
  await header.hover();
  await dash.waitForTimeout(200);
  const label = (await header.getByText("Close all", { exact: true }).count()) ? "Close all" : "Archive all";
  await header.getByText(label, { exact: true }).click();
  await dash.waitForTimeout(1500);

  // Also close a couple of individual tabs by hand (⌘W equivalent).
  await dash.evaluate(async () => {
    const tabs = await chrome.tabs.query({ windowType: "normal" });
    for (const t of tabs.filter((x) => x.url?.includes("adorama") || x.url?.includes("notion"))) {
      if (t.id) await chrome.tabs.remove(t.id);
    }
  });
  await dash.waitForTimeout(1500);

  await dash.goto(`chrome-extension://${extensionId}/dashboard.html#/history`);
  await dash.waitForTimeout(1200);
  await shot(dash, "p3-history");
  log("HISTORY TEXT:", await dash.evaluate(() => document.body.innerText));

  // Hover a row to reveal the forget affordance.
  const row = dash.locator("section:last-of-type li").first();
  await row.hover();
  await dash.waitForTimeout(300);
  await shot(dash, "p3-history-row-hover");

  // Forget the first row — is there any undo?
  const firstTitle = await row.innerText();
  const forget = row.locator('button[aria-label^="Forget"]');
  log("forget button count:", await forget.count());
  await forget.click();
  await dash.waitForTimeout(900);
  await shot(dash, "p3-after-forget");
  log("after forget:", await dash.evaluate(() => document.body.innerText.slice(0, 700)));
  log("forgot:", JSON.stringify(firstTitle));

  // Clear history — confirm step.
  await dash.getByText("Clear history…", { exact: true }).click();
  await dash.waitForTimeout(400);
  await shot(dash, "p3-clear-confirm");
  log("confirm text:", await dash.evaluate(() => document.body.innerText.slice(0, 500)));
  await dash.getByText("Clear everything", { exact: true }).click();
  await dash.waitForTimeout(1200);
  await shot(dash, "p3-after-clear");
  log("after clear:", await dash.evaluate(() => document.body.innerText.slice(0, 500)));

  await context.close();
}

// ─────────────────────────────── PHASE 4 ───────────────────────────────
// Automations: add, toggle, delete, activity log + undo.
async function phase4() {
  const { context, extensionId } = await boot();
  await openSession(context, STUB_TABS.map(([u]) => u));
  const dash = await context.newPage();
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html#/now`);
  await dash.waitForTimeout(4500);
  await dash.reload();
  await dash.waitForTimeout(1200);

  await dash.goto(`chrome-extension://${extensionId}/dashboard.html#/automations`);
  await dash.waitForTimeout(900);
  await shot(dash, "p4-automations-empty");

  // Add rule #1 (default: group untouched 3 days).
  await dash.getByText("Add rule", { exact: true }).click();
  await dash.waitForTimeout(700);
  await shot(dash, "p4-rule-1");
  log("after add 1:", await dash.evaluate(() => document.body.innerText));

  // Add the SAME rule again — duplicate handling?
  await dash.getByText("Add rule", { exact: true }).click();
  await dash.waitForTimeout(700);
  await shot(dash, "p4-rule-1-dupe");
  log("after dupe add:", await dash.evaluate(() => document.body.innerText));

  // Add a duplicates rule, which should actually fire on our session.
  await dash.selectOption('select[aria-label="Condition"]', "duplicates-exist");
  await dash.waitForTimeout(300);
  await shot(dash, "p4-builder-duplicates");
  await dash.getByText("Add rule", { exact: true }).click();
  await dash.waitForTimeout(700);

  // Add a tab-count rule with a threshold the session can't hit → shows how
  // a rule that will never fire is presented.
  await dash.selectOption('select[aria-label="Condition"]', "tab-count-over");
  await dash.waitForTimeout(300);
  await shot(dash, "p4-builder-count");
  await dash.getByText("Add rule", { exact: true }).click();
  await dash.waitForTimeout(700);
  await shot(dash, "p4-rules-list");
  log("rules:", JSON.stringify(await dash.evaluate(async () => {
    const s = await chrome.runtime.sendMessage({ type: "get-state" });
    return s.rules;
  }), null, 1));

  // Toggle the first rule off.
  await dash.locator('button[role="switch"], [role="switch"]').first().click();
  await dash.waitForTimeout(600);
  await shot(dash, "p4-rule-toggled-off");
  log("rules after toggle:", JSON.stringify(await dash.evaluate(async () => {
    const s = await chrome.runtime.sendMessage({ type: "get-state" });
    return s.rules.map((r) => ({ id: r.id, enabled: r.enabled, runs: r.runsCount }));
  })));

  // Open duplicate tabs so the duplicates rule has something to do.
  await openSession(context, [
    "https://www.zillow.com/homedetails/3421-Sunset-Blvd/20501234_zpid/",
    "https://www.zillow.com/homedetails/3421-Sunset-Blvd/20501234_zpid/",
    "https://www.kayak.com/flights/LAX-TYO/2026-10-08",
  ]);
  await dash.bringToFront();
  await dash.evaluate(() => chrome.runtime.sendMessage({ type: "analyze-now" }));
  await dash.waitForTimeout(3000);
  await dash.reload();
  await dash.waitForTimeout(1200);
  await shot(dash, "p4-after-rule-run");
  log("automations after run:", await dash.evaluate(() => document.body.innerText));
  log("activity:", JSON.stringify(await dash.evaluate(async () => {
    const s = await chrome.runtime.sendMessage({ type: "get-state" });
    return { activity: s.ruleActivity, rules: s.rules.map((r) => ({ enabled: r.enabled, runs: r.runsCount })) };
  }), null, 1));

  // Delete a rule — confirm? undo?
  const beforeDelete = await dash.evaluate(() => document.body.innerText);
  const ruleRow = dash.locator("ul > li", { hasText: "untouched" }).first();
  await ruleRow.hover();
  await dash.waitForTimeout(300);
  await shot(dash, "p4-rule-hover-delete");
  await ruleRow.getByText("Delete", { exact: true }).click();
  await dash.waitForTimeout(900);
  await shot(dash, "p4-after-rule-delete");
  log("before delete:", beforeDelete.slice(0, 600));
  log("after delete:", await dash.evaluate(() => document.body.innerText.slice(0, 600)));

  await context.close();
}

// ─────────────────────────────── PHASE 5 ───────────────────────────────
// The round-trip promise: after Restore, is the workspace still linked to
// the live group, and does the group still absorb new related tabs?
async function phase5() {
  titleByUrl.set("https://www.dpreview.com/reviews/canon-eos-r6-ii-review", "Canon EOS R6 II review: Digital Photography Review");
  titleByUrl.set("https://www.bhphotovideo.com/c/product/9999-REG/sony_a7_v.html", "Sony a7 V Mirrorless Camera | B&H Photo Video");

  const { context, extensionId } = await boot();
  await openSession(context, STUB_TABS.map(([u]) => u));
  const dash = await context.newPage();
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html#/now`);
  await dash.waitForTimeout(4500);
  await dash.reload();
  await dash.waitForTimeout(1500);

  const detail = () =>
    dash.evaluate(async () => {
      const s = await chrome.runtime.sendMessage({ type: "get-state" });
      return {
        groups: (s.analysis?.groups ?? []).map((g) => ({
          id: g.id,
          name: g.name,
          n: g.tabIds.length,
          savedWorkspaceId: g.savedWorkspaceId ?? null,
          nativeGroupId: g.nativeGroupId ?? null,
          signals: g.signals,
        })),
        workspaces: s.workspaces.map((w) => ({ id: w.id, title: w.title, tabs: w.tabs.length })),
      };
    });

  // 1. Save the Camera Research group.
  const header = dash.locator("section header", { hasText: "Camera Research" }).first();
  await header.hover();
  await dash.waitForTimeout(200);
  await header.getByText("Save", { exact: true }).click();
  await dash.waitForTimeout(1500);
  await dash.reload();
  await dash.waitForTimeout(1200);
  await shot(dash, "p5-1-saved-badge");
  log("STEP1 after save:", JSON.stringify(await detail(), null, 1));

  // 2. Close it (Close all → saves + closes).
  const h2 = dash.locator("section header", { hasText: "Camera Research" }).first();
  await h2.hover();
  await dash.waitForTimeout(200);
  await h2.getByText(/Close all|Archive all/).first().click();
  await dash.waitForTimeout(3500);

  // 3. Restore.
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html#/workspaces`);
  await dash.waitForTimeout(800);
  await dash.getByText("Restore", { exact: true }).first().click();
  await dash.waitForTimeout(4000);
  await dash.evaluate(() => chrome.runtime.sendMessage({ type: "analyze-now" }));
  await dash.waitForTimeout(3000);
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html#/now`);
  await dash.reload();
  await dash.waitForTimeout(2500);
  await shot(dash, "p5-2-after-restore");
  log("STEP3 after restore:", JSON.stringify(await detail(), null, 1));

  // 4. Open two MORE camera tabs — do they join the restored group?
  await openSession(context, [
    "https://www.dpreview.com/reviews/canon-eos-r6-ii-review",
    "https://www.bhphotovideo.com/c/product/9999-REG/sony_a7_v.html",
  ]);
  await dash.bringToFront();
  await dash.evaluate(() => chrome.runtime.sendMessage({ type: "analyze-now" }));
  await dash.waitForTimeout(3500);
  await dash.reload();
  await dash.waitForTimeout(2000);
  await shot(dash, "p5-3-new-camera-tabs");
  log("STEP4 new related tabs:", JSON.stringify(await detail(), null, 1));

  // 5. Click Save again on the restored group — duplicate workspace?
  const h3 = dash.locator("section header", { hasText: "Camera Research" }).first();
  await h3.hover();
  await dash.waitForTimeout(250);
  const saveBtn = h3.getByText(/^(Save|Update save)$/).first();
  log("save button label:", (await saveBtn.count()) ? await saveBtn.innerText() : "NONE");
  if (await saveBtn.count()) {
    await saveBtn.click();
    await dash.waitForTimeout(1500);
  }
  await shot(dash, "p5-4-after-second-save");
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html#/workspaces`);
  await dash.waitForTimeout(1000);
  await shot(dash, "p5-5-workspaces-after");
  log("STEP5 workspaces:", JSON.stringify((await detail()).workspaces, null, 1));

  await context.close();
}

// ─────────────────────────────── PHASE 6 ───────────────────────────────
// Narrow probe: does saving a group ever mark it "saved" in the UI?
async function phase6() {
  const { context, extensionId } = await boot();
  await openSession(context, STUB_TABS.map(([u]) => u));
  const dash = await context.newPage();
  await dash.goto(`chrome-extension://${extensionId}/dashboard.html#/now`);
  await dash.waitForTimeout(4500);
  await dash.reload();
  await dash.waitForTimeout(1500);

  const probe = () =>
    dash.evaluate(async () => {
      const s = await chrome.runtime.sendMessage({ type: "get-state" });
      const local = await chrome.storage.local.get(["workspaces", "groupMemory"]);
      return {
        groupIds: (s.analysis?.groups ?? []).map((g) => `${g.name}=${g.id}/saved:${g.savedWorkspaceId ?? "-"}`),
        wsOrigins: (local.workspaces ?? []).map((w) => `${w.title}=${w.id}/origin:${w.originGroupId}`),
        memory: (local.groupMemory ?? []).map((g) => `${g.name}=${g.id}/saved:${g.savedWorkspaceId ?? "-"}`),
      };
    });

  const header = dash.locator("section header", { hasText: "Camera Research" }).first();
  await header.hover();
  await dash.waitForTimeout(200);
  await header.getByText("Save", { exact: true }).click();
  await dash.waitForTimeout(1200);
  log("IMMEDIATELY AFTER SAVE:", JSON.stringify(await probe(), null, 1));

  await dash.evaluate(() => chrome.runtime.sendMessage({ type: "analyze-now" }));
  await dash.waitForTimeout(2500);
  log("AFTER FORCED ANALYSIS:", JSON.stringify(await probe(), null, 1));

  await dash.reload();
  await dash.waitForTimeout(2000);
  log("AFTER RELOAD:", JSON.stringify(await probe(), null, 1));
  await shot(dash, "p6-saved-badge-check");
  const camHeader = await dash.locator("section header", { hasText: "Camera Research" }).first().innerText();
  log("HEADER TEXT:", JSON.stringify(camHeader));
  await dash.locator("section header", { hasText: "Camera Research" }).first().hover();
  await dash.waitForTimeout(300);
  log("HEADER TEXT hovered:", JSON.stringify(
    await dash.locator("section header", { hasText: "Camera Research" }).first().innerText(),
  ));
  await shot(dash, "p6-header-hovered");

  await context.close();
}

const phases = { 1: phase1, 2: phase2, 3: phase3, 4: phase4, 5: phase5, 6: phase6 };
await phases[PHASE]();
log(`✓ phase ${PHASE} done → ${outDir}`);
