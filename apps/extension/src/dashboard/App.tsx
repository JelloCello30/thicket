import { useCallback, useEffect, useState } from "react";
import type { CleanupPlan, ComparisonTable, GroupSummary } from "@tabmind/types";
import { Kbd, Lockup, Spinner, ToastViewport, cn, useToasts } from "@tabmind/ui";
import { TIMING } from "@tabmind/config";
import type { CommandOutcome } from "../shared/messages";
import { sendBg } from "../shared/messages";
import { useHashRoute, useTheme, useUiState } from "./state";
import { CommandBar } from "./components/CommandBar";
import { CleanupDialog, CompareDialog, SummaryDialog } from "./components/dialogs";
import { HelpPanel, Spotlight, type HelpStep } from "./components/HelpPanel";
import { AutomationsView } from "./views/AutomationsView";
import { HistoryView } from "./views/HistoryView";
import { NowView } from "./views/NowView";
import { SettingsView } from "./views/SettingsView";
import { WelcomeView } from "./views/WelcomeView";
import { WorkspacesView } from "./views/WorkspacesView";

const NAV = [
  { key: "now", label: "Now" },
  { key: "workspaces", label: "Workspaces" },
  { key: "history", label: "History" },
  { key: "archived", label: "Archived" },
  { key: "automations", label: "Automations" },
] as const;

