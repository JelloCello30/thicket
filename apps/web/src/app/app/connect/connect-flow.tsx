"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Spinner } from "@tabmind/ui";

type Phase = "idle" | "requesting" | "trying" | "linked" | "manual" | "error";

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage?: (
          extensionId: string,
          message: unknown,
          callback: (response?: { ok?: boolean; email?: string; error?: string }) => void,
        ) => void;
      };
    };
  }
}

/**
 * One click: mint a code server-side, hand it to the extension over
 * externally_connectable messaging. If the extension can't be reached
 * (not installed / different browser), fall back to showing the code.
 */
export function ConnectFlow({ extensionIds }: { extensionIds: string[] }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");

  const start = useCallback(async () => {
    setPhase("requesting");
    setError("");
    try {
      const response = await fetch("/api/devices/link/start", { method: "POST" });
      if (!response.ok) throw new Error("Couldn't create a connect code.");
      const { code: freshCode } = (await response.json()) as { code: string };
      setCode(freshCode);

      const runtime = window.chrome?.runtime;
      if (runtime?.sendMessage && extensionIds.length > 0) {
        setPhase("trying");
        const attempt = (index: number) => {
          if (index >= extensionIds.length) {
            setPhase("manual");
            return;
          }
          try {
            runtime.sendMessage!(extensionIds[index]!, { type: "tabmind:link", code: freshCode }, (reply) => {
              if (reply?.ok) {
                setEmail(reply.email ?? "");
                setPhase("linked");
              } else {
                attempt(index + 1);
              }
            });
          } catch {
            attempt(index + 1);
          }
        };
        attempt(0);
        // Messaging that never calls back (extension absent) → manual after 2s.
        setTimeout(() => setPhase((p) => (p === "trying" ? "manual" : p)), 2000);
      } else {
        setPhase("manual");
      }
    } catch (e) {
      setPhase("error");
      setError(e instanceof Error ? e.message : "Something went wrong.");
    }
  }, [extensionIds]);

  useEffect(() => {
    void start();
  }, []);

  if (phase === "requesting" || phase === "trying" || phase === "idle") {
    return (
      <div className="mt-8 flex items-center gap-3 text-sm text-ink-secondary">
        <Spinner size={16} />
        {phase === "trying" ? "Reaching the extension…" : "Creating a secure code…"}
      </div>
    );
  }

  if (phase === "linked") {
    return (
      <div className="mt-8 rounded-lg border border-edge bg-raised p-4">
        <p className="text-sm font-medium text-ink">Connected</p>
        <p className="mt-1 text-[0.8125rem] leading-relaxed text-ink-secondary">
          The extension is now linked{email ? ` as ${email}` : ""}. Your workspaces will start syncing
          right away — you can close this tab.
        </p>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="mt-8">
        <p className="text-sm text-danger">{error}</p>
        <Button className="mt-3" onClick={() => void start()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-8 space-y-4">
      <div className="rounded-lg border border-edge bg-raised p-4">
        <p className="text-[0.8125rem] text-ink-secondary">Your connect code — valid for 10 minutes:</p>
        <p className="mt-2 select-all font-mono text-2xl font-semibold tracking-[0.15em] text-ink">{code}</p>
      </div>
      <ol className="list-decimal space-y-1.5 pl-5 text-sm leading-relaxed text-ink-secondary">
        <li>Open the TabMind extension in your browser</li>
        <li>
          Go to <span className="font-medium text-ink">Settings → Account</span>
        </li>
        <li>Paste the code into “Connect code” and hit Connect</li>
      </ol>
      <Button variant="ghost" size="sm" onClick={() => void start()}>
        Generate a new code
      </Button>
    </div>
  );
}
