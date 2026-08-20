import { useState } from "react";
import type { UiState } from "../../shared/messages";
import { Button, Input, Switch } from "@thicket/ui";

/**
 * The privacy center. Every switch says what it really does; the scary
 * things (content analysis) are opt-in with the permission ask attached.
 */
export function SettingsView({
  state,
  onPref,
  onExcludeAdd,
  onExcludeRemove,
  onRequestContent,
  onLink,
  onSignOut,
  onExport,
  onWipe,
  linkBusy,
}: {
  state: UiState;
  onPref: (patch: Partial<UiState["prefs"]>) => void;
  onExcludeAdd: (domain: string) => void;
  onExcludeRemove: (domain: string) => void;
  onRequestContent: () => void;
  onLink: (code: string) => void;
  onSignOut: () => void;
  onExport: () => void;
  onWipe: () => void;
  linkBusy: boolean;
}) {
  const [domainDraft, setDomainDraft] = useState("");
  const [confirmWipe, setConfirmWipe] = useState(false);
  const [codeDraft, setCodeDraft] = useState("");
  const prefs = state.prefs;

  return (
    <div className="max-w-xl space-y-8">
      {state.capabilities.accounts ? (
        <Section title="Account">
          {state.auth ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-ink">{state.auth.user.email}</p>
                <p className="text-[0.8125rem] text-ink-secondary">
                  {state.auth.user.plan === "pro" ? "Pro plan" : "Free plan"} · syncing{" "}
                  {prefs.syncEnabled ? "on" : "off"}
                </p>
              </div>
              <span className="flex gap-2">
                {state.auth.user.plan !== "pro" ? (
                  <Button size="sm" variant="primary" onClick={() => window.open(`${state.appUrl}/pricing`, "_blank")}>
                    Upgrade
                  </Button>
                ) : (
                  <Button size="sm" onClick={() => window.open(`${state.appUrl}/app/settings`, "_blank")}>
                    Manage
                  </Button>
                )}
                <Button size="sm" variant="ghost" onClick={onSignOut}>
                  Sign out
                </Button>
              </span>
            </div>
          ) : (
            <div className="space-y-2.5">
              <p className="text-[0.8125rem] leading-snug text-ink-secondary">
                Sign in to sync workspaces across devices and unlock AI organization, summaries, and semantic
                search. Thicket works fully on-device without an account.
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={() => window.open(`${state.appUrl}/login?from=extension`, "_blank")}>
                  Sign in on jellocello30.github.io/thicket
                </Button>
              </div>
              <form
                className="flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (codeDraft.trim()) onLink(codeDraft.trim());
                }}
              >
                <Input
                  value={codeDraft}
                  onChange={(e) => setCodeDraft(e.target.value)}
                  placeholder="Or paste a connect code"
                  aria-label="Connect code"
                  className="h-8 max-w-[220px] text-[0.8125rem]"
                />
                <Button size="sm" type="submit" loading={linkBusy} disabled={!codeDraft.trim()}>
                  Connect
                </Button>
              </form>
            </div>
          )}
        </Section>
      ) : (
        <Section title="Where your tabs live">
          <p className="text-[0.8125rem] leading-relaxed text-ink-secondary">
            Everything Thicket knows — your groups, workspaces, and page memory — is stored
            in this browser and nowhere else. There is no account to create and no server to
            sync with, so nothing you browse can leave this machine.
          </p>
          <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-secondary">
            Clearing the extension's data, or uninstalling it, removes all of it for good.
          </p>
        </Section>
      )}

      <Section title="Privacy">
        <Row
          label="Pause Thicket"
          hint="Stops all observation and grouping until you resume. Your existing groups and workspaces are kept."
        >
          <Switch checked={prefs.paused} onChange={(v) => onPref({ paused: v })} aria-label="Pause Thicket" />
        </Row>
        {state.capabilities.accounts ? (
          <Row
            label="AI processing"
            hint="Send page titles and web addresses to Thicket's servers for smarter grouping, names, and search. Never page contents unless you turn that on below."
          >
            <Switch checked={prefs.aiEnabled} onChange={(v) => onPref({ aiEnabled: v })} aria-label="AI processing" />
          </Row>
        ) : null}
        {/*
          Page content only ever fed the server summarizer. This build has no
          server, asks for no host permission, and never reads a page — so the
          switch is not offered. Offering it would mean asking for access to
          every site for a feature that then does nothing.
        */}
        {state.capabilities.ai ? (
          <Row
            label="Page content"
            hint="Off by default. When on, Thicket sends an excerpt of the visible text of the pages in a group to Thicket's servers to write a sharper summary. The excerpt is not stored. Requires a browser permission."
          >
            {prefs.contentAnalysis && state.contentPermission ? (
              <Switch checked onChange={() => onPref({ contentAnalysis: false })} aria-label="Page content analysis" />
            ) : (
              <Button size="sm" onClick={onRequestContent}>
                Turn on…
              </Button>
            )}
          </Row>
        ) : null}
        <Row
          label="Remember pages"
          hint="Keep a local record of pages Thicket has seen so closed tabs stay findable. Kept for 7 days, then deleted."
        >
          <Switch checked={prefs.historyEnabled} onChange={(v) => onPref({ historyEnabled: v })} aria-label="Remember pages" />
        </Row>
        {state.capabilities.accounts ? (
          <Row label="Sync" hint="Back workspaces and history up to your account (signed in only).">
            <Switch checked={prefs.syncEnabled} onChange={(v) => onPref({ syncEnabled: v })} aria-label="Sync" />
          </Row>
        ) : null}
      </Section>

      <Section title="Excluded sites">
        <p className="mb-2 text-[0.8125rem] leading-snug text-ink-secondary">
          Pages on these sites are never grouped, never remembered, and never leave this device. Banking and
          healthcare sites are excluded automatically.
        </p>
        <form
          className="mb-2 flex items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (domainDraft.trim()) {
              onExcludeAdd(domainDraft.trim());
              setDomainDraft("");
            }
          }}
        >
          <Input
            value={domainDraft}
            onChange={(e) => setDomainDraft(e.target.value)}
            placeholder="example.com"
            aria-label="Domain to exclude"
            className="h-8 max-w-[220px] text-[0.8125rem]"
          />
          <Button size="sm" type="submit" disabled={!domainDraft.trim()}>
            Exclude
          </Button>
        </form>
        {state.excludedDomains.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {state.excludedDomains.map((domain) => (
              <li
                key={domain}
                className="flex items-center gap-1.5 rounded-full border border-edge px-2.5 py-1 text-[0.8125rem] text-ink"
              >
                {domain}
                <button
                  aria-label={`Stop excluding ${domain}`}
                  onClick={() => onExcludeRemove(domain)}
                  className="text-ink-faint hover:text-ink"
                >
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden>
                    <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Tuning">
        <Row
          label="Grouping style"
          hint="Calm makes fewer, bigger groups. Eager splits sooner into more, smaller ones."
        >
          <div className="flex gap-1">
            {(["calm", "balanced", "eager"] as const).map((style) => (
              <button
                key={style}
                onClick={() => onPref({ groupingStyle: style })}
                className={
                  prefs.groupingStyle === style
                    ? "rounded-md bg-accent-soft px-2.5 py-1 text-[0.8125rem] font-medium text-accent"
                    : "rounded-md px-2.5 py-1 text-[0.8125rem] text-ink-secondary hover:bg-sunken"
                }
              >
                {style[0]!.toUpperCase() + style.slice(1)}
              </button>
            ))}
          </div>
        </Row>
        <Row
          label="Count a tab as “probably done” after"
          hint="Drives the stale pile and cleanup suggestions."
        >
          <select
            value={prefs.staleAfterHours}
            onChange={(e) => onPref({ staleAfterHours: Number(e.target.value) })}
            className="rounded-md border border-edge-strong bg-raised px-2 py-1.5 text-[0.8125rem] text-ink"
            aria-label="Staleness window"
          >
            <option value={6}>6 hours</option>
            <option value={24}>a day</option>
            <option value={72}>3 days</option>
            <option value={168}>a week</option>
          </select>
        </Row>
      </Section>

      <Section title="Display">
        <Row label="Order groups by" hint="Leftover piles always sit at the bottom.">
          <div className="flex gap-1">
            {([["recent", "Recent"], ["size", "Size"], ["name", "Name"]] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => onPref({ groupSort: value })}
                className={
                  prefs.groupSort === value
                    ? "rounded-md bg-accent-soft px-2.5 py-1 text-[0.8125rem] font-medium text-accent"
                    : "rounded-md px-2.5 py-1 text-[0.8125rem] text-ink-secondary hover:bg-sunken"
                }
              >
                {label}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Row height" hint="">
          <div className="flex gap-1">
            {([["comfortable", "Comfortable"], ["compact", "Compact"]] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => onPref({ density: value })}
                className={
                  prefs.density === value
                    ? "rounded-md bg-accent-soft px-2.5 py-1 text-[0.8125rem] font-medium text-accent"
                    : "rounded-md px-2.5 py-1 text-[0.8125rem] text-ink-secondary hover:bg-sunken"
                }
              >
                {label}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Open groups expanded" hint="Off shows just the headings, so a big session fits on one screen.">
          <Switch
            checked={prefs.expandGroups}
            onChange={(v) => onPref({ expandGroups: v })}
            aria-label="Open groups expanded"
          />
        </Row>
        <Row label="Show “Probably done”" hint="The pile of tabs you haven't touched in a while.">
          <Switch
            checked={prefs.showStalePile}
            onChange={(v) => onPref({ showStalePile: v })}
            aria-label="Show the probably-done pile"
          />
        </Row>
        <Row label="Show “Everything else”" hint="Tabs that don't belong to any activity yet.">
          <Switch
            checked={prefs.showCatchAll}
            onChange={(v) => onPref({ showCatchAll: v })}
            aria-label="Show the everything-else pile"
          />
        </Row>
      </Section>

      <Section title="Behavior">
        <Row label="Mirror groups in the tab strip" hint="Show Thicket's groups as native Chrome tab groups.">
          <Switch
            checked={prefs.mirrorTabGroups}
            onChange={(v) => onPref({ mirrorTabGroups: v })}
            aria-label="Mirror tab groups"
          />
        </Row>
        <Row label="Keyboard shortcuts" hint="Chrome owns these — change them on its shortcuts page.">
          <Button size="sm" onClick={() => void chrome.tabs.create({ url: "chrome://extensions/shortcuts" })}>
            Open shortcuts
          </Button>
        </Row>
        <Row label="Theme" hint="">
          <div className="flex gap-1">
            {(["system", "light", "dark"] as const).map((theme) => (
              <button
                key={theme}
                onClick={() => onPref({ theme })}
                className={
                  prefs.theme === theme
                    ? "rounded-md bg-accent-soft px-2.5 py-1 text-[0.8125rem] font-medium text-accent"
                    : "rounded-md px-2.5 py-1 text-[0.8125rem] text-ink-secondary hover:bg-sunken"
                }
              >
                {theme[0]!.toUpperCase() + theme.slice(1)}
              </button>
            ))}
          </div>
        </Row>
      </Section>

      <Section title="Your data">
        <p className="text-[0.8125rem] leading-relaxed text-ink-secondary">
          Everything Thicket knows lives in this browser. Take a copy whenever you like, or
          erase all of it — groups, workspaces, page memory, rules and settings — in one go.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onExport}>
            Export a copy
          </Button>
          {confirmWipe ? (
            <>
              <Button size="sm" variant="danger" onClick={onWipe}>
                Yes, erase everything
              </Button>
              <button
                className="text-[0.8125rem] text-ink-secondary hover:text-ink"
                onClick={() => setConfirmWipe(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmWipe(true)}>
              Erase everything…
            </Button>
          )}
        </div>
        <p className="mt-3 text-[0.75rem] text-ink-faint">Thicket v{state.version}</p>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 border-b border-edge pb-1.5 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">
        {title}
      </h2>
      {children}
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-6 py-2.5">
      <div className="min-w-0">
        <p className="text-sm text-ink">{label}</p>
        {hint ? <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-secondary">{hint}</p> : null}
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}
