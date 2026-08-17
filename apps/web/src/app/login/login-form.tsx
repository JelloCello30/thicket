"use client";

import { useState } from "react";
import { Button, Input } from "@thicket/ui";
import { authClient } from "@/lib/auth-client";

export function LoginForm({ googleEnabled, redirectTo }: { googleEnabled: boolean; redirectTo: string }) {
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  const sendLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setPhase("sending");
    const { error } = await authClient.signIn.magicLink({
      email: email.trim(),
      callbackURL: redirectTo,
    });
    if (error) {
      setPhase("error");
      setMessage(error.message ?? "Couldn't send the link. Try again.");
    } else {
      setPhase("sent");
    }
  };

  if (phase === "sent") {
    return (
      <div className="mt-8 rounded-lg border border-edge bg-raised p-4">
        <p className="text-sm font-medium text-ink">Check your email</p>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-secondary">
          We sent a sign-in link to <span className="font-medium text-ink">{email}</span>. It expires in
          10 minutes.
        </p>
        <button
          onClick={() => setPhase("idle")}
          className="mt-3 text-[0.8125rem] text-accent hover:underline underline-offset-2"
        >
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="mt-8">
      {googleEnabled ? (
        <>
          <Button
            className="w-full"
            onClick={() =>
              void authClient.signIn.social({ provider: "google", callbackURL: redirectTo })
            }
          >
            <svg width="15" height="15" viewBox="0 0 48 48" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.3 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
              <path fill="#FBBC05" d="M10.4 28.7a14.5 14.5 0 0 1 0-9.4l-7.8-6.1a24 24 0 0 0 0 21.6l7.8-6.1z" />
              <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.6l-7.5-5.8c-2.1 1.4-4.7 2.2-7.7 2.2-6.3 0-11.7-3.8-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
            </svg>
            Continue with Google
          </Button>
          <div className="my-5 flex items-center gap-3 text-[0.75rem] text-ink-faint">
            <span className="h-px flex-1 bg-edge" />
            or
            <span className="h-px flex-1 bg-edge" />
          </div>
        </>
      ) : null}
      <form onSubmit={sendLink} className="space-y-2.5">
        <label htmlFor="email" className="sr-only">
          Email address
        </label>
        <Input
          id="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button type="submit" variant="primary" className="w-full" loading={phase === "sending"}>
          Email me a sign-in link
        </Button>
      </form>
      {phase === "error" ? <p className="mt-2 text-[0.8125rem] text-danger">{message}</p> : null}
    </div>
  );
}
