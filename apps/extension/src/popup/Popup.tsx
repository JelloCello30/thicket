import { useEffect, useState } from "react";
import { GroupDot, Lockup, Spinner, Switch } from "@thicket/ui";
import type { UiState } from "../shared/messages";
import { sendBg } from "../shared/messages";
import { useTheme } from "../dashboard/state";

/** The quick glance: top groups, jump-to-group, pause — dashboard for depth. */
export function Popup() {
  const [state, setState] = useState<UiState | null>(null);
  useTheme(state?.prefs.theme);

  useEffect(() => {
    void sendBg({ type: "get-state" }).then(setState).catch(() => setState(null));
  }, []);

  const openDashboard = (section?: string, command?: boolean) => {
    void sendBg({ type: "open-dashboard", section, command }).then(() => window.close());
  };

  if (!state) {
    return (
      <div className="flex h-40 items-center justify-center bg-bg">
        <Spinner size={18} className="text-ink-faint" />
      </div>
    );
  }

  const groups = (state.analysis?.groups ?? []).filter((g) => !g.isCatchAll);
  const shownTabs = groups.reduce((n, g) => n + g.tabIds.length, 0);
  const leftover = (state.analysis?.totalTabs ?? 0) - shownTabs;
  const totalTabs = state.analysis?.totalTabs ?? 0;

  return (
    <div className="bg-bg text-ink">
      <header className="flex items-center justify-between border-b border-edge px-4 py-3">
        <button onClick={() => openDashboard()} aria-label="Open Thicket dashboard">
          <Lockup size={20} textClassName="text-[0.95rem]" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[0.75rem] text-ink-faint">{state.prefs.paused ? "Paused" : `${totalTabs} tabs`}</span>
          <Switch
            checked={!state.prefs.paused}
            onChange={(on) =>
              void sendBg({ type: "set-prefs", patch: { paused: !on } }).then(setState)
            }
            aria-label={state.prefs.paused ? "Resume Thicket" : "Pause Thicket"}
          />
        </div>
      </header>

      <button
        onClick={() => openDashboard("now", true)}
        className="mx-4 mt-3 flex w-[calc(100%-2rem)] items-center justify-between rounded-md border border-edge px-3 py-2 text-left text-[0.8125rem] text-ink-faint hover:border-edge-strong"
      >
        Search your tabs…
        <span className="text-[0.6875rem]">⌘⇧K</span>
      </button>

      <div className="px-2 py-2">
        {state.prefs.paused ? (
          <p className="px-2 py-6 text-center text-[0.8125rem] text-ink-secondary">
            Thicket is paused — nothing is being observed.
          </p>
        ) : groups.length === 0 ? (
          <p className="px-2 py-6 text-center text-[0.8125rem] text-ink-secondary">
            Open a few tabs and Thicket will start making sense of them.
          </p>
        ) : (
          <ul className="max-h-[420px] overflow-y-auto">
            {groups.map((group) => (
              <li key={group.id}>
                <button
                  onClick={() => void sendBg({ type: "focus-group", groupId: group.id }).then(() => window.close())}
                  className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-sunken"
                >
                  <GroupDot color={group.color} />
                  <span className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium">{group.name}</span>
                  <span className="text-[0.75rem] tabular-nums text-ink-faint">{group.tabIds.length}</span>
                </button>
              </li>
            ))}
            {leftover > 0 ? (
              <li className="px-2 py-1.5 text-[0.75rem] text-ink-faint">
                {leftover} more {leftover === 1 ? "tab" : "tabs"} not grouped yet
              </li>
            ) : null}
          </ul>
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-edge px-4 py-2.5">
        <button
          onClick={() => openDashboard("now")}
          className="text-[0.8125rem] font-medium text-accent hover:underline underline-offset-2"
        >
          Open Thicket
        </button>
        <button
          onClick={() => openDashboard("settings")}
          className="text-[0.8125rem] text-ink-secondary hover:text-ink"
        >
          Settings
        </button>
      </footer>
    </div>
  );
}
