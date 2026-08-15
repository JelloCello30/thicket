import { useState, type DragEvent } from "react";
import type { AnalysisResult, TabGroup } from "@tabmind/types";
import { Button, Favicon, GroupDot, cn } from "@tabmind/ui";
import { formatRelative, useFavicon } from "../state";

/**
 * One group of tabs: dense rows, quiet actions, drag-to-move correction.
 * This is the screen users live in — density over decoration.
 */
export function GroupSection({
  group,
  analysis,
  busy,
  helpAnchor,
  onFocusTab,
  onFocusGroup,
  onSave,
  onClose,
  onRename,
  onSummarize,
  onCompare,
  onMoveTab,
  onMerge,
  saved,
}: {
  group: TabGroup;
  analysis: AnalysisResult;
  busy?: string | null;
  helpAnchor?: boolean;
  onFocusTab: (tabId: number) => void;
  onFocusGroup: (groupId: string) => void;
  onSave: (groupId: string) => void;
  onClose: (groupId: string, save: boolean) => void;
  onRename: (groupId: string, name: string) => void;
  onSummarize: (groupId: string) => void;
  onCompare: (groupId: string) => void;
  onMoveTab: (tabId: number, toGroupId: string) => void;
  onMerge: (fromGroupId: string, intoGroupId: string) => void;
  saved: boolean;
}) {
  const favicon = useFavicon();
  const [expanded, setExpanded] = useState(!group.isStale && !group.isCatchAll);
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const [dropActive, setDropActive] = useState(false);

  const byId = new Map(analysis.tabs.map((t) => [t.tabId, t]));
  const members = group.tabIds
    .map((id) => byId.get(id))
    .filter((t): t is NonNullable<typeof t> => Boolean(t));
  const shoppy = ["shopping", "realestate", "travel"].includes(group.kind);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDropActive(false);
    const tabId = Number(e.dataTransfer.getData("tabmind/tab"));
    const fromGroup = e.dataTransfer.getData("tabmind/from-group");
    if (tabId && fromGroup !== group.id) onMoveTab(tabId, group.id);
    const mergeGroup = e.dataTransfer.getData("tabmind/group");
    if (mergeGroup && mergeGroup !== group.id) onMerge(mergeGroup, group.id);
  };

  return (
    <section
      className={cn(
        "group/section border-b border-edge",
        dropActive && "bg-accent-soft",
      )}
      onDragOver={(e) => {
        e.preventDefault();
        setDropActive(true);
      }}
      onDragLeave={() => setDropActive(false)}
      onDrop={handleDrop}
    >
      <header
        data-help={helpAnchor ? "group" : undefined}
        className="flex items-center gap-2.5 px-1 py-2.5"
        draggable={!group.isStale && !group.isCatchAll}
        onDragStart={(e) => {
          e.dataTransfer.setData("tabmind/group", group.id);
          e.dataTransfer.effectAllowed = "move";
        }}
      >
        <button
          aria-label={expanded ? "Collapse group" : "Expand group"}
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
          className="flex h-5 w-5 items-center justify-center rounded text-ink-faint hover:bg-sunken hover:text-ink"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            className={cn("transition-transform", expanded && "rotate-90")}
            aria-hidden="true"
          >
            <path d="M3.5 2l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <GroupDot color={group.color} />
        {renaming ? (
          <form
            className="flex-1"
            onSubmit={(e) => {
              e.preventDefault();
              onRename(group.id, draft);
              setRenaming(false);
            }}
          >
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={() => {
                onRename(group.id, draft);
                setRenaming(false);
              }}
              onKeyDown={(e) => e.key === "Escape" && setRenaming(false)}
              className="w-full max-w-xs rounded border border-edge-strong bg-raised px-1.5 py-0.5 text-sm font-semibold text-ink outline-none"
              aria-label="Group name"
            />
          </form>
        ) : (
          <button
            className="truncate text-left text-sm font-semibold text-ink hover:underline decoration-ink/25 underline-offset-2"
            onDoubleClick={() => {
              setDraft(group.name);
              setRenaming(true);
            }}
            onClick={() => setExpanded(!expanded)}
            title="Double-click to rename"
          >
            {group.name}
          </button>
        )}
        <span className="text-[0.8125rem] tabular-nums text-ink-faint">{members.length}</span>
        {saved ? (
          <span className="rounded-full bg-accent-soft px-1.5 py-px text-[0.6875rem] font-medium text-accent">
            saved
          </span>
        ) : null}

        <span className="ml-auto hidden shrink-0 items-center gap-1 group-hover/section:flex">
          <HeaderAction label="Show tabs" onClick={() => onFocusGroup(group.id)} />
          {shoppy && members.length >= 2 ? (
            <HeaderAction label="Compare" onClick={() => onCompare(group.id)} loading={busy === `compare:${group.id}`} />
          ) : null}
          <HeaderAction label="Summarize" onClick={() => onSummarize(group.id)} loading={busy === `summarize:${group.id}`} />
          <HeaderAction label={saved ? "Update save" : "Save"} onClick={() => onSave(group.id)} />
          <HeaderAction
            label={group.isStale ? "Archive all" : "Close all"}
            emphasis
            onClick={() => onClose(group.id, !group.isStale)}
          />
        </span>
      </header>

      {group.insight ? (
        <p className="-mt-1 mb-2 flex items-baseline gap-1.5 pl-[3.25rem] pr-4 text-[0.8125rem] leading-snug text-ink-secondary">
          {group.insight.source === "ai" ? (
            <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-accent">insight</span>
          ) : null}
          <span>{group.insight.text}</span>
        </p>
      ) : null}

      {expanded ? (
        <ul className="pb-2">
          {members.map((tab) => (
            <li
              key={tab.tabId}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("tabmind/tab", String(tab.tabId));
                e.dataTransfer.setData("tabmind/from-group", group.id);
                e.dataTransfer.effectAllowed = "move";
              }}
              className="group/tab flex cursor-default items-center gap-2.5 rounded-md py-[0.3rem] pl-[3.25rem] pr-2 hover:bg-sunken"
            >
              <Favicon domain={tab.domain} src={tab.excluded ? undefined : favicon(tab.url)} size={16} />
              <button
                onClick={() => onFocusTab(tab.tabId)}
                className="min-w-0 flex-1 truncate text-left text-[0.8125rem] text-ink hover:text-accent"
                title={tab.excluded ? "Excluded from TabMind" : tab.title}
              >
                {tab.excluded ? <span className="italic text-ink-faint">Private page ({tab.domain || "excluded"})</span> : tab.title}
              </button>
              {tab.pinned ? <span className="text-[0.6875rem] text-ink-faint">pinned</span> : null}
              <span className="hidden w-16 shrink-0 text-right text-[0.75rem] tabular-nums text-ink-faint sm:block">
                {formatRelative(tab.lastAccessed)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function HeaderAction({
  label,
  onClick,
  emphasis,
  loading,
}: {
  label: string;
  onClick: () => void;
  emphasis?: boolean;
  loading?: boolean;
}) {
  return (
    <Button
      size="sm"
      variant={emphasis ? "secondary" : "ghost"}
      loading={loading}
      onClick={onClick}
      className="text-[0.75rem]"
    >
      {label}
    </Button>
  );
}
