import { useEffect, useState } from "react";
import type { UiState } from "../../shared/messages";
import { Button, GroupDot, Mark, Spinner } from "@thicket/ui";

/**
 * First run. No feature tour, no five screens — Thicket's own analysis of
 * the user's real tabs IS the onboarding. Reveal what it found, then get
 * out of the way.
 */
export function WelcomeView({ state, onDone }: { state: UiState; onDone: () => void }) {
  const [phase, setPhase] = useState<"scanning" | "reveal">("scanning");
  const analysis = state.analysis;
  const realGroups = (analysis?.groups ?? []).filter((g) => !g.isCatchAll && !g.isStale);
  const groupedTabs = realGroups.reduce((n, g) => n + g.tabIds.length, 0);
  const leftover = (analysis?.totalTabs ?? 0) - groupedTabs;
  const totalTabs = analysis?.totalTabs ?? 0;

  useEffect(() => {
    // Let the scan moment breathe for a beat, then reveal.
    const t = setTimeout(() => setPhase("reveal"), analysis ? 900 : 1600);
    return () => clearTimeout(t);
  }, [analysis]);

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-lg flex-col items-start justify-center px-6">
      <Mark size={36} />
      {phase === "scanning" || !analysis ? (
        <div className="mt-8 flex items-center gap-3 text-ink-secondary">
          <Spinner size={16} />
          <p className="text-sm">Looking at your open tabs…</p>
        </div>
      ) : (
        <div className="mt-8 w-full">
          <h1 className="text-2xl font-semibold tracking-tight text-ink">
            {totalTabs === 0
              ? "Open a few tabs and come back."
              : realGroups.length === 0
                ? `You have ${totalTabs} ${totalTabs === 1 ? "tab" : "tabs"} open.`
                : `You have ${totalTabs} tabs open. You're actually doing ${spellOut(realGroups.length)} ${realGroups.length === 1 ? "thing" : "things"}.`}
          </h1>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-secondary">
            {realGroups.length === 0
              ? "Thicket organizes tabs as you work — it groups them by what you're doing, remembers everything, and lets you close without losing."
              : "Thicket grouped them by what you're doing. Nothing moved, nothing closed — this is just what your browser looks like, organized."}
          </p>

          {realGroups.length > 0 ? (
            <ul className="mt-6 space-y-2.5">
              {realGroups.map((group, index) => (
                <li
                  key={group.id}
                  className="flex items-center gap-3 rounded-lg border border-edge bg-raised px-4 py-3 opacity-0"
                  style={{
                    animation: `tm-rise 320ms ease-out forwards`,
                    animationDelay: `${140 + Math.min(index, 8) * 110}ms`,
                  }}
                >
                  <GroupDot color={group.color} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{group.name}</span>
                  <span className="text-[0.8125rem] tabular-nums text-ink-faint">
                    {group.tabIds.length} {group.tabIds.length === 1 ? "tab" : "tabs"}
                  </span>
                </li>
              ))}
              {leftover > 0 ? (
                <li className="flex items-center gap-3 px-4 py-2 text-[0.8125rem] text-ink-faint">
                  <span className="h-1.5 w-1.5 rounded-full bg-ink/20" aria-hidden />
                  <span className="min-w-0 flex-1">
                    {leftover} {leftover === 1 ? "tab isn't" : "tabs aren't"} part of anything yet
                  </span>
                </li>
              ) : null}
            </ul>
          ) : null}

          <div className="mt-8 flex items-center gap-3">
            <Button variant="primary" onClick={onDone} data-autofocus className="shrink-0 whitespace-nowrap">
              {realGroups.length > 0 ? "Take me to my tabs" : "Open Thicket"}
            </Button>
            <p className="text-[0.8125rem] text-ink-faint">
              Titles and addresses never leave this device.
            </p>
          </div>
        </div>
      )}
      <style>{`@keyframes tm-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }`}</style>
    </div>
  );
}

function spellOut(n: number): string {
  const words = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
  return words[n] ?? String(n);
}
