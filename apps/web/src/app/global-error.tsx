"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
      void import("@sentry/nextjs").then((Sentry) => Sentry.captureException(error));
    }
    console.error(error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", padding: "4rem 2rem", maxWidth: 480, margin: "0 auto" }}>
        <h1 style={{ fontSize: "1.1rem", fontWeight: 600 }}>Something broke on our side.</h1>
        <p style={{ color: "#5d5a51", marginTop: 8, fontSize: "0.9rem", lineHeight: 1.5 }}>
          Your tabs and workspaces are safe. Try again — if this keeps happening, email
          support@tabmind.app.
        </p>
        <button
          onClick={reset}
          style={{
            marginTop: 16,
            padding: "8px 14px",
            borderRadius: 8,
            border: "1px solid #ccc",
            background: "#fff",
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