export function App() {
  const { state, error, refresh } = useUiState();
  const [route, navigate] = useHashRoute();
  const [commandOpen, setCommandOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [helpQuery, setHelpQuery] = useState<string | undefined>(undefined);
  const [tour, setTour] = useState<HelpStep[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [cleanupPlan, setCleanupPlan] = useState<CleanupPlan | null>(null);
  const [summary, setSummary] = useState<{ title: string; data: GroupSummary } | null>(null);
  const [comparison, setComparison] = useState<ComparisonTable | null>(null);
  const { toasts, push, dismiss } = useToasts();
  useTheme(state?.prefs.theme);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCommandOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The popup's "Ask TabMind" row and the global shortcut land here with
  // #/now?cmd=1 — open the bar and clean the address so reloads stay calm.
  useEffect(() => {
    const openIfAsked = () => {
      if (!window.location.hash.includes("?cmd")) return;
      setCommandOpen(true);
      history.replaceState(null, "", window.location.pathname + window.location.hash.split("?")[0]);
    };
    openIfAsked();
    window.addEventListener("hashchange", openIfAsked);
    return () => window.removeEventListener("hashchange", openIfAsked);
  }, []);

  const withUndoToast = useCallback(
    (message: string, undoBatchId: string) => {
      push({
        message,
        duration: TIMING.undoWindow,
        action: {
          label: "Undo",
          onClick: () => {
            void sendBg({ type: "undo-batch", batchId: undoBatchId }).then(refresh);
          },
        },
      });
    },
    [push, refresh],
  );

  const fail = useCallback(
    (e: unknown) => {
      const err = e as Error & { code?: string };
      if (err.code === "auth-required") {
        push({
          message: "Sign in to use AI features.",
          action: { label: "Sign in", onClick: () => window.open(`${state?.appUrl}/login?from=extension`, "_blank") },
        });
      } else if (err.code === "pro-required") {
        push({
          message: err.message,
          action: { label: "See Pro", onClick: () => window.open(`${state?.appUrl}/pricing`, "_blank") },
        });
      } else {
        push({ message: err.message || "Something went wrong." });
      }
    },
    [push, state?.appUrl],
  );

  const handleOutcome = useCallback(
    (outcome: CommandOutcome) => {
      switch (outcome.kind) {
        case "cleanup-plan":
          setCleanupPlan(outcome.cleanupPlan ?? null);
          break;
        case "summarized": {
          const group = state?.analysis?.groups.find((g) => g.id === outcome.groupId);
          if (outcome.summary) setSummary({ title: group?.name ?? "Summary", data: outcome.summary });
          break;
        }
        case "compared":
          setComparison(outcome.comparison ?? null);
          break;
        case "closed":
          if (outcome.undoBatchId) withUndoToast(outcome.message ?? "Closed", outcome.undoBatchId);
          void refresh();
          break;
        case "navigate":
          navigate(outcome.section ?? "now");
          break;
        case "help":
          setHelpQuery(outcome.helpQuery);
          setHelpOpen(true);
          break;
        case "answer":
        case "none":
        case "saved":
        case "restored":
        case "prefs":
          if (outcome.message) push({ message: outcome.message });
          void refresh();
          break;
        default:
          break;
      }
    },
    [navigate, push, refresh, withUndoToast, state],
  );

  const actions = {
    focusTab: (tabId: number) => void sendBg({ type: "focus-tab", tabId }).catch(fail),
    focusGroup: (groupId: string) => void sendBg({ type: "focus-group", groupId }).catch(fail),
    save: (groupId: string) =>
      void sendBg({ type: "save-workspace", groupId })
        .then(({ workspace }) => {
          push({ message: `Saved “${workspace.title}”` });
          void refresh();
        })
        .catch(fail),
    close: (groupId: string, save: boolean) =>
      void sendBg({ type: "close-group", groupId, save })
        .then(({ closedCount, undoBatchId, workspace }) => {
          withUndoToast(
            workspace
              ? `Saved “${workspace.title}” and closed ${closedCount} tabs`
              : `Closed ${closedCount} tabs`,
            undoBatchId,
          );
          void refresh();
        })
        .catch(fail),
    rename: (groupId: string, name: string) =>
      void sendBg({ type: "rename-group", groupId, name }).then(refresh).catch(fail),
    summarize: (groupId: string) => {
      setBusy(`summarize:${groupId}`);
      void sendBg({ type: "summarize-group", groupId })
        .then(({ summary: data }) => {
          const group = state?.analysis?.groups.find((g) => g.id === groupId);
          setSummary({ title: group?.name ?? "Summary", data });
        })
        .catch(fail)
        .finally(() => setBusy(null));
    },
    compare: (groupId: string) => {
      setBusy(`compare:${groupId}`);
      void sendBg({ type: "compare-group", groupId })
        .then(({ comparison: data }) => setComparison(data))
        .catch(fail)
        .finally(() => setBusy(null));
    },
    moveTab: (tabId: number, toGroupId: string) =>
      void sendBg({ type: "move-tab", tabId, toGroupId }).then(refresh).catch(fail),
    merge: (fromGroupId: string, intoGroupId: string) =>
      void sendBg({ type: "merge-groups", fromGroupId, intoGroupId }).then(refresh).catch(fail),
    cleanup: () =>
      void sendBg({ type: "cleanup-plan" })
        .then((plan) => {
          if (plan.candidates.length === 0) push({ message: "Nothing worth cleaning up right now. Nice." });
          else setCleanupPlan(plan);
        })
        .catch(fail),
  };

  const helpActions = {
    navigate,
    openCommandBar: () => setCommandOpen(true),
    runCleanup: () => actions.cleanup(),
    saveFirstGroup: () => {
      const first = state?.analysis?.groups.find((g) => !g.isCatchAll && !g.isStale);
      if (first) actions.save(first.id);
      else push({ message: "No groups to save yet — open a few tabs first." });
    },
    openAccount: () => window.open(`${state?.appUrl}/login?from=extension`, "_blank"),
  };

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 p-8">
        <p className="text-sm text-ink-secondary">{error}</p>
        <button
          onClick={() => void refresh()}
          className="rounded-md border border-edge-strong px-3 py-1.5 text-[0.8125rem] font-medium text-ink hover:border-ink/30"
        >
          Try again
        </button>
      </div>
    );
  }
  if (!state) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner size={20} className="text-ink-faint" />
      </div>
    );
  }

  if (route === "welcome") {
    return (
      <WelcomeView
        state={state}
        onDone={() => {
          void chrome.storage.local.set({ onboarded: true });
          navigate("now");
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r border-edge px-3 py-4">
        <a href="#/now" className="mb-6 px-2">
          <Lockup size={22} />
        </a>
        <nav className="flex flex-col gap-0.5" aria-label="Main">
          {NAV.map((item) => (
            <a
              key={item.key}
              href={`#/${item.key}`}
              aria-current={route === item.key ? "page" : undefined}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-sm",
                route === item.key
                  ? "bg-accent-soft font-medium text-ink"
                  : "text-ink-secondary hover:bg-sunken hover:text-ink",
              )}
            >
              {item.label}
            </a>
          ))}
        </nav>
        <button
          data-help="command"
          onClick={() => setCommandOpen(true)}
          className="mt-4 flex items-center justify-between rounded-md border border-edge px-2.5 py-1.5 text-[0.8125rem] text-ink-faint hover:border-edge-strong hover:text-ink-secondary"
        >
          Search or ask…
          <span className="flex gap-0.5">
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </span>
        </button>
        <div className="mt-auto flex flex-col gap-0.5">
          <button
            onClick={() => {
              setHelpQuery(undefined);
              setHelpOpen(true);
            }}
            className="rounded-md px-2.5 py-1.5 text-left text-sm text-ink-secondary hover:bg-sunken hover:text-ink"
          >
            Help
          </button>
          <a
            href="#/settings"
            aria-current={route === "settings" ? "page" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1.5 text-sm",
              route === "settings"
                ? "bg-accent-soft font-medium text-ink"
                : "text-ink-secondary hover:bg-sunken hover:text-ink",
            )}
          >
            Settings
          </a>
          {state.auth ? (
            <p className="truncate px-2.5 py-1 text-[0.75rem] text-ink-faint">{state.auth.user.email}</p>
          ) : (
            <a
              href="#/settings"
              className="px-2.5 py-1 text-[0.75rem] text-accent hover:underline underline-offset-2"
            >
              Sign in to sync
            </a>
          )}
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-8 py-6">
        <div className="mx-auto max-w-3xl">
          {route === "now" ? <NowView state={state} busy={busy} actions={actions} /> : null}
          {route === "automations" ? (
            <AutomationsView
              rules={state.rules}
              activity={state.ruleActivity}
              onAdd={(condition, action) =>
                void sendBg({ type: "rules-add", condition, action }).then(refresh).catch(fail)
              }
              onToggle={(id, enabled) =>
                void sendBg({ type: "rules-toggle", id, enabled }).then(refresh).catch(fail)
              }
              onDelete={(id) => void sendBg({ type: "rules-delete", id }).then(refresh).catch(fail)}
              onUndo={(batchId) =>
                void sendBg({ type: "undo-batch", batchId })
                  .then(({ reopened }) => {
                    push({ message: `Reopened ${reopened} tabs` });
                    void refresh();
                  })
                  .catch(fail)
              }
            />
          ) : null}
          {route === "workspaces" || route === "archived" ? (
            <WorkspacesView
              workspaces={state.workspaces}
              archived={route === "archived"}
              busy={busy}
              onRestore={(id) => {
                setBusy(`restore:${id}`);
                void sendBg({ type: "restore-workspace", workspaceId: id })
                  .then(({ opened }) => {
                    push({ message: opened > 0 ? `Reopened ${opened} tabs` : "Already open" });
                    void refresh();
                  })
                  .catch(fail)
                  .finally(() => setBusy(null));
              }}
              onArchive={(id, archived) =>
                void sendBg({ type: "set-workspace-state", workspaceId: id, state: archived ? "archived" : "active" })
                  .then(refresh)
                  .catch(fail)
              }
              onDelete={(id) =>
                void sendBg({ type: "delete-workspace", workspaceId: id }).then(refresh).catch(fail)
              }
              onRename={(id, title) =>
                void sendBg({ type: "rename-workspace", workspaceId: id, title }).then(refresh).catch(fail)
              }
              onOpenUrl={(url) => void sendBg({ type: "reopen", url }).catch(fail)}
            />
          ) : null}
          {route === "history" ? (
            <HistoryView
              state={state}
              onReopen={(url) => void sendBg({ type: "reopen", url }).catch(fail)}
              onUndoBatch={(batchId) =>
                void sendBg({ type: "undo-batch", batchId })
                  .then(({ reopened }) => {
                    push({ message: `Reopened ${reopened} tabs` });
                    void refresh();
                  })
                  .catch(fail)
              }
              onForget={(url) =>
                void sendBg({ type: "history-delete", url })
                  .then(() => {
                    push({ message: "Forgotten — removed from history and search." });
                    void refresh();
                  })
                  .catch(fail)
              }
              onClear={() =>
                void sendBg({ type: "history-clear" })
                  .then(() => {
                    push({ message: "History cleared." });
                    void refresh();
                  })
                  .catch(fail)
              }
            />
          ) : null}
          {route === "settings" ? (
            <SettingsView
              state={state}
              linkBusy={busy === "link"}
              onPref={(patch) => void sendBg({ type: "set-prefs", patch }).then(refresh).catch(fail)}
              onExcludeAdd={(domain) => void sendBg({ type: "excluded-add", domain }).then(refresh).catch(fail)}
              onExcludeRemove={(domain) =>
                void sendBg({ type: "excluded-remove", domain }).then(refresh).catch(fail)
              }
              onRequestContent={() =>
                void sendBg({ type: "request-content-permission" })
                  .then(({ granted }) => {
                    if (granted) push({ message: "Page content analysis is on." });
                    void refresh();
                  })
                  .catch(fail)
              }
              onLink={(code) => {
                setBusy("link");
                void sendBg({ type: "link-device", code })
                  .then(({ auth }) => {
                    push({ message: `Connected as ${auth.user.email}` });
                    void refresh();
                  })
                  .catch(fail)
                  .finally(() => setBusy(null));
              }}
              onSignOut={() => void sendBg({ type: "sign-out" }).then(refresh).catch(fail)}
            />
          ) : null}
        </div>
      </main>

      <CommandBar
        open={commandOpen}
        onClose={() => setCommandOpen(false)}
        onOutcome={handleOutcome}
        aiAvailable={Boolean(state.auth) && state.prefs.aiEnabled}
      />
      <CleanupDialog
        plan={cleanupPlan}
        onClose={() => setCleanupPlan(null)}
        onRun={(tabIds) => {
          setCleanupPlan(null);
          void sendBg({ type: "cleanup-run", tabIds })
            .then(({ closedCount, undoBatchId }) => {
              withUndoToast(`Closed ${closedCount} tabs`, undoBatchId);
              void refresh();
            })
            .catch(fail);
        }}
      />
      <SummaryDialog
        title={summary?.title ?? ""}
        summary={summary?.data ?? null}
        onClose={() => setSummary(null)}
        onOpenUrl={(url) => void sendBg({ type: "reopen", url }).catch(fail)}
      />
      <CompareDialog
        comparison={comparison}
        onClose={() => setComparison(null)}
        onOpenUrl={(url) => void sendBg({ type: "reopen", url }).catch(fail)}
      />
      <HelpPanel
        open={helpOpen}
        initialQuery={helpQuery}
        onClose={() => setHelpOpen(false)}
        actions={helpActions}
        onStartTour={(steps) => setTour(steps)}
      />
      {tour ? <Spotlight steps={tour} onDone={() => setTour(null)} navigate={navigate} /> : null}
      <ToastViewport toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
