import type { UiState } from "../../shared/messages";
import { EmptyState } from "@thicket/ui";
import { GroupSection } from "../components/GroupSection";

export function NowView({
  state,
  busy,
  actions,
}: {
  state: UiState;
  busy: string | null;
  actions: {
    focusTab: (tabId: number) => void;
    focusGroup: (groupId: string) => void;
    save: (groupId: string) => void;
    close: (groupId: string, save: boolean) => void;
    rename: (groupId: string, name: string) => void;
    summarize: (groupId: string) => void;
    compare: (groupId: string) => void;
    moveTab: (tabId: number, toGroupId: string) => void;
    merge: (from: string, into: string) => void;
    cleanup: () => void;
  };
}) {
  const analysis = state.analysis;
  const prefs = state.prefs;
  const groups = (analysis?.groups ?? []).filter((g) => {
    if (g.isCatchAll) return prefs.showCatchAll;
    if (g.isStale && g.kind === "stale") return prefs.showStalePile;
    return true;
  });
  const realGroups = groups.filter((g) => !g.isCatchAll && !g.isStale);
  const totalTabs = analysis?.totalTabs ?? 0;

  if (state.prefs.paused) {
    return (
      <EmptyState
        title="Thicket is paused"
        body="Nothing is being observed or organized. Resume from Settings whenever you're ready."
      />
    );
  }

  if (!analysis || totalTabs === 0) {
    return (
      <EmptyState
        title="No tabs yet"
        body="Open a few tabs and Thicket will start making sense of them."
      />
    );
  }

  if (groups.length === 0) {
    return (
      <EmptyState
        title="Nothing to organize yet"
        body="Open a few tabs and Thicket will start making sense of them."
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <p className="text-sm text-ink-secondary">
          {totalTabs} {totalTabs === 1 ? "tab" : "tabs"} open ·{" "}
          {realGroups.length === 0
            ? "nothing clearly grouped yet"
            : `${realGroups.length} ${realGroups.length === 1 ? "thing" : "things"} you're working on`}
        </p>
        <button
          data-help="cleanup"
          onClick={actions.cleanup}
          className="text-[0.8125rem] font-medium text-accent hover:underline underline-offset-2"
        >
          Clear the noise
        </button>
      </div>
      <div className="border-t border-edge">
        {groups.map((group, index) => (
          <GroupSection
            key={group.id}
            helpAnchor={index === 0}
            compact={prefs.density === "compact"}
            defaultExpanded={prefs.expandGroups}
            group={group}
            analysis={analysis}
            busy={busy}
            saved={Boolean(group.savedWorkspaceId)}
            onFocusTab={actions.focusTab}
            onFocusGroup={actions.focusGroup}
            onSave={actions.save}
            onClose={actions.close}
            onRename={actions.rename}
            onSummarize={actions.summarize}
            onCompare={actions.compare}
            onMoveTab={actions.moveTab}
            onMerge={actions.merge}
          />
        ))}
      </div>
    </div>
  );
}
