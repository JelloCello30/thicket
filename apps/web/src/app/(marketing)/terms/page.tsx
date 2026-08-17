import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "The terms that govern your use of Thicket.",
  alternates: { canonical: "/terms" },
};

const EFFECTIVE_DATE = "August 14, 2026"; // [CUSTOMIZE] Set to your actual launch date.

export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Terms of Service</h1>
      <p className="mt-2 text-[0.8125rem] text-ink-faint">Effective {EFFECTIVE_DATE}</p>

      <div className="mt-8 space-y-8 text-[0.9375rem] leading-relaxed text-ink-secondary">
        <Section title="1. Who's agreeing to what">
          <p>
            These terms are between you and [CUSTOMIZE: legal entity name] ("Thicket", "we"). By
            installing the extension or creating an account, you agree to them. If you don't agree,
            don't use Thicket.
          </p>
        </Section>

        <Section title="2. The service">
          <p>
            Thicket is a browser extension and companion web service that organizes browser tabs,
            saves workspaces, and provides optional AI-assisted features. The free plan and Pro plan
            are described on the pricing page; we may change plan contents with notice, but we won't
            silently remove things you've paid for mid-cycle.
          </p>
        </Section>

        <Section title="3. Your account">
          <p>
            Keep your sign-in method secure — magic links and Google sign-in act as your password.
            You're responsible for activity under your account. You must be at least 13 (or the
            minimum age in your country) to use Thicket.
          </p>
        </Section>

        <Section title="4. Billing">
          <p>
            Pro is billed by Stripe, monthly or yearly, and renews automatically until you cancel.
            Cancel anytime from Settings → Manage billing; you keep Pro until the end of the paid
            period. If Thicket isn't working out in your first 14 days of Pro, email
            support@jellocello30.github.io/thicket for a full refund. Prices may change with at least 30 days' notice —
            never mid-cycle.
          </p>
        </Section>

        <Section title="5. Your data">
          <p>
            Your tabs, workspaces, and page memory are yours. We claim no ownership; you grant us
            only the license needed to store and process them to run the service, as described in the{" "}
            <a href="/privacy" className="text-accent">Privacy Policy</a>. Export and deletion are
            self-serve in Settings.
          </p>
        </Section>

        <Section title="6. Acceptable use">
          <p>Don't use Thicket to break the law, probe or overload our systems, resell the service, or reverse-engineer non-open components. Automated scraping of the service is not allowed.</p>
        </Section>

        <Section title="7. AI features">
          <p>
            AI-generated names, summaries, and comparisons are best-effort interpretations of your
            own tabs. They can be wrong or incomplete — check anything that matters before relying on
            it. AI output based on your tabs is yours.
          </p>
        </Section>

        <Section title="8. Disclaimers">
          <p>
            Thicket is provided "as is." To the maximum extent allowed by law we disclaim implied
            warranties, and we don't promise uninterrupted or error-free operation. Browsers change;
            we work to keep up, but a browser update may temporarily affect features.
          </p>
        </Section>

        <Section title="9. Limitation of liability">
          <p>
            To the maximum extent allowed by law, our total liability for any claim is limited to the
            amount you paid us in the 12 months before the claim (or $50 if you've paid nothing).
            We're not liable for indirect, incidental, or consequential damages.
          </p>
        </Section>

        <Section title="10. Ending things">
          <p>
            You can stop using Thicket and delete your account at any time. We can suspend or
            terminate accounts that violate these terms; if we discontinue the service, we'll give at
            least 60 days' notice and keep export available through that period.
          </p>
        </Section>

        <Section title="11. Governing law and disputes">
          <p>
            [CUSTOMIZE: governing law, venue, and any arbitration clause — this requires a legal
            decision. Example: "These terms are governed by the laws of the State of California, and
            disputes will be resolved in the state or federal courts of Los Angeles County."]
          </p>
        </Section>

        <Section title="12. Changes to these terms">
          <p>
            If we change these terms materially, we'll email account holders at least 14 days before
            the changes take effect. Continuing to use Thicket after that means you accept them.
          </p>
        </Section>

        <p className="border-t border-edge pt-6 text-[0.8125rem] text-ink-faint">
          [CUSTOMIZE — before launch: fill in the legal entity, choose governing law/venue, confirm
          the refund window matches your policy, and have counsel review.]
        </p>
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight text-ink">{title}</h2>
      {children}
    </section>
  );
}
