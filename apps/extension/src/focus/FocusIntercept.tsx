import { useEffect, useState } from "react";
import { Mark } from "@tabmind/ui";
import { getDomain } from "@tabmind/core";
import { sendBg } from "../shared/messages";
import { useTheme } from "../dashboard/state";

/**
 * The gentle wall. Never shamey, never sticky: the task front and center,
 * and four honest ways out — including "actually, this is the work."
 */
export function FocusIntercept() {
  const params = new URLSearchParams(window.location.search);
  const url = params.get("url") ?? "";
  const reason = params.get("reason") ?? "";
  const domain = url ? getDomain(url) : "";

  const [task, setTask] = useState<string>("");
  const [breakMinutes, setBreakMinutes] = useState(5);
  const [theme, setTheme] = useState<"system" | "light" | "dark">("system");
  useTheme(theme);

  useEffect(() => {
    void sendBg({ type: "get-state" }).then((state) => {
      setTask(state.focus?.task ?? "");
      setBreakMinutes(state.prefs.focusBreakMinutes);
      setTheme(state.prefs.theme);
      // Focus ended while this page sat here? Let the navigation through.
      if (!state.focus && url) window.location.replace(url);
    });
  }, [url]);

  const send = (type: string) => {
    void chrome.runtime.sendMessage({ type, url });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-bg px-6 text-ink">
      <div className="w-full max-w-md">
        <Mark size={28} />
        <p className="mt-8 text-[0.8125rem] font-medium uppercase tracking-wider text-ink-faint">
          You're focused on
        </p>
        <h1 className="mt-1 text-2xl font-semibold leading-snug tracking-tight">
          {task || "your task"}
        </h1>
        {reason ? (
          <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-secondary">{reason}.</p>
        ) : null}

        <div className="mt-8 flex flex-col gap-2">
          <button
            onClick={() => send("focus-page:return")}
            className="rounded-md bg-accent px-4 py-2.5 text-[0.9375rem] font-medium text-accent-ink transition-colors hover:bg-accent-hover"
            autoFocus
          >
            Back to what I was doing
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => send("focus-page:allow")}
              className="rounded-md border border-edge-strong bg-raised px-3 py-2 text-[0.8125rem] text-ink transition-colors hover:border-ink/30"
            >
              {domain ? `${domain} is on-task` : "This is on-task"}
            </button>
            <button
              onClick={() => send("focus-page:break")}
              className="rounded-md border border-edge-strong bg-raised px-3 py-2 text-[0.8125rem] text-ink transition-colors hover:border-ink/30"
            >
              {breakMinutes}-minute break
            </button>
          </div>
          <button
            onClick={() => send("focus-page:end")}
            className="mt-1 rounded-md px-3 py-1.5 text-[0.8125rem] text-ink-faint transition-colors hover:text-ink"
          >
            End focus and continue
          </button>
        </div>

        <p className="mt-10 text-[0.75rem] leading-relaxed text-ink-faint">
          TabMind checked this address on your device — nothing about it was sent anywhere.
        </p>
      </div>
    </div>
  );
}
