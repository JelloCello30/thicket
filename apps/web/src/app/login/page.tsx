import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { featureAvailability, serverEnv } from "@thicket/config/env";
import { Lockup } from "@thicket/ui";
import { getAuth } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to Thicket to sync workspaces and unlock AI organization.",
  robots: { index: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string }>;
}) {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  const { from } = await searchParams;
  const target = from === "extension" ? "/app/connect" : "/app";
  if (session) redirect(target);

  const availability = featureAvailability(serverEnv());

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-10 inline-block">
          <Lockup size={24} />
        </Link>
        <h1 className="text-xl font-semibold tracking-tight text-ink">Sign in</h1>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
          Workspaces sync to your account. AI organization, summaries, and search across your history
          unlock once you're signed in.
        </p>
        <LoginForm googleEnabled={availability.googleAuth} redirectTo={target} />
        <p className="mt-8 text-[0.8125rem] leading-relaxed text-ink-faint">
          No password to remember — we email you a sign-in link. By continuing you agree to the{" "}
          <Link href="/terms" className="text-ink-secondary underline underline-offset-2 hover:text-ink">
            terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-ink-secondary underline underline-offset-2 hover:text-ink">
            privacy policy
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
