# Chrome Web Store — submission checklist

Follow this top to bottom with the developer dashboard open in another window.
Every value below is final: paste it exactly as written. Nothing here is a
placeholder, and nothing needs a decision made at the keyboard.

Steps marked **⚠️ you** are the ones only the account owner can do — pay, upload,
click submit. Everything else is copy-paste.

Verified against the code and the built artifact on 2026-08-20, extension
version 0.1.0.

---

## 0. Before you open the dashboard

**Build the package.**

```
pnpm --filter @thicket/extension build
```

Produces `apps/extension/release/thicket-0.1.0.zip`. The build refuses to
produce a zip unless the artifact matches what this document claims — no
`fetch()`, no `/api/` endpoint, no `chrome.scripting`, no host permissions, and
no permission outside the five justified below (`apps/extension/scripts/package.mjs`).
If it throws, do not hand-edit the zip; fix the code and rebuild.

**Confirm the privacy policy is live.** Open
<https://jellocello30.github.io/thicket/privacy/> in a browser. It must load
(HTTP 200) before you submit — an unreachable policy URL is an automatic
rejection. It was live and correct at the time of writing. If you changed the
privacy page in this repo, push and let the Pages workflow redeploy **before**
submitting, so the live page and the listing agree.

**⚠️ you — the account.** Sign in at
<https://chrome.google.com/webstore/devconsole> and pay the one-time $5
registration fee if this is a new developer account. Nobody else can do this.

**⚠️ you — new item.** "Add new item", then upload
`apps/extension/release/thicket-0.1.0.zip`. The rest of the form unlocks after
the upload succeeds.

---

## 1. Store listing tab

### Item name

```
Thicket — Your tabs, organized
```

30 characters. Identical to `manifest.json` `name`, so the store page and the
installed extension say the same thing.

### Summary

```
Groups your open tabs by what you're actually doing, and remembers them when you close everything. Runs on your device.
```

119 of 132 characters.

### Description

3,719 of 16,000 characters. Paste everything between the rules, exactly:

---

Thicket groups your open tabs by what you're working on, names each group, and mirrors it onto Chrome's own tab groups. Save a group, close every tab in it, and bring the whole thing back later. All of it runs on your device: no account, no sign-up, no server.

WHAT IT DOES

Organizes automatically.
Seconds after you install it, Thicket reads your open tabs and sorts them into named groups — the apartment hunt, the trip, the launch you're shipping. Nothing to create, nothing to drag, nothing to name. Each group is mirrored onto a native Chrome tab group, so the organization shows up in the tab strip itself.

Lets you correct it.
Double-click a group to rename it. Move a tab with the "Move to" picker, or drag it where it belongs. Merge two groups from the group menu, or by dropping one onto the other. Corrections stick: Thicket remembers them and stops re-splitting what you joined.

Closes tabs without losing them.
"Close all" on a group saves it as a workspace first, then closes the tabs. Restore the whole thing later from Workspaces, or archive it when you're done. Save as many workspaces as you like — there is no cap.

Clears the noise, on your terms.
One click gathers duplicates, empty tabs, pages already saved in a workspace, and tabs you're probably done with. You see the full list before anything closes, untick whatever should stay, then close the rest in one go. Pinned, active and audio-playing tabs are never touched. Every close is undoable — from the toast right after, and from the History screen later.

Finds things again.
Search across open tabs, saved workspaces, and pages Thicket has seen in the last 7 days. Keyword search, instant, and local.

Answers to a command bar.
Press ⌘K (Ctrl+K) inside Thicket to search or type a command: "close duplicates", "save trip planning", "reopen camera research", "clean up". ⌘⇧K (Ctrl+Shift+K) opens Thicket from anywhere.

Runs rules while you work.
Rules are plain sentences you assemble: "when a group is untouched for 3 days, save it and close its tabs", "when duplicate tabs appear, close the extras", "when open tabs exceed a number you choose, collapse the stale groups". Pinned, active and audio-playing tabs are never touched, and neither are tab groups you made yourself. Every automated close lands in the activity log with an Undo button.

Sums up a group.
A summary of what a group holds — how many tabs, which sites, what was touched recently, prices spotted in the titles — plus a side-by-side comparison table when you're choosing between things. Built on your device from your own tab titles, domains and activity. It never invents a detail it doesn't have.

PRIVACY

