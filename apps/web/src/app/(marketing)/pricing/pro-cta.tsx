"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@tabmind/ui";

/**
 * Starts checkout when signed in; routes through login when not. The server
 * enforces entitlements either way — this button is a convenience, not a gate.
 */
export function ProCta() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const start = async () => {
    setBusy(true);
    setNote("");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ interval: "month" }),
      });
      if (response.status === 401) {
        router.push("/login?from=pricing");
        return;
      }
      const body = (await response.json()) as { url?: string; error?: { message?: string } };
      if (!response.ok || !body.url) {
        setNote(body.error?.message ?? "Checkout isn't available right now.");
        setBusy(false);
        return;
      }
      window.location.href = body.url;
    } catch {
      setNote("Couldn't reach the server. Try again in a moment.");
      setBusy(false);
    }
  };

  return (
    <div className="mt-5">
      <Button variant="primary" className="w-full" loading={busy} onClick={() => void start()}>
        Go Pro
      </Button>
      {note ? <p className="mt-2 text-[0.8125rem] text-danger">{note}</p> : null}
    </div>
  );
}
