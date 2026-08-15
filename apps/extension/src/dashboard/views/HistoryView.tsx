import { useEffect, useState } from "react";
import type { UiState } from "../../shared/messages";
import { Button, EmptyState, Favicon } from "@tabmind/ui";
import { formatRelative, useFavicon } from "../state";

/** Recently closed with TabMind — the "nothing is ever lost" screen. */
export function HistoryView({
  state,
  onReopen,
  onUndoBatch,
  onForget,
  onClear,
}: {
  state: UiState;
  onReopen: (url: string) => void;
  onUndoBatch: (batchId: string) => void;
  onForget: (url: string) => void;
  onClear: () => void;
}) {
  const favicon = useFavicon();
  const { recentlyClosed, closedBatches } = state;
  const [confirmClear, setConfirmClear] = useState(false);
  useEffect(() => {
    if (!confirmClear) return;
    const timer = setTimeout(() => setConfirmClear(false), 4000);
    return () => clearTimeout(timer);
  }, [confirmClear]);

  if (recentlyClosed.length === 0 && closedBatches.length === 0) {
    return (
      <EmptyState
        title="Nothing closed yet"
        body="When TabMind closes tabs for you, they land here — one click brings anything back."
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end">
        {confirmClear ? (
          <span className="flex items-center gap-2">
            <span className="text-[0.8125rem] text-ink-secondary">
              Forgets every closed tab and TabMind's page memory
              {state.auth ? ", here and on your account" : ""}. Sure?
            </span>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setConfirmClear(false);
                onClear();
              }}
            >
              Clear everything
            </Button>
          </span>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => setConfirmClear(true)}>
            Clear history…
          </Button>
        )}
      </div>

      {closedBatches.length > 0 ? (
        <section>
          <h2 className="mb-2 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">
            Recent closes
          </h2>
          <ul className="space-y-1.5">
            {closedBatches.map((batch) => (
              <li
                key={batch.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-edge bg-raised px-3.5 py-2"
              >
                <span className="min-w-0 truncate text-[0.8125rem] text-ink">
                  {batch.label} · {batch.tabs.length} {batch.tabs.length === 1 ? "tab" : "tabs"}
                </span>
                <span className="shrink-0 text-[0.75rem] text-ink-faint">{formatRelative(batch.at)}</span>
                <Button size="sm" onClick={() => onUndoBatch(batch.id)}>
                  Reopen all
                </Button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">
          Recently closed
        </h2>
        <ul>
          {recentlyClosed.map((record) => (
            <li
              key={`${record.url}-${record.closedAt}`}
              className="group/row flex items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-sunken"
            >
              <Favicon domain={record.domain} src={favicon(record.url)} size={16} />
              <button
                onClick={() => onReopen(record.url)}
                className="min-w-0 flex-1 truncate text-left text-[0.8125rem] text-ink hover:text-accent"
              >
                {record.title}
              </button>
              {record.groupName ? (
                <span className="shrink-0 text-[0.75rem] text-ink-faint">{record.groupName}</span>
              ) : null}
              <span className="w-16 shrink-0 text-right text-[0.75rem] tabular-nums text-ink-faint">
                {formatRelative(record.closedAt)}
              </span>
              <button
                aria-label={`Forget ${record.title}`}
                title="Forget this page — removed from history and search, everywhere"
                onClick={() => onForget(record.url)}
                className="invisible shrink-0 rounded p-1 text-ink-faint hover:text-ink focus-visible:visible group-hover/row:visible"
              >
                <svg width="11" height="11" viewBox="0 0 10 10" fill="none" aria-hidden>
                  <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
