import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Lockup } from "@tabmind/ui";
import { getAuth } from "@/lib/auth";
import { SignOutButton } from "./sign-out";

export const metadata = { robots: { index: false } };

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-edge px-3 py-4">
        <Link href="/app" className="mb-6 px-2">
          <Lockup size={22} />
        </Link>
        <nav className="flex flex-col gap-0.5" aria-label="Main">
          <RailLink href="/app">Workspaces</RailLink>
          <RailLink href="/app/connect">Connect extension</RailLink>
        </nav>
        <div className="mt-auto flex flex-col gap-0.5">
          <RailLink href="/app/settings">Settings</RailLink>
          <p className="truncate px-2.5 py-1 text-[0.75rem] text-ink-faint">{session.user.email}</p>
          <SignOutButton />
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-8 py-8">
        <div className="mx-auto max-w-3xl">{children}</div>
      </main>
    </div>
  );
}

function RailLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-2.5 py-1.5 text-sm text-ink-secondary hover:bg-sunken hover:text-ink"
    >
      {children}
    </Link>
  );
}
