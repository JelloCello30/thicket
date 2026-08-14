import type { Metadata } from "next";
import Link from "next/link";
import { PLAN_FEATURES, PRICING } from "@tabmind/config";
import { ProCta } from "./pro-cta";

export const metadata: Metadata = {
  title: "Pricing",
  description:
    "TabMind is free to use — automatic tab organization, three saved workspaces, and cleanup. Pro adds unlimited workspaces, AI search, summaries, and comparisons for $8/month.",
  alternates: { canonical: "/pricing" },
};

export default function PricingPage() {
  return (
    <main className="mx-auto w-full max-w-5xl px-6 py-16 sm:py-20">
      <div className="max-w-xl">
        <h1 className="text-4xl font-semibold tracking-tight text-ink">Pricing</h1>
        <p className="mt-4 text-pretty text-[1.0625rem] leading-relaxed text-ink-secondary">
          The organizing is free. Pro is for people whose tabs are a second brain — unlimited memory,
          and AI that can search, summarize, and compare it.
        </p>
      </div>

      <div className="mt-12 grid gap-5 sm:grid-cols-2">
        <div className="rounded-xl border border-edge bg-raised p-6">
          <h2 className="text-lg font-semibold text-ink">Free</h2>
          <p className="mt-1 text-[0.9375rem] text-ink-secondary">Stay organized, forever free.</p>
          <p className="mt-5 text-3xl font-semibold tracking-tight text-ink">
            $0
            <span className="ml-1 text-base font-normal text-ink-faint">/ month</span>
          </p>
          <Link
            href="/download"
            className="mt-5 block rounded-md border border-edge-strong px-4 py-2 text-center text-[0.9375rem] font-medium text-ink transition-colors hover:border-ink/30"
          >
            Add to Chrome
          </Link>
          <FeatureList features={PLAN_FEATURES.free} />
        </div>

        <div className="relative rounded-xl border border-accent/50 bg-raised p-6">
          <h2 className="text-lg font-semibold text-ink">Pro</h2>
          <p className="mt-1 text-[0.9375rem] text-ink-secondary">
            For research-heavy work and long memories.
          </p>
          <p className="mt-5 text-3xl font-semibold tracking-tight text-ink">
            ${PRICING.pro.monthlyUsd}
            <span className="ml-1 text-base font-normal text-ink-faint">/ month</span>
          </p>
          <p className="mt-1 text-[0.8125rem] text-ink-secondary">
            or ${PRICING.pro.yearlyUsd}/year — {Math.round((1 - PRICING.pro.yearlyUsd / 12 / PRICING.pro.monthlyUsd) * 100)}% less
          </p>
          <ProCta />
          <FeatureList features={PLAN_FEATURES.pro} lead="Everything in Free, plus" />
        </div>
      </div>

      <section className="mt-20 max-w-2xl">
        <h2 className="text-xl font-semibold tracking-tight text-ink">Fair questions</h2>
        <dl className="mt-6 space-y-6">
          <Faq q="Do I need an account?">
            No. The extension organizes your tabs entirely on your device, signed out. An account adds
            sync, AI naming, and — with Pro — search across everything you've closed.
          </Faq>
          <Faq q="What does the AI actually see?">
            Signed in with AI on: page titles and web addresses, nothing else. Page content is a
            separate opt-in with its own browser permission. Excluded and sensitive sites never leave
            your device either way.
          </Faq>
          <Faq q="What happens to my workspaces if I cancel Pro?">
            Nothing is deleted. You keep every workspace you've saved; you just can't add beyond the
            free limit of three, and the Pro features switch off.
          </Faq>
          <Faq q="Can I get a refund?">
            If TabMind isn't working out in your first 14 days, email support@tabmind.app and we'll
            refund you, no questions.
          </Faq>
        </dl>
      </section>
    </main>
  );
}

function FeatureList({ features, lead }: { features: readonly string[]; lead?: string }) {
  return (
    <ul className="mt-6 space-y-2 border-t border-edge pt-5">
      {lead ? <li className="pb-1 text-[0.8125rem] font-medium text-ink-faint">{lead}</li> : null}
      {features.map((feature) => (
        <li key={feature} className="flex items-start gap-2.5 text-[0.9375rem] text-ink-secondary">
          <svg
            width="12"
            height="12"
            viewBox="0 0 11 11"
            fill="none"
            className="mt-1.5 shrink-0 text-accent"
            aria-hidden="true"
          >
            <path d="M2 5.5l2.5 2.5L9 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          {feature}
        </li>
      ))}
    </ul>
  );
}

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-ink">{q}</dt>
      <dd className="mt-1.5 text-[0.9375rem] leading-relaxed text-ink-secondary">{children}</dd>
    </div>
  );
}
