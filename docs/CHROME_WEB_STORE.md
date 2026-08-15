# Chrome Web Store — submission kit

Everything needed to publish. The extension is **not yet published**; this is the
prepared listing. Manual steps are marked ⚠️.

## Package

`pnpm --filter @tabmind/extension build` produces
`apps/extension/release/tabmind-0.1.0.zip` — upload that file.

⚠️ Requires a [Chrome Web Store developer account](https://chrome.google.com/webstore/devconsole)
($5 one-time fee) and a human to click through the submission.

## Listing copy

**Name:** TabMind — Your tabs, organized

**Summary (132 chars max):**
> TabMind understands why your tabs are open, groups them into projects, and remembers them when you close everything.

**Description:**

> Your browser shows 47 tabs. You're actually doing four things.
>
> TabMind groups your open tabs by the real activity behind them — the apartment hunt, the trip you're planning, the launch you're shipping — automatically, on your device, within seconds of installing. No folders to create, no dragging, no naming.
>
> WHAT IT DOES
> • Groups tabs into named projects, automatically (and mirrors them as native tab groups)
> • Saves any group as a workspace that survives closing every tab
> • One-click cleanup of duplicates, empty tabs, and things you're done with — always shown before anything closes, always undoable
> • Remembers pages you've had open, so "that apartment with the rooftop" is findable next week
> • ⌘K command bar: find anything, close what you don't need, bring back yesterday's research
> • Focus mode: type your task, and TabMind quietly intercepts rabbit holes until you're done — overridable in one click, fully on-device
> • Automations: "when a group is untouched for 3 days, save it and close its tabs" — every automated close is undoable
>
> WITH A FREE ACCOUNT
> • Workspaces sync across devices
> • AI names your groups and adds short insights (titles and addresses only)
>
> WITH PRO ($8/MONTH)
> • Unlimited workspaces and 90-day memory
> • AI search across everything you've closed
> • Group summaries and side-by-side comparisons (cameras, apartments, flights…)
>
> PRIVACY, HONESTLY
> Organization runs locally. Signed out, nothing leaves your browser. Incognito is never observed. Banking and healthcare sites are excluded automatically, and you can exclude any site. Page content is only read if you turn that on — it's a separate switch with its own permission prompt. Export or delete everything, for real, any time.

**Category:** Productivity → Tools
**Language:** English

## Privacy tab (Data Usage disclosures)

⚠️ In the developer console, declare:

- **Single purpose:** Organizes the user's browser tabs into groups and remembers them.
- **Data collected:** *Web history* (page titles/URLs of open tabs — only when the user
  signs in and enables sync; used for app functionality, not sold, not for ads, not for
  creditworthiness). *User activity:* no. *Personal communications:* no.
- **Permissions justification:**
  - `tabs` — reading open tab titles/URLs is the core function (grouping).
  - `tabGroups` — mirrors TabMind's groups as native Chrome tab groups.
  - `storage` + `unlimitedStorage` — groups, workspaces, and page memory live locally.
  - `alarms` — periodic sync flush and daily retention cleanup.
  - `favicon` — shows site favicons in the dashboard via Chrome's favicon service.
  - `scripting` + optional `<all_urls>` — **optional feature**: only when the user
    enables "Page content" does the extension read visible page text to improve
    summaries/comparisons; requested at that moment, revocable.
- **Remote code:** none. **Privacy policy URL:** https://tabmind.app/privacy

## Assets

| Asset | Requirement | Status |
|---|---|---|
| Icon 128×128 | PNG | ✅ `apps/extension/public/icons/icon-128.png` |
| Screenshots (1–5) | 1280×800 PNG | ✅ `apps/extension/release/screenshots/store-*.png` — real captures from the e2e run (dashboard, command bar, onboarding, privacy, cleanup, automations, focus); pick the best five |
| Small promo tile 440×280 | optional | ⚠️ generate if desired (`scripts/og-template.html` can be adapted) |
| Marquee 1400×560 | optional | ⚠️ same |

Screenshots regenerate any time with `node scripts/extension-e2e.mjs` — they are real
product captures, not mockups.

## Submission steps

1. ⚠️ Create/log into the developer account; pay the $5 fee if new.
2. ⚠️ Upload `tabmind-0.1.0.zip`, paste the listing copy, upload screenshots + icon.
3. ⚠️ Complete the privacy disclosures above; submit for review (typically 1–3 days;
   the optional `<all_urls>` host permission may trigger a longer review — the
   justification above is written for it).
4. After approval: copy the extension ID into `TABMIND_EXTENSION_IDS` (Vercel) and
   `chromeStoreUrl` in `packages/config/src/brand.ts`; redeploy the web app.
