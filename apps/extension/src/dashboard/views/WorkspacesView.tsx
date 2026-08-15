import { useState } from "react";
import type { WorkspaceData } from "@tabmind/types";
import { Button, EmptyState, Favicon, GroupDot, cn } from "@tabmind/ui";
import { formatRelative, useFavicon } from "../state";

export function WorkspacesView({
  workspaces,
  archived,
  onRestore,
  onArchive,
  onDelete,
  onRename,
  onOpenUrl,
  busy,
}: {
  workspaces: WorkspaceData[];
  archived: boolean;
  onRestore: (id: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onOpenUrl: (url: string) => void;
  busy: string | null;
}) {
  const list = workspaces
    .filter((w) => (archived ? w.state === "archived" : w.state === "active"))
    .sort((a, b) => b.lastActiveAt - a.lastActiveAt);

  if (list.length === 0) {
    return archived ? (
      <EmptyState title="Nothing archived" body="Workspaces you archive will wait here, out of the way." />
    ) : (
      <EmptyState
        title="No saved workspaces yet"
        body="Save a group from the Now screen and it will survive long after the tabs are closed."
      />
    );
  }

  return (
    <ul className="space-y-2.5">
      {list.map((workspace) => (
        <WorkspaceRow
          key={workspace.id}
          workspace={workspace}
          archived={archived}
          onRestore={onRestore}
          onArchive={onArchive}
          onDelete={onDelete}
          onRename={onRename}
          onOpenUrl={onOpenUrl}
          busy={busy}
        />
      ))}
    </ul>
  );
}

function WorkspaceRow({
  workspace,
  archived,
  onRestore,
  onArchive,
  onDelete,
  onRename,
  onOpenUrl,
  busy,
}: {
  workspace: WorkspaceData;
  archived: boolean;
  onRestore: (id: string) => void;
  onArchive: (id: string, archived: boolean) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, title: string) => void;
  onOpenUrl: (url: string) => void;
  busy: string | null;
}) {
  const favicon = useFavicon();
  const [expanded, setExpanded] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(workspace.title);
  const [confirmDelete, setConfirmDelete] = useState(false);

  return (
    <li className="group rounded-lg border border-edge bg-raised">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        <GroupDot color={workspace.color} />
        {renaming ? (
          <form
            className="flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              onRename(workspace.id, draft);
              setRenaming(false);
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                onRename(workspace.id, draft);
                setRenaming(false);
              }}
              onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
              className="w-full max-w-xs rounded border border-edge-strong bg-raised px-1.5 py-0.5 text-sm font-semibold text-ink outline-none"
              aria-label="Workspace name"
            />
          </form>
        ) : (
          <button
            onClick={() => setExpanded(!expanded)}
            onDoubleClick={() => {
              setDraft(workspace.title);
              setRenaming(true);
            }}
            className="min-w-0 flex-1 truncate text-left text-sm font-semibold text-ink"
            title="Double-click to rename"
          >
            {workspace.title}
          </button>
        )}
        <span className="shrink-0 text-[0.75rem] tabular-nums text-ink-faint">
          {workspace.tabs.length} {workspace.tabs.length === 1 ? "page" : "pages"} · {formatRelative(workspace.lastActiveAt)}
        </span>
        <span className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          <Button size="sm" variant="ghost" onClick={() => onArchive(workspace.id, !archived)}>
            {archived ? "Unarchive" : "Archive"}
          </Button>
          {confirmDelete ? (
            <Button
              size="sm"
              variant="danger"
              onClick={() => onDelete(workspace.id)}
              onBlur={() => setConfirmDelete(false)}
            >
              Really delete?
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
        </span>
        <Button
          size="sm"
          variant="primary"
          loading={busy === `restore:${workspace.id}`}
          onClick={() => onRestore(workspace.id)}
        >
          Restore
        </Button>
      </div>
      {workspace.summary && !expanded ? (
        <p className="truncate px-3.5 pb-2.5 pl-[2.1rem] text-[0.8125rem] text-ink-secondary">{workspace.summary}</p>
      ) : null}
      {expanded ? (
        <ul className="border-t border-edge px-3.5 py-2">
          {workspace.summary ? (
            <p className="mb-2 pl-1 text-[0.8125rem] leading-snug text-ink-secondary">{workspace.summary}</p>
          ) : null}
          {workspace.tabs
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((tab) => (
              <li key={tab.id}>
                <button
                  onClick={() => onOpenUrl(tab.url)}
                  className="flex w-full items-center gap-2.5 rounded px-1 py-1 text-left hover:bg-sunken"
                >
                  <Favicon domain={tab.domain} src={favicon(tab.url)} size={14} />
                  <span className={cn("min-w-0 flex-1 truncate text-[0.8125rem] text-ink")}>{tab.title}</span>
                  <span className="shrink-0 text-[0.75rem] text-ink-faint">{tab.domain}</span>
                </button>
              </li>
            ))}
        </ul>
      ) : null}
    </li>
  );
}