Everything Thicket knows — your groups, workspaces and page memory — is stored in this browser and nowhere else. There is no account to create and no server to sync with. The extension is built without any code that could make a network request, so nothing you browse can leave this machine.

Thicket asks for no access to any website. It cannot read the contents of a page, and private windows are never observed.

Banking, healthcare and password-manager sites are excluded automatically: never grouped, never remembered. Add any site to that list yourself, and excluding it also forgets what was already stored. Sign-in, checkout and password-reset pages are never recorded at all, and web addresses are stripped of tokens and other secret-looking parameters before anything is written down.

Page memory keeps 7 days, then deletes itself. Clear it sooner — every closed tab and everything Thicket remembers — from the History screen. Uninstalling removes all of it, permanently.

Free, with no account and nothing to buy. Requires Chrome 121 or later.

---

### Category

```
Workflow & Planning
```

One selection from a flat list. (An earlier draft of this document said
"Productivity → Tools", which is not a pair the dashboard offers.)

### Language

```
English (United States)
```

### Store icon

`apps/extension/public/icons/icon-128.png` — 128×128 PNG. ✅ verified.

### Screenshots

All six are 1280×800 PNG, captured from the real product by
`node scripts/extension-e2e.mjs`, and regenerated from this exact build. Upload
up to five, in this order:

| # | File | Shows |
|---|---|---|
| 1 | `apps/extension/release/screenshots/store-1-dashboard.png` | 20 tabs sorted into four named groups |
| 2 | `apps/extension/release/screenshots/store-2-command-bar.png` | ⌘K command bar |
| 3 | `apps/extension/release/screenshots/store-5-cleanup.png` | Cleanup preview before anything closes |
| 4 | `apps/extension/release/screenshots/store-4-privacy.png` | Settings / privacy controls |
| 5 | `apps/extension/release/screenshots/store-6-automations.png` | Automation rules |

`store-3-onboarding.png` is the spare. If you re-capture, re-check that no
screenshot shows a control the shipped build no longer has.

### Promo tiles

Optional; leave blank. A small tile (440×280) can be added later without
resubmitting for review.

### Homepage URL

```
https://jellocello30.github.io/thicket/
```

### Support URL

```
https://jellocello30.github.io/thicket/
```

Support email `nolan.h.woo@gmail.com` appears on the privacy page.

---

## 2. Privacy tab

### Single purpose description

```
Thicket organizes the browser tabs the user already has open. It reads the titles and addresses of open tabs, groups them by the activity they belong to, mirrors those groups as native Chrome tab groups, lets the user save a group as a workspace that can be reopened after the tabs are closed, and helps the user find an open or recently closed tab again. Grouping, saving, cleanup, search and the optional automation rules are all steps in that one job: keeping the tab strip organized and letting the user close tabs without losing anything.
```

### Permission justifications

The shipped manifest declares exactly five permissions and no host
permissions. There is one field per permission in the dashboard.

**tabs**

```
Organizing the user's open tabs is Thicket's entire purpose, and this permission is what lets it see them. Thicket reads the title, address, favicon, pinned state and last-active time of open tabs to cluster them into named project groups and to spot the ones the user is done with. It also activates, creates and closes tabs when the user clicks a search result, reopens a recently closed page, restores a saved workspace, or confirms a cleanup. Without this permission there is nothing to read and nothing to act on.
```

**tabGroups**

```
Thicket writes the groups it computes back into Chrome's own tab strip, so the user gets real native tab groups instead of a second list they have to keep in sync by hand. It creates, titles, colors and collapses those groups as projects change, renames one when the user renames it inside Thicket, and ungroups everything cleanly if the user switches mirroring off. It also reads existing groups so the ones the user made themselves are left exactly as they are.
```

**storage**

```
Everything Thicket knows lives on the user's own device, and chrome.storage is where it lives. Preferences, the excluded-site list, saved workspaces, recently closed tabs, learned group names and automation rules are read and written through chrome.storage.local, and the transient tab analysis is cached in chrome.storage.session so the popup and dashboard open instantly instead of recomputing. This version has no server, so without storage the user's groups and saved workspaces would vanish at every browser restart.
```

**alarms**

```
A daily alarm deletes page-memory entries older than the 7-day retention window, so the user's record of visited pages is erased automatically rather than accumulating forever. An MV3 service worker cannot hold a timer while it is suspended, so chrome.alarms is the only way to run that scheduled deletion reliably.
```

