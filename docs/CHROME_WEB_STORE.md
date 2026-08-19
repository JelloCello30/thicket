# Chrome Web Store — submission kit

Everything needed to publish. The extension is **not yet published**; this is the
prepared listing. Manual steps are marked ⚠️.

## Package

`pnpm --filter @thicket/extension build` produces
`apps/extension/release/thicket-0.1.0.zip` — upload that file.

⚠️ Requires a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole)
($5 one-time fee) and a human to click through the submission.

## Listing copy

**Name:** Thicket — Your tabs, organized

**Summary (132 chars max):**
> Groups your open tabs by what you're actually doing, and remembers them when you close everything. Runs entirely on your device.

**Description:**

> Your browser shows 47 tabs. You're actually doing four things.
>
> Thicket groups your open tabs by the real activity behind them — the apartment hunt, the trip you're planning, the launch you're shipping — automatically, on your device, within seconds of installing. No folders to create, no dragging, no naming.
>
> WHAT IT DOES
> • Groups tabs into named projects, automatically (and mirrors them as native tab groups)
> • Saves any group as a workspace that survives closing every tab
> • One-click cleanup of duplicates, empty tabs, and things you're done with — always shown before anything closes, always undoable
> • Remembers pages you've had open, so "that apartment with the rooftop" is findable next week
> • ⌘K command bar: find anything, close what you don't need, bring back yesterday's research
> • Automations: "when a group is untouched for 3 days, save it and close its tabs" — every automated close is undoable
>
> • Summaries and side-by-side comparisons of what's in a group, built from your own tabs
>
> PRIVACY, PLAINLY
> Everything above runs on your computer. There is no account, no sign-up, and no server — nothing to upload your browsing to, because there is nowhere to upload it. Incognito is never observed. Banking and healthcare sites are excluded automatically, and you can exclude any site yourself. Page content is only read if you switch that on, and Chrome asks separately when you do. Delete your history from inside the extension whenever you want.
>
> Free, and free of the usual catch.

**Category:** Productivity → Tools
**Language:** English

## Privacy tab (Data Usage disclosures)

⚠️ In the developer console, declare:

- **Single purpose:** Organizes the user's browser tabs into groups and remembers them.
- **Data collected:** NONE. This version has no account and no server; tab titles and
  URLs never leave the user's machine. Answer "no" to every data-collection category,
  and check the three certification boxes (no unrelated sale, no unrelated transfer, no
  creditworthiness use) — all truthful for a fully local extension.
- **Permissions justification:**
  - `tabs` — reading open tab titles/URLs is the core function (grouping).
  - `tabGroups` — mirrors Thicket's groups as native Chrome tab groups.
  - `storage` + `unlimitedStorage` — groups, workspaces, and page memory live locally.
  - `alarms` — periodic sync flush and daily retention cleanup.
  - `favicon` — shows site favicons in the dashboard via Chrome's favicon service.
  - `scripting` + optional `<all_urls>` — **optional feature**: only when the user
    enables "Page content" does the extension read visible page text to improve
    summaries/comparisons; requested at that moment, revocable.
- **Remote code:** none. **Privacy policy URL:** https://jellocello30.github.io/thicket/privacy

## Assets

| Asset | Requirement | Status |
|---|---|---|
| Icon 128×128 | PNG | ✅ `apps/extension/public/icons/icon-128.png` |
| Screenshots (1–5) | 1280×800 PNG | ✅ `apps/extension/release/screenshots/store-*.png` — real captures from the e2e run (dashboard, command bar, onboarding, privacy, cleanup, automations); pick the best five |
| Small promo tile 440×280 | optional | ⚠️ generate if desired (`scripts/og-template.html` can be adapted) |
| Marquee 1400×560 | optional | ⚠️ same |

Screenshots regenerate any time with `node scripts/extension-e2e.mjs` — they are real
product captures, not mockups.

## Submission steps

1. ⚠️ Create/log into the developer account; pay the $5 fee if new.
2. ⚠️ Upload `thicket-0.1.0.zip`, paste the listing copy, upload screenshots + icon.
3. ⚠️ Complete the privacy disclosures above; submit for review (typically 1–3 days;
   the optional `<all_urls>` host permission may trigger a longer review — the
   justification above is written for it).
4. After approval: copy the extension ID into `THICKET_EXTENSION_IDS` (Vercel) and
   `chromeStoreUrl` in `packages/config/src/brand.ts`; redeploy the web app.
