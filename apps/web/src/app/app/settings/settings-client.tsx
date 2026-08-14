"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, Switch } from "@tabmind/ui";
import { PLAN_FEATURES, PRICING } from "@tabmind/config";

interface Props {
  user: { email: string; name: string; plan: "free" | "pro" };
  billingConfigured: boolean;
  devices: { id: string; name: string; browser: string; lastSeenAt: number; createdAt: number }[];
  preferences: { aiEnabled: boolean; contentAnalysis: boolean };
  excludedDomains: string[];
}

export function SettingsClient({ user, billingConfigured, devices, preferences, excludedDomains }: Props) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(preferences);
  const [domains, setDomains] = useState(excludedDomains);
  const [domainDraft, setDomainDraft] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteDraft, setDeleteDraft] = useState("");
  const [notice, setNotice] = useState("");

  const call = async (path: string, init?: RequestInit) => {
    const response = await fetch(path, { ...init, headers: { "content-type": "application/json" } });
    if (!response.ok) {
      const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      throw new Error(body?.error?.message ?? "Something went wrong.");
    }
    return response.json();
  };

  const patchPrefs = async (patch: Partial<typeof prefs>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    await call("/api/me", { method: "PATCH", body: JSON.stringify(patch) }).catch(() => setPrefs(prefs));
  };

  const checkout = async (interval: "month" | "year") => {
    setBusy(`checkout:${interval}`);
    try {
      const { url } = (await call("/api/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ interval }),
      })) as { url: string };
      window.location.href = url;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Checkout failed.");
      setBusy(null);
    }
  };

  const portal = async () => {
    setBusy("portal");
    try {
      const { url } = (await call("/api/billing/portal", { method: "POST" })) as { url: string };
      window.location.href = url;
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't open the billing portal.");
      setBusy(null);
    }
  };

  return (
    <div className="max-w-xl space-y-10">
      <h1 className="text-xl font-semibold tracking-tight text-ink">Settings</h1>
      {notice ? <p className="rounded-md bg-danger-soft px-3 py-2 text-[0.8125rem] text-danger">{notice}</p> : null}

      <Section title="Plan">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-ink">
              {user.plan === "pro" ? "TabMind Pro" : "Free plan"}
              <span className="ml-2 text-ink-faint">{user.email}</span>
            </p>
            <ul className="mt-2 space-y-1">
              {PLAN_FEATURES[user.plan].map((feature) => (
                <li key={feature} className="flex items-center gap-2 text-[0.8125rem] text-ink-secondary">
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none" className="shrink-0 text-accent" aria-hidden>
                    <path d="M2 5.5l2.5 2.5L9 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {feature}
                </li>
              ))}
            </ul>
          </div>
          <div className="shrink-0">
            {user.plan === "pro" ? (
              <Button size="sm" loading={busy === "portal"} onClick={() => void portal()}>
                Manage billing
              </Button>
            ) : billingConfigured ? (
              <div className="flex flex-col items-end gap-1.5">
                <Button size="sm" variant="primary" loading={busy === "checkout:month"} onClick={() => void checkout("month")}>
                  Go Pro — ${PRICING.pro.monthlyUsd}/mo
                </Button>
                <button
                  onClick={() => void checkout("year")}
                  className="text-[0.75rem] text-ink-secondary hover:text-ink"
                >
                  or ${PRICING.pro.yearlyUsd}/year
                </button>
              </div>
            ) : (
              <p className="max-w-[180px] text-right text-[0.75rem] text-ink-faint">
                Billing isn't configured in this environment.
              </p>
            )}
          </div>
        </div>
      </Section>

      <Section title="Privacy">
        <Row
          label="AI processing"
          hint="Allow TabMind to analyze page titles and web addresses server-side for organization, naming, and search."
        >
          <Switch checked={prefs.aiEnabled} onChange={(v) => void patchPrefs({ aiEnabled: v })} aria-label="AI processing" />
        </Row>
        <Row
          label="Page content"
          hint="Allow page text to improve summaries and comparisons. Also requires a permission grant in the extension."
        >
          <Switch
            checked={prefs.contentAnalysis}
            onChange={(v) => void patchPrefs({ contentAnalysis: v })}
            aria-label="Page content analysis"
          />
        </Row>
        <div className="pt-1">
          <p className="text-sm text-ink">Excluded sites</p>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-secondary">
            Pages on these domains never sync to your account and are never sent to AI.
          </p>
          <form
            className="mt-2 flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const draft = domainDraft.trim();
              if (!draft) return;
              void call("/api/excluded-domains", { method: "POST", body: JSON.stringify({ domain: draft }) })
                .then((result) => {
                  const added = (result as { domain: string }).domain;
                  setDomains((d) => [...new Set([...d, added])]);
                  setDomainDraft("");
                })
                .catch((e: Error) => setNotice(e.message));
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
          {domains.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {domains.map((domain) => (
                <li key={domain} className="flex items-center gap-1.5 rounded-full border border-edge px-2.5 py-1 text-[0.8125rem] text-ink">
                  {domain}
                  <button
                    aria-label={`Stop excluding ${domain}`}
                    className="text-ink-faint hover:text-ink"
                    onClick={() =>
                      void call("/api/excluded-domains", { method: "DELETE", body: JSON.stringify({ domain }) }).then(() =>
                        setDomains((d) => d.filter((x) => x !== domain)),
                      )
                    }
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Section>

      <Section title="Connected devices">
        {devices.length === 0 ? (
          <p className="text-[0.8125rem] text-ink-secondary">
            No extensions connected yet.{" "}
            <a href="/app/connect" className="text-accent hover:underline underline-offset-2">
              Connect one
            </a>
            .
          </p>
        ) : (
          <ul className="space-y-1.5">
            {devices.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-raised px-3.5 py-2">
                <div className="min-w-0">
                  <p className="truncate text-sm text-ink">{d.name}</p>
                  <p className="text-[0.75rem] text-ink-faint">
                    last active {new Date(d.lastSeenAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy === `revoke:${d.id}`}
                  onClick={() => {
                    setBusy(`revoke:${d.id}`);
                    void call(`/api/devices/${d.id}`, { method: "DELETE" })
                      .then(() => router.refresh())
                      .finally(() => setBusy(null));
                  }}
                >
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Your data" id="data">
        <div className="flex items-center justify-between gap-4 py-1">
          <div>
            <p className="text-sm text-ink">Export everything</p>
            <p className="text-[0.8125rem] text-ink-secondary">
              Workspaces, page memory, preferences — one JSON file.
            </p>
          </div>
          <Button size="sm" onClick={() => window.open("/api/account/export", "_blank")}>
            Export
          </Button>
        </div>
        <div className="mt-3 rounded-lg border border-edge p-3.5">
          <p className="text-sm text-ink">Delete account and all data</p>
          <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-secondary">
            Permanently removes your account, workspaces, page memory, devices, and cancels any
            subscription. This cannot be undone. Type{" "}
            <span className="font-mono text-ink">delete my account</span> to confirm.
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <Input
              value={deleteDraft}
              onChange={(e) => setDeleteDraft(e.target.value)}
              placeholder="delete my account"
              aria-label="Deletion confirmation"
              className="h-8 max-w-[220px] text-[0.8125rem]"
            />
            <Button
              size="sm"
              variant="danger"
              disabled={deleteDraft !== "delete my account"}
              loading={busy === "delete"}
              onClick={() => {
                setBusy("delete");
                void call("/api/account/delete", {
                  method: "POST",
                  body: JSON.stringify({ confirm: deleteDraft }),
                })
                  .then(() => {
                    window.location.href = "/";
                  })
                  .catch((e: Error) => {
                    setNotice(e.message);
                    setBusy(null);
                  });
              }}
            >
              Delete forever
            </Button>
          </div>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, children, id }: { title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id}>
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
        <p className="mt-0.5 text-[0.8125rem] leading-snug text-ink-secondary">{hint}</p>
      </div>
      <div className="shrink-0 pt-0.5">{children}</div>
    </div>
  );
}