**favicon**

```
The dashboard, command bar, search results and history list show each page's site icon, so a user scanning dozens of tabs can recognize them at a glance instead of reading every title. Thicket builds chrome-extension://<id>/_favicon/ URLs to render those icons, which requires this permission. It is used precisely so Thicket does not have to call a third-party favicon service — no request describing the user's browsing leaves the machine.
```

**Host permissions:** none. The manifest declares an empty `host_permissions`
and no `optional_host_permissions`, so there is no field to fill and no
"reading your data on all sites" warning at install.

### Are you using remote code?

```
No, I am not using remote code
```

All logic is bundled in the uploaded package. No remote script tags, no `eval`
or `new Function`, no imports from remote URLs, no CDN assets — the fonts and
stylesheet ship inside the package. Verified by grep against the unpacked zip.

### Data usage — collected data categories

Answer **No** to every one of the nine categories:

| Category | Answer |
|---|---|
| Personally identifiable information | No |
| Health information | No |
| Financial and payment information | No |
| Authentication information | No |
| Personal communications | No |
| Location | No |
| Web history | No |
| User activity | No |
| Website content | No |

This is accurate and checkable from the uploaded package: it contains no
`fetch` call, no server endpoint and no host permission, so no user data is
transmitted off the device by any code path. The build gate in
`apps/extension/scripts/package.mjs` is what keeps that true for future
uploads.

If a reviewer asks for a plain-language statement, use:

```
Thicket transmits nothing. The uploaded package contains no network code at all — no fetch call and no server address — and it holds no permission to access any website. Tab titles and addresses are read in the browser, used to group tabs, and written to the browser's own local storage on the user's machine. The user can export or erase all of it from inside the extension, and uninstalling removes it.
```

### Certifications

Check all three boxes:

- ☑ I do not sell or transfer user data to third parties, apart from the
  approved use cases
- ☑ I do not use or transfer user data for purposes that are unrelated to my
  item's single purpose
- ☑ I do not use or transfer user data to determine creditworthiness or for
  lending purposes

All three are true: the package has no analytics SDK, no ad network, no
third-party host, and no scoring logic of any kind.

### Privacy policy URL

```
https://jellocello30.github.io/thicket/privacy/
```

Keep the trailing slash. The static export canonicalizes to it; the
slash-less form is a 301 redirect, and the stored URL should not depend on one.

---

## 3. Distribution tab

- **Visibility:** Public
- **Distribution:** All regions
- **Pricing:** Free
- Leave the "This item contains ads" and in-app-purchase boxes unchecked —
  both are accurate; there is no monetization in this build.

---

## 4. Submit

**⚠️ you — review the whole form once**, then click **Submit for review**.

Expect one to three days. Nothing in this submission requests a broad host
permission or a sensitive permission, which is what usually stretches a review
to weeks.

---

## 5. After approval

1. Copy the assigned extension ID into `chromeStoreUrl` in
   `packages/config/src/brand.ts`, and redeploy the site so the Install button
   points at the real listing.
2. If and when a backend is ever deployed, set `THICKET_EXTENSION_IDS=<id>` in
   the server environment (CORS + device-linking allowlist).

---

## What is deliberately not in this release

Recorded here so nobody re-adds these to the listing without re-adding the
code, or vice versa.

- **No accounts, sync, AI, or telemetry.** The extension is compiled with
  `__LOCAL_ONLY__` (`apps/extension/vite.config.ts`), which removes the entire
  HTTP client from the bundle. Summaries and comparisons still work — they are
  computed on-device from tab titles, domains and activity.
- **No `scripting` permission and no `<all_urls>`.** The "Page content"
  feature only ever fed the server summarizer, so this build does not offer
  the switch, does not ask for site access, and cannot read a page. Both
  permissions come back in the release that ships a backend — with the
  justification written then, for code that runs then.
- **No `unlimitedStorage`.** Every stored structure is capped in code (2,000
  page-memory entries, 100 recently closed, 60 remembered groups, 200 mirrored
  groups), so the default quota is not a real constraint and the permission
  would be unjustifiable.
- **No `externally_connectable`.** With no accounts there is no sign-in
  handoff to accept, and an origin shared with unrelated GitHub Pages projects
  is not a boundary worth trusting.
- **Page memory is 7 days**, for everyone, stated plainly in the listing, in
  Settings and on the privacy page. There is no longer window to upsell to.
