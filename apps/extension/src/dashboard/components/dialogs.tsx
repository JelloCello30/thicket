import { useState } from "react";
import type { CleanupPlan, ComparisonTable, GroupSummary } from "@tabmind/types";
import { Button, Dialog, Favicon, cn } from "@tabmind/ui";
import { useFavicon } from "../state";

/** Cleanup review: show exactly what closes before anything closes. */
export function CleanupDialog({
  plan,
  onClose,
  onRun,
}: {
  plan: CleanupPlan | null;
  onClose: () => void;
  onRun: (tabIds: number[]) => void;
}) {
  const favicon = useFavicon();
  const [deselected, setDeselected] = useState<Set<number>>(new Set());
  if (!plan) return null;

  const kept = plan.candidates.filter((c) => !deselected.has(c.tabId));
  const reasonLabel: Record<string, string> = {
    duplicate: "Duplicate",
    stale: "Probably done",
    newtab: "Empty tab",
    saved: "Already saved",
  };

  return (
    <Dialog
      open
      onClose={onClose}
      title="Clear the noise"
      width={520}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={kept.length === 0}
            onClick={() => onRun(kept.map((c) => c.tabId))}
            data-autofocus
          >
            Close {kept.length} {kept.length === 1 ? "tab" : "tabs"}
          </Button>
        </>
      }
    >
      <p className="mb-2 text-[0.8125rem] text-ink-secondary">
        Every tab below stays in your history and can be reopened. Uncheck anything you're not sure about.
      </p>
      <ul className="max-h-[40vh] space-y-px overflow-y-auto">
        {plan.candidates.map((candidate) => {
          const off = deselected.has(candidate.tabId);
          return (
            <li key={candidate.tabId}>
              <label
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-md px-1.5 py-1.5 hover:bg-sunken",
                  off && "opacity-45",
                )}
              >
                <input
                  type="checkbox"
                  checked={!off}
                  onChange={() =>
                    setDeselected((prior) => {
                      const next = new Set(prior);
                      if (next.has(candidate.tabId)) next.delete(candidate.tabId);
                      else next.add(candidate.tabId);
                      return next;
                    })
                  }
                  className="h-3.5 w-3.5 accent-[var(--tm-accent)]"
                />
                <Favicon domain={candidate.domain} src={candidate.url ? favicon(candidate.url) : undefined} size={16} />
                <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">
                  {candidate.title || candidate.url}
                </span>
                <span className="shrink-0 rounded-full bg-sunken px-2 py-px text-[0.6875rem] text-ink-secondary">
                  {reasonLabel[candidate.reason]}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

/** AI summary: four short fields, never a wall of text. */
export function SummaryDialog({
  title,
  summary,
  onClose,
  onOpenUrl,
}: {
  title: string;
  summary: GroupSummary | null;
  onClose: () => void;
  onOpenUrl: (url: string) => void;
}) {
  const favicon = useFavicon();
  if (!summary) return null;
  return (
    <Dialog open onClose={onClose} title={title} width={480}>
      <div className="space-y-3.5">
        <p className="text-sm leading-relaxed text-ink">{summary.doing}</p>
        {summary.findings.length > 0 ? (
          <div>
            <h3 className="mb-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">
              Worth knowing
            </h3>
            <ul className="space-y-1">
              {summary.findings.map((finding, i) => (
                <li key={i} className="flex gap-2 text-[0.8125rem] leading-snug text-ink-secondary">
                  <span className="mt-[0.4rem] h-1 w-1 shrink-0 rounded-full bg-ink-faint" aria-hidden />
                  {finding}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {summary.keep.length > 0 ? (
          <div>
            <h3 className="mb-1 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">
              Worth keeping
            </h3>
            <ul className="space-y-0.5">
              {summary.keep.map((item) => (
                <li key={item.url}>
                  <button
                    onClick={() => onOpenUrl(item.url)}
                    className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-sunken"
                  >
                    <Favicon domain={new URL(item.url).hostname} src={favicon(item.url)} size={14} />
                    <span className="min-w-0 truncate text-[0.8125rem] text-ink">{item.title}</span>
                    <span className="ml-auto shrink-0 text-[0.75rem] text-ink-faint">{item.why}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {summary.nextStep ? (
          <p className="rounded-md bg-accent-soft px-3 py-2 text-[0.8125rem] leading-snug text-ink">
            <span className="font-medium text-accent">Next: </span>
            {summary.nextStep}
          </p>
        ) : null}
      </div>
    </Dialog>
  );
}

/** Comparison table. Missing data renders as an em dash — never invented. */
export function CompareDialog({
  comparison,
  onClose,
  onOpenUrl,
}: {
  comparison: ComparisonTable | null;
  onClose: () => void;
  onOpenUrl: (url: string) => void;
}) {
  const favicon = useFavicon();
  if (!comparison) return null;
  return (
    <Dialog open onClose={onClose} title={`Comparing: ${comparison.subject}`} width={720}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-[0.8125rem]">
          <thead>
            <tr className="border-b border-edge-strong text-left">
              <th className="py-1.5 pr-3 font-medium text-ink-faint"> </th>
              {comparison.columns.map((col) => (
                <th key={col.key} className="py-1.5 pr-3 font-medium text-ink-secondary">
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {comparison.rows.map((row) => (
              <tr key={row.url} className="border-b border-edge align-top">
                <td className="max-w-[200px] py-2 pr-3">
                  <button
                    onClick={() => onOpenUrl(row.url)}
                    className="flex items-center gap-2 text-left text-ink hover:text-accent"
                  >
                    <Favicon domain={new URL(row.url).hostname} src={favicon(row.url)} size={14} />
                    <span className="min-w-0 truncate">{row.title}</span>
                  </button>
                </td>
                {comparison.columns.map((col) => (
                  <td key={col.key} className="py-2 pr-3 text-ink-secondary">
                    {row.values[col.key] ?? <span className="text-ink-faint">—</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[0.75rem] text-ink-faint">
        Built only from what's visible in your tabs. Blank cells mean the page didn't say.
      </p>
    </Dialog>
  );
}
