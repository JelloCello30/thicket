import type { Metadata } from "next";
import { BRAND } from "@tabmind/config";
import { Mark } from "@tabmind/ui";

export const metadata: Metadata = {
  title: "Download",
  description: "Install the TabMind extension for Chrome. Free, works without an account, ten-second setup.",
  alternates: { canonical: "/download" },
};

export default function DownloadPage() {
  const storeReady = !BRAND.chromeStoreUrl.includes("PENDING");
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16 sm:py-20">
      <Mark size={40} />
      <h1 className="mt-6 text-4xl font-semibold tracking-tight text-ink">Get TabMind for Chrome</h1>
      <p className="mt-4 text-pretty text-[1.0625rem] leading-relaxed text-ink-secondary">
        Install it, and within seconds your open tabs become a short list of the things you're
        actually doing. No setup, no account required.
      </p>
      {storeReady ? (
        <>
          <a
            href={BRAND.chromeStoreUrl}
            target="_blank"
            rel="noreferrer"
            className="mt-7 inline-block rounded-md bg-accent px-5 py-2.5 text-[0.9375rem] font-medium text-accent-ink transition-colors hover:bg-accent-hover"
          >
            Add to Chrome — it's free
          </a>
          <p className="mt-3 text-[0.8125rem] text-ink-faint">
            Chrome 121 or newer. Works on Edge, Brave, and Arc too.
          </p>
        </>
      ) : (
        <div className="mt-7 rounded-lg border border-edge bg-raised p-5">
          <p className="text-[0.9375rem] font-medium text-ink">
            The Chrome Web Store listing is on its way.
          </p>
          <p className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-secondary">
            Until it's live, you can run TabMind from source in about a minute — everything works,
            including updates when you pull:
          </p>
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-[0.875rem] leading-relaxed text-ink-secondary">
            <li>
              Clone the repo and build:{" "}
              <code className="rounded bg-sunken px-1.5 py-0.5 text-[0.8125rem]">pnpm install && pnpm build</code>
            </li>
            <li>
              Open <code className="rounded bg-sunken px-1.5 py-0.5 text-[0.8125rem]">chrome://extensions</code>,
              turn on Developer mode
            </li>
            <li>
              Click “Load unpacked” and pick{" "}
              <code className="rounded bg-sunken px-1.5 py-0.5 text-[0.8125rem]">apps/extension/dist</code>
            </li>
          </ol>
          <p className="mt-3 text-[0.8125rem] text-ink-faint">
            Chrome 121 or newer. Works on Edge, Brave, and Arc too.
          </p>
        </div>
      )}

      <section className="mt-14">
        <h2 className="text-lg font-semibold tracking-tight text-ink">What happens next</h2>
        <ol className="mt-4 space-y-3">
          {[
            "TabMind looks at your open tabs — titles and addresses, right on your device.",
            "A few seconds later: your tabs, grouped into the projects behind them.",
            "Close a group when you're done with it. Everything stays recoverable.",
          ].map((step, i) => (
            <li key={step} className="flex gap-3.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent-soft text-[0.8125rem] font-semibold text-accent">
                {i + 1}
              </span>
              <p className="pt-0.5 text-[0.9375rem] leading-relaxed text-ink-secondary">{step}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-14">
        <h2 className="text-lg font-semibold tracking-tight text-ink">The permissions, explained</h2>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-secondary">
          Chrome will show you what TabMind can access. Here's the honest version of why:
        </p>
        <dl className="mt-5 space-y-4">
          <Permission name="Read your browsing history (tabs)">
            This is Chrome's blanket wording for seeing tab titles and addresses — the raw material
            for grouping. TabMind reads your open tabs; it does not read your browser history file.
          </Permission>
          <Permission name="Tab groups">
            So your TabMind groups can appear as native colored groups in the tab strip. You can turn
            the mirroring off.
          </Permission>
          <Permission name="Storage">
            Your groups, workspaces, and page memory live in the extension's local storage on your
            machine.
          </Permission>
          <Permission name="Optional: read page content">
            Off by default, and Chrome asks separately if you ever enable it. Only used to make
            summaries and comparisons better.
          </Permission>
        </dl>
      </section>
    </main>
  );
}

function Permission({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="border-l-2 border-edge pl-4">
      <dt className="text-[0.9375rem] font-medium text-ink">{name}</dt>
      <dd className="mt-1 text-[0.875rem] leading-relaxed text-ink-secondary">{children}</dd>
    </div>
  );
}
