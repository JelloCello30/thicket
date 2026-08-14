import type { UiState } from "../../shared/messages";
import { Button, EmptyState, Favicon } from "@tabmind/ui";
import { formatRelative, useFavicon } from "../state";

/** Recently closed with TabMind — the "nothing is ever lost" screen. */
export function HistoryView({
  state,
  onReopen,
  onUndoBatch,
}: {
  state: UiState;
  onReopen: (url: string) => void;
  onUndoBatch: (batchId: string) => void;
}) {
  const favicon = useFavicon();
  const { recentlyClosed, closedBatches } = state;

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
            <li key={`${record.url}-${record.closedAt}`}>
              <button
                onClick={() => onReopen(record.url)}
                className="flex w-full items-center gap-2.5 rounded-md px-1.5 py-1.5 text-left hover:bg-sunken"
              >
                <Favicon domain={record.domain} src={favicon(record.url)} size={16} />
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">{record.title}</span>
                {record.groupName ? (
                  <span className="shrink-0 text-[0.75rem] text-ink-faint">{record.groupName}</span>
                ) : null}
                <span className="w-16 shrink-0 text-right text-[0.75rem] tabular-nums text-ink-faint">
                  {formatRelative(record.closedAt)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
