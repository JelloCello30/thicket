import type { Metadata } from "next";
import { BRAND, LOCAL_ONLY } from "@thicket/config";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "How Thicket handles your data: what stays on your device, what syncs, and what you control.",
  alternates: { canonical: "/privacy" },
};

const EFFECTIVE_DATE = "August 15, 2026";

export default function PrivacyPage() {
  /**
   * The shipped build has no account, no server, and no analytics, so the long
   * policy — processors, retention, transfers, deletion requests — describes
   * machinery that does not exist. Saying less here is not a shortcut; it is
   * the only accurate description of what happens, and it keeps unfinished
   * clauses off a live legal page.
   */
  if (LOCAL_ONLY) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-semibold tracking-tight text-ink">Privacy Policy</h1>
        <p className="mt-2 text-[0.8125rem] text-ink-faint">Effective {EFFECTIVE_DATE}</p>
        <div className="prose-thicket mt-8 space-y-8 text-[0.9375rem] leading-relaxed text-ink-secondary">
          <Section title="The short version">
            <p>
              Thicket collects nothing. It has no account system and no server. Everything it
              knows — your tab groups, saved workspaces, and page memory — is stored by your own
              browser on your own computer, and none of it is transmitted anywhere.
            </p>
          </Section>
          <Section title="What Thicket reads, and where it goes">
            <p>
              To group your tabs, the extension reads the titles and web addresses of the tabs you
              have open. That reading happens inside your browser and the result is written to your
              browser&rsquo;s local storage. There is no network request carrying it, because there
              is nowhere for it to go.
            </p>
            <p>
              Private windows are never observed. Banking and healthcare sites are excluded
              automatically, and any site you exclude yourself is neither grouped nor remembered —
              excluding a site also erases whatever Thicket had already stored about it.
            </p>
            <p>
              Page <em>contents</em> are only read if you switch on &ldquo;Page content&rdquo; in
              Settings, which asks for a separate browser permission. That text is used to write a
              summary on your machine and is never stored.
            </p>
          </Section>
          <Section title="Your control">
            <p>
              Settings → Your data has two buttons that do exactly what they say: export everything
              Thicket holds as a JSON file, or erase all of it. Uninstalling the extension removes
              it too. Nobody has to process a request, because nobody else has a copy.
            </p>
          </Section>
          <Section title="Changes and contact">
            <p>
              If Thicket ever adds optional accounts or cloud sync, this page will say so plainly
              before that ships, and those features will be opt-in. Questions:{" "}
              <a href={`mailto:${BRAND.supportEmail}`} className="text-accent hover:underline">
                {BRAND.supportEmail}
              </a>
              .
            </p>
          </Section>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Privacy Policy</h1>
      <p className="mt-2 text-[0.8125rem] text-ink-faint">Effective {EFFECTIVE_DATE}</p>

      <div className="prose-thicket mt-8 space-y-8 text-[0.9375rem] leading-relaxed text-ink-secondary">
        <Section title="The short version">
          <p>
            Thicket organizes your browser tabs. Signed out, everything happens on your device and we
            receive nothing. Signed in, we store the minimum needed to sync and search: page titles,
            addresses, and your saved workspaces. Page <em>content</em> is only ever processed if you
            switch that on. We don't sell data, we don't run ads, and we don't use your data to train
            AI models.
          </p>
        </Section>

        <Section title="Who we are">
          <p>
            Thicket is operated by [CUSTOMIZE: legal entity name and address]. For anything in this
            policy, contact <a href="mailto:nolan.h.woo@gmail.com" className="text-accent">nolan.h.woo@gmail.com</a>.
          </p>
        </Section>

        <Section title="What the extension processes on your device">
          <p>
            To group tabs, the extension reads the title, web address, and activity times of your open
            tabs, and keeps a local memory of pages you've had open. This processing is local. It
            never includes:
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Incognito or private windows — never observed at all</li>
            <li>Sign-in, password, and payment pages — detected and skipped</li>
            <li>Sites on the built-in sensitive list (banks, healthcare portals, government services)</li>
            <li>Sites you exclude yourself in Settings</li>
            <li>Secret-looking parts of web addresses (tokens, session IDs) — stripped before storing</li>
          </ul>
        </Section>

        <Section title="What we receive when you sign in">
          <p>With an account, and only while sync is enabled, our servers store:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>Your email address and name (from Google sign-in or your magic-link email)</li>
            <li>Saved workspaces: their titles and the titles/addresses of pages in them</li>
            <li>
              Page memory: titles and addresses of pages you've had open, kept for 7 days on the free
              plan and 90 days on Pro, then deleted automatically
            </li>
            <li>Your settings, excluded-domain list, and connected devices</li>
            <li>
              Product events (for example "workspace saved") with counts — never page titles,
              addresses, or content
            </li>
          </ul>
        </Section>

        <Section title="AI processing">
          <p>
            When AI features are on, page <strong>titles and addresses</strong> are sent to our AI
            provider ([CUSTOMIZE if you change providers: Anthropic; embeddings by Voyage AI]) to
            group, name, summarize, and search your tabs. Under our agreements, these providers do
            not use the data to train their models.
          </p>
          <p>
            Page <strong>content</strong> (the text of a page) is processed only if you enable
            "Page content" in Settings, which also requires a separate browser permission. It's off
            by default. Sensitive and excluded sites are never sent to AI regardless of any setting.
          </p>
        </Section>

        <Section title="What we never do">
          <ul className="list-disc space-y-1 pl-5">
            <li>Sell or rent your data, to anyone, for anything</li>
            <li>Show ads or share data with ad networks</li>
            <li>Use your data to train AI models</li>
            <li>Read your browser's full history file — only tabs that are open while Thicket runs</li>
            <li>Collect data while Thicket is paused</li>
          </ul>
        </Section>

        <Section title="Service providers">
          <p>We use a small set of processors to run Thicket:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>[CUSTOMIZE: hosting provider, e.g. Vercel] — application hosting</li>
            <li>[CUSTOMIZE: database provider, e.g. Neon] — database hosting</li>
            <li>Stripe — payments (we never see your card number)</li>
            <li>Anthropic and Voyage AI — AI processing as described above</li>
            <li>[CUSTOMIZE: Resend] — sign-in and account email</li>
            <li>[CUSTOMIZE if enabled: Sentry (error monitoring), PostHog (product analytics)]</li>
          </ul>
        </Section>

        <Section title="Retention and deletion">
          <p>
            Page memory expires automatically (7 or 90 days by plan). Workspaces stay until you
            delete them. Deleting your account — Settings → Your data → Delete — removes your
            account, workspaces, page memory, devices, settings, and events immediately, and cancels
            any subscription. Backups age out within 30 days. You can export everything as JSON
            first.
          </p>
        </Section>

        <Section title="Your rights">
          <p>
            Depending on where you live (GDPR, UK GDPR, CCPA and similar), you have rights to access,
            correct, delete, and port your data, and to object to processing. The export and delete
            buttons in Settings cover most of this instantly; for anything else, email{" "}
            <a href="mailto:nolan.h.woo@gmail.com" className="text-accent">nolan.h.woo@gmail.com</a> and
            we'll respond within 30 days. [CUSTOMIZE: add your EU/UK representative if required.]
          </p>
        </Section>

        <Section title="Security">
          <p>
            Data in transit is encrypted with TLS; data at rest is encrypted by our hosting
            providers. Extension access tokens are stored hashed, can be revoked per device, and
            never appear in URLs. Payment details go directly to Stripe.
          </p>
        </Section>

        <Section title="Children">
          <p>Thicket isn't directed at children under 13, and we don't knowingly collect their data.</p>
        </Section>

        <Section title="Changes">
          <p>
            If this policy changes materially, we'll note it here and — for signed-in users — tell
            you by email before it takes effect.
          </p>
        </Section>

        <p className="border-t border-edge pt-6 text-[0.8125rem] text-ink-faint">
          [CUSTOMIZE — before launch: fill in the legal entity, confirm the processor list matches
          your configuration, set the effective date, and have counsel review for your
          jurisdictions.]
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
