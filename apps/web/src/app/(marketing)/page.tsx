import Link from "next/link";
import { GroupDot, Kbd } from "@thicket/ui";
import { LOCAL_ONLY, PRICING } from "@thicket/config";
import { TabDemo } from "./tab-demo";

export default function HomePage() {
  return (
    <main>
      {/* ————— Hero ————— */}
      <section className="mx-auto w-full max-w-5xl px-6 pb-20 pt-16 sm:pt-24">
        <div className="max-w-2xl">
          <h1 className="text-balance text-4xl font-semibold leading-[1.08] tracking-tight text-ink sm:text-5xl">
            Your tabs, organized by what you're actually doing.
          </h1>
          <p className="mt-5 max-w-xl text-pretty text-[1.0625rem] leading-relaxed text-ink-secondary">
            Thicket understands why your tabs are open, groups them into projects, and remembers them
            when you're ready to close everything.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/download"
              className="rounded-md bg-accent px-4.5 py-2.5 text-[0.9375rem] font-medium text-accent-ink transition-colors hover:bg-accent-hover"
            >
              Add to Chrome
            </Link>
            <a
              href="#how"
              className="rounded-md px-3 py-2.5 text-[0.9375rem] text-ink-secondary transition-colors hover:text-ink"
            >
              See how it works ↓
            </a>
          </div>
          <p className="mt-4 text-[0.8125rem] text-ink-faint">
            Free to use. Works without an account. Your tabs stay on your device.
          </p>
        </div>
        <div className="mt-14" id="how">
          <TabDemo />
        </div>
      </section>

      {/* ————— The claim ————— */}
      <section className="border-t border-edge">
        <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-24">
          <div className="grid items-start gap-10 sm:grid-cols-[1.1fr_1fr]">
            <div>
              <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-ink">
                You have 47 tabs open.
                <br />
                You're actually doing four things.
              </h2>
              <p className="mt-5 max-w-md text-pretty leading-relaxed text-ink-secondary">
                Tabs aren't really tabs. They're unfinished intentions — an apartment you're hunting
                for, a trip you're planning, a launch you're shipping. Your browser shows them as a
                flat row of favicons. Thicket shows you the intentions.
              </p>
            </div>
            <ul className="space-y-2.5 border-l border-edge pl-6 sm:mt-2">
              {[
                { name: "Apartment Hunt", count: 9, color: "green" },
                { name: "Japan Trip", count: 12, color: "cyan" },
                { name: "Pricing Launch", count: 14, color: "blue" },
                { name: "Camera Research", count: 7, color: "orange" },
                { name: "Probably done", count: 5, color: "grey", dim: true },
              ].map((group) => (
                <li
                  key={group.name}
                  className={`flex items-baseline gap-2.5 ${group.dim ? "opacity-50" : ""}`}
                >
                  <GroupDot color={group.color} className="translate-y-[-1px]" />
                  <span className="text-[1.0625rem] font-medium text-ink">{group.name}</span>
                  <span className="ml-auto tabular-nums text-ink-faint">{group.count}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ————— Find anything ————— */}
      <section className="border-t border-edge bg-raised/60">
        <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-24">
          <div className="grid items-center gap-12 sm:grid-cols-2">
            <div className="order-2 sm:order-1">
              <div className="rounded-lg border border-edge bg-raised shadow-md">
                <div className="flex items-center gap-2.5 border-b border-edge px-3.5 py-3">
                  <svg width="14" height="14" viewBox="0 0 15 15" fill="none" className="text-ink-faint" aria-hidden>
                    <circle cx="6.5" cy="6.5" r="4.75" stroke="currentColor" strokeWidth="1.5" />
                    <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  <span className="text-[0.875rem] text-ink">
                    {LOCAL_ONLY ? "rooftop" : "where was that apartment with the rooftop?"}
                  </span>
                  <Kbd className="ml-auto">↵</Kbd>
                </div>
                <div className="px-3.5 py-2.5">
                  <p className="pb-1.5 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">
                    From your history
                  </p>
                  <div className="flex items-center gap-2.5 rounded-md bg-sunken px-2.5 py-2">
                    <GroupDot color="green" />
                    <span className="min-w-0 truncate text-[0.8125rem] text-ink">
                      3421 Sunset Blvd — 2bd with rooftop deck · Zillow
                    </span>
                    <span className="ml-auto shrink-0 text-[0.75rem] text-ink-faint">closed 3d ago</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2.5 px-2.5 py-2">
                    <GroupDot color="green" />
                    <span className="min-w-0 truncate text-[0.8125rem] text-ink-secondary">
                      Rooftop access worth it? · r/LosAngeles
                    </span>
                    <span className="ml-auto shrink-0 text-[0.75rem] text-ink-faint">closed 5d ago</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="order-1 sm:order-2">
              <h2 className="text-3xl font-semibold leading-tight tracking-tight text-ink">
                Find the page. Not the title.
              </h2>
              <p className="mt-4 max-w-md text-pretty leading-relaxed text-ink-secondary">
                {LOCAL_ONLY ? (
                  <>
                    Type a word you remember — "rooftop", "shinkansen", "idempotency" — and Thicket
                    looks across your open tabs, your saved workspaces, and every page it has seen,
                    at once. Same box takes commands: "close duplicates", "clean up".
                  </>
                ) : (
                  <>
                    Describe what you remember — "the article about local-first software," "that
                    apartment with the rooftop" — and Thicket finds it, even if those words never
                    appeared in the title. Open tabs, closed tabs, last week's research: one search.
                  </>
                )}
              </p>
              <p className="mt-3 text-[0.8125rem] text-ink-faint">
                Press <Kbd>⌘</Kbd> <Kbd>K</Kbd> anywhere in the dashboard.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ————— Close without losing ————— */}
      <section className="border-t border-edge">
        <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-24">
          <div className="grid items-center gap-12 sm:grid-cols-2">
            <div>
              <h2 className="text-3xl font-semibold leading-tight tracking-tight text-ink">
                Close it. We'll remember it.
              </h2>
              <p className="mt-4 max-w-md text-pretty leading-relaxed text-ink-secondary">
                Save a group as a workspace and every page in it survives the close button. Twelve
                trip-planning tabs become one quiet card — and one click brings them all back,
                exactly as they were.
              </p>
              <p className="mt-3 max-w-md text-pretty text-[0.9375rem] leading-relaxed text-ink-secondary">
                That's the deal Thicket makes with you: closing a tab should never mean losing it.
              </p>
            </div>
            <div className="rounded-lg border border-edge bg-raised p-4 shadow-md">
              <div className="flex items-center gap-2.5">
                <GroupDot color="cyan" />
                <p className="text-[0.9375rem] font-semibold text-ink">Tokyo — October Trip</p>
              </div>
              <p className="mt-1.5 text-[0.8125rem] leading-snug text-ink-secondary">
                Flights from LAX around Oct 8–22, hotels in Shinjuku vs an Airbnb, JR Pass logistics,
                and a shortlist of restaurants.
              </p>
              <div className="mt-3 flex items-center justify-between border-t border-edge pt-3">
                <span className="text-[0.75rem] text-ink-faint">15 saved pages · last active 3 days ago</span>
                <span className="rounded-md bg-accent px-3 py-1.5 text-[0.8125rem] font-medium text-accent-ink">
                  Restore workspace
                </span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ————— Research without the mess ————— */}
      <section className="border-t border-edge bg-raised/60">
        <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-24">
          <div className="max-w-xl">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight text-ink">
              Research without the mess.
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-ink-secondary">
              Comparing five cameras across five tabs? Thicket lays them out side by side from what
              your tabs already say. Blank cells stay blank — it never invents a spec.
            </p>
          </div>
          <div className="mt-8 overflow-x-auto rounded-lg border border-edge bg-raised shadow-md">
            <table className="w-full min-w-[540px] border-collapse text-[0.8125rem]">
              <thead>
                <tr className="border-b border-edge-strong text-left text-ink-secondary">
                  <th className="px-4 py-2.5 font-medium">Camera</th>
                  <th className="px-4 py-2.5 font-medium">Price</th>
                  <th className="px-4 py-2.5 font-medium">Sensor</th>
                  <th className="px-4 py-2.5 font-medium">Weight</th>
                  <th className="px-4 py-2.5 font-medium">Notes from your tabs</th>
                </tr>
              </thead>
              <tbody className="text-ink-secondary">
                <tr className="border-b border-edge">
                  <td className="px-4 py-2.5 font-medium text-ink">Sony a7 IV</td>
                  <td className="px-4 py-2.5">$2,498</td>
                  <td className="px-4 py-2.5">33MP full-frame</td>
                  <td className="px-4 py-2.5">659 g</td>
                  <td className="px-4 py-2.5">"best autofocus of the pair" — DPReview</td>
                </tr>
                <tr>
                  <td className="px-4 py-2.5 font-medium text-ink">Fujifilm X-T5</td>
                  <td className="px-4 py-2.5">$1,699</td>
                  <td className="px-4 py-2.5">40MP APS-C</td>
                  <td className="px-4 py-2.5">557 g</td>
                  <td className="px-4 py-2.5 text-ink-faint">—</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="mt-6 max-w-xl text-[0.9375rem] leading-relaxed text-ink-secondary">
            Groups also get a short summary: how many sites, what's been touched recently, any
            prices sitting in your tabs, and what's worth keeping. Four lines, not four paragraphs.
          </p>
        </div>
      </section>


      {/* ————— Automations ————— */}
      <section className="border-t border-edge bg-raised/60">
        <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-24">
          <div className="max-w-xl">
            <h2 className="text-3xl font-semibold leading-tight tracking-tight text-ink">
              The tidying you'd do anyway, done for you.
            </h2>
            <p className="mt-4 text-pretty leading-relaxed text-ink-secondary">
              Write the rule once, in plain terms. Thicket runs it quietly and keeps a log of
              everything it did — with an undo button next to each entry, because automation you
              can't reverse is automation you can't trust.
            </p>
          </div>
          <div className="mt-8 space-y-2.5">
            {[
              { when: "a group hasn't been touched in 3 days", then: "save it and close its tabs" },
              { when: "the same page is open twice", then: "close the extra copy" },
              { when: "I pass 40 open tabs", then: "collapse groups I'm not using" },
            ].map((rule) => (
              <div
                key={rule.when}
                className="flex flex-wrap items-baseline gap-x-2 rounded-lg border border-edge bg-raised px-4 py-3 text-[0.9375rem] shadow-sm"
              >
                <span className="font-medium uppercase tracking-wide text-[0.6875rem] text-ink-faint">When</span>
                <span className="text-ink">{rule.when}</span>
                <span className="font-medium uppercase tracking-wide text-[0.6875rem] text-ink-faint">then</span>
                <span className="text-ink">{rule.then}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ————— Privacy ————— */}
      <section className="border-t border-edge">
        <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-24">
          <div className="grid gap-12 sm:grid-cols-[1fr_1.2fr]">
            <div>
              <h2 className="text-3xl font-semibold leading-tight tracking-tight text-ink">
                Built like it's watching your browser. Because it is.
              </h2>
              <p className="mt-4 text-pretty leading-relaxed text-ink-secondary">
                A tab manager sees a lot. So the boring privacy work came first, and it's not fine
                print — it's architecture.
              </p>
              <Link
                href="/privacy"
                className="mt-4 inline-block text-[0.9375rem] font-medium text-accent hover:underline underline-offset-2"
              >
                Read the privacy policy →
              </Link>
            </div>
            <ul className="space-y-4">
              {[
                {
                  title: "Organization happens on your device",
                  body: "Grouping runs locally in the extension. Signed out, nothing ever leaves your browser.",
                },
                LOCAL_ONLY
                  ? {
                      title: "There is no account, and no server",
                      body: "Nothing is uploaded: the extension ships without the code to make a network request. Grouping, search, summaries and comparisons all run in your browser.",
                    }
                  : {
                      title: "AI is opt-in, and it sees titles — not pages",
                      body: "Sign in and Thicket's servers see page titles and addresses to help name and search. Reading page content is a separate switch, off by default, with its own browser permission.",
                    },
                {
                  title: "Banking and health sites are excluded automatically",
                  body: "A built-in list keeps sensitive sites out of everything. Add your own exclusions — company tools, anything — in two clicks.",
                },
                {
                  title: "Incognito is invisible. Always.",
                  body: "Private windows are never observed, never recorded, no setting required.",
                },
                {
                  title: "Export or delete everything, for real",
                  body: LOCAL_ONLY
                    ? "Settings has two buttons: download everything Thicket holds as JSON, or erase all of it. No request to file — nobody else has a copy."
                    : "One button downloads all your data as JSON. Another deletes your account and everything with it — workspaces, history, the lot.",
                },
              ].map((item) => (
                <li key={item.title} className="border-l-2 border-accent/40 pl-4">
                  <p className="font-medium text-ink">{item.title}</p>
                  <p className="mt-0.5 text-[0.9375rem] leading-relaxed text-ink-secondary">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ————— Pricing teaser ————— */}
      <section className="border-t border-edge bg-raised/60">
        <div className="mx-auto w-full max-w-5xl px-6 py-20 sm:py-24">
          <div className="flex flex-col items-start justify-between gap-8 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-3xl font-semibold leading-tight tracking-tight text-ink">
                {LOCAL_ONLY ? "Free, and it stays on your machine." : "Free to stay organized."}
              </h2>
              <p className="mt-3 max-w-md text-pretty leading-relaxed text-ink-secondary">
                {LOCAL_ONLY ? (
                  <>
                    Grouping, workspaces, search, cleanup, automations, summaries and
                    comparisons all run on your device. No account, no subscription, nothing
                    uploaded — there is no server to upload to.
                  </>
                ) : (
                  <>
                    Automatic grouping, automations, three saved workspaces, and cleanup — free,
                    forever. Pro adds unlimited workspaces, AI search across your history,
                    summaries, and comparisons for ${PRICING.pro.monthlyUsd}/month.
                  </>
                )}
              </p>
            </div>
            <Link
              href={LOCAL_ONLY ? "/download" : "/pricing"}
              className="shrink-0 rounded-md border border-edge-strong bg-raised px-4 py-2 text-[0.9375rem] font-medium text-ink transition-colors hover:border-ink/30"
            >
              {LOCAL_ONLY ? "Install it" : "See pricing"}
            </Link>
          </div>
        </div>
      </section>

      {/* ————— Final CTA ————— */}
      <section className="border-t border-edge">
        <div className="mx-auto w-full max-w-5xl px-6 py-24 text-center sm:py-28">
          <h2 className="text-balance text-3xl font-semibold leading-tight tracking-tight text-ink sm:text-4xl">
            Never organize a browser tab again.
          </h2>
          <div className="mt-7">
            <Link
              href="/download"
              className="inline-block rounded-md bg-accent px-5 py-2.5 text-[0.9375rem] font-medium text-accent-ink transition-colors hover:bg-accent-hover"
            >
              Add to Chrome
            </Link>
          </div>
          <p className="mt-4 text-[0.8125rem] text-ink-faint">Takes about ten seconds. The aha takes five more.</p>
        </div>
      </section>
    </main>
  );
}
