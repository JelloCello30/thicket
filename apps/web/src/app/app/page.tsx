import { eq, inArray } from "drizzle-orm";
import Link from "next/link";
import { workspace, workspaceTab } from "@thicket/db/schema";
import { GroupDot } from "@thicket/ui";
import { db } from "@/lib/db";
import { requireSessionUser } from "@/lib/request-auth";

export const metadata = { title: "Workspaces" };

/**
 * The web mirror of saved workspaces — for checking your research from any
 * machine. Restoring tabs happens in the extension; here, every page is a
 * plain link you can open.
 */
export default async function AppHome() {
  const user = await requireSessionUser();
  const database = await db();
  const rows = await database
    .select()
    .from(workspace)
    .where(eq(workspace.userId, user.id));
  const ids = rows.map((r) => r.id);
  const tabs = ids.length
    ? await database.select().from(workspaceTab).where(inArray(workspaceTab.workspaceId, ids))
    : [];
  const active = rows.filter((w) => w.state === "active").sort((a, b) => +b.lastActiveAt - +a.lastActiveAt);
  const archived = rows.filter((w) => w.state === "archived").sort((a, b) => +b.lastActiveAt - +a.lastActiveAt);

  if (rows.length === 0) {
    return (
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Workspaces</h1>
        <div className="mt-10 max-w-md">
          <p className="text-sm font-medium text-ink">Nothing saved yet</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
            Save a group from the Thicket extension and it will appear here — findable from any
            machine, long after the tabs are closed.
          </p>
          <Link
            href="/app/connect"
            className="mt-4 inline-block rounded-md bg-accent px-3.5 py-2 text-sm font-medium text-accent-ink hover:bg-accent-hover"
          >
            Connect the extension
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-xl font-semibold tracking-tight text-ink">Workspaces</h1>
      <Section title={`Active · ${active.length}`} rows={active} tabs={tabs} />
      {archived.length > 0 ? <Section title={`Archived · ${archived.length}`} rows={archived} tabs={tabs} /> : null}
    </div>
  );
}

function Section({
  title,
  rows,
  tabs,
}: {
  title: string;
  rows: (typeof workspace.$inferSelect)[];
  tabs: (typeof workspaceTab.$inferSelect)[];
}) {
  return (
    <section className="mt-8">
      <h2 className="mb-3 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">{title}</h2>
      <ul className="space-y-2.5">
        {rows.map((w) => {
          const wsTabs = tabs.filter((t) => t.workspaceId === w.id).sort((a, b) => a.position - b.position);
          return (
            <li key={w.id} className="rounded-lg border border-edge bg-raised">
              <details>
                <summary className="flex cursor-pointer list-none items-center gap-2.5 px-3.5 py-2.5 [&::-webkit-details-marker]:hidden">
                  <GroupDot color={w.color} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{w.title}</span>
                  <span className="shrink-0 text-[0.75rem] tabular-nums text-ink-faint">
                    {wsTabs.length} {wsTabs.length === 1 ? "page" : "pages"} ·{" "}
                    {w.lastActiveAt.toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                  </span>
                </summary>
                <div className="border-t border-edge px-3.5 py-2.5">
                  {w.summary ? (
                    <p className="mb-2 text-[0.8125rem] leading-snug text-ink-secondary">{w.summary}</p>
                  ) : null}
                  <ul className="space-y-0.5">
                    {wsTabs.map((tab) => (
                      <li key={tab.id}>
                        <a
                          href={tab.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 rounded px-1 py-1 hover:bg-sunken"
                        >
                          <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">{tab.title}</span>
                          <span className="shrink-0 text-[0.75rem] text-ink-faint">{tab.domain}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
