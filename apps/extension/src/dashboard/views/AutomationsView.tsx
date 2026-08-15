import { useState } from "react";
import { describeRule, VALID_ACTIONS, type AutomationRule } from "@tabmind/core";
import { Button, EmptyState, Switch } from "@tabmind/ui";
import type { RuleActivityEntry } from "../../shared/storage";
import { formatRelative } from "../state";

type ConditionType = AutomationRule["condition"]["type"];
type ActionType = AutomationRule["action"]["type"];

const CONDITION_LABELS: Record<ConditionType, string> = {
  "group-stale": "a group is untouched for…",
  "duplicates-exist": "duplicate tabs appear",
  "tab-count-over": "open tabs exceed…",
};

const ACTION_LABELS: Record<ActionType, string> = {
  "archive-group": "save it and close its tabs",
  "save-group": "save it as a workspace",
  "collapse-group": "collapse it",
  "close-duplicates": "close the extras",
  "collapse-stale": "collapse stale groups",
};

const HOUR_CHOICES = [
  { label: "6 hours", value: 6 },
  { label: "a day", value: 24 },
  { label: "3 days", value: 72 },
  { label: "a week", value: 168 },
];

/**
 * Automations: a curated "When … , do …" builder. Every automated close
 * goes through the same undo pipeline as a manual one — the activity log
 * has an Undo button right there.
 */
export function AutomationsView({
  rules,
  activity,
  onAdd,
  onToggle,
  onDelete,
  onUndo,
}: {
  rules: AutomationRule[];
  activity: RuleActivityEntry[];
  onAdd: (condition: AutomationRule["condition"], action: AutomationRule["action"]) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onDelete: (id: string) => void;
  onUndo: (batchId: string) => void;
}) {
  const [conditionType, setConditionType] = useState<ConditionType>("group-stale");
  const [hours, setHours] = useState(72);
  const [count, setCount] = useState(60);
  const [nameQuery, setNameQuery] = useState("");
  const validActions = VALID_ACTIONS[conditionType];
  const [actionType, setActionType] = useState<ActionType>(validActions[0]!);
  const effectiveAction = validActions.includes(actionType) ? actionType : validActions[0]!;

  const add = () => {
    const condition: AutomationRule["condition"] =
      conditionType === "group-stale"
        ? { type: "group-stale", hours, ...(nameQuery.trim() ? { nameQuery: nameQuery.trim() } : {}) }
        : conditionType === "duplicates-exist"
          ? { type: "duplicates-exist" }
          : { type: "tab-count-over", count };
    onAdd(condition, { type: effectiveAction });
    setNameQuery("");
  };

  return (
    <div className="max-w-2xl">
      <div className="mb-6 flex items-baseline justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight text-ink">Automations</h1>
          <p className="mt-0.5 text-[0.8125rem] text-ink-secondary">
            Rules run on your device after each analysis. Closes are always undoable.
          </p>
        </div>
      </div>

      {/* Builder */}
      <div className="rounded-lg border border-edge bg-raised p-4" data-help="automation-builder">
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
          <span className="text-ink-secondary">When</span>
          <select
            value={conditionType}
            onChange={(e) => setConditionType(e.target.value as ConditionType)}
            className="rounded-md border border-edge-strong bg-raised px-2 py-1.5 text-[0.8125rem] text-ink"
            aria-label="Condition"
          >
            {(Object.keys(CONDITION_LABELS) as ConditionType[]).map((key) => (
              <option key={key} value={key}>
                {CONDITION_LABELS[key]}
              </option>
            ))}
          </select>
          {conditionType === "group-stale" ? (
            <select
              value={hours}
              onChange={(e) => setHours(Number(e.target.value))}
              className="rounded-md border border-edge-strong bg-raised px-2 py-1.5 text-[0.8125rem] text-ink"
              aria-label="Inactivity window"
            >
              {HOUR_CHOICES.map((choice) => (
                <option key={choice.value} value={choice.value}>
                  {choice.label}
                </option>
              ))}
            </select>
          ) : null}
          {conditionType === "tab-count-over" ? (
            <select
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="rounded-md border border-edge-strong bg-raised px-2 py-1.5 text-[0.8125rem] text-ink"
              aria-label="Tab count threshold"
            >
              {[40, 60, 80, 100].map((n) => (
                <option key={n} value={n}>
                  {n} tabs
                </option>
              ))}
            </select>
          ) : null}
          <span className="text-ink-secondary">, then</span>
          <select
            value={effectiveAction}
            onChange={(e) => setActionType(e.target.value as ActionType)}
            className="rounded-md border border-edge-strong bg-raised px-2 py-1.5 text-[0.8125rem] text-ink"
            aria-label="Action"
          >
            {validActions.map((key) => (
              <option key={key} value={key}>
                {ACTION_LABELS[key]}
              </option>
            ))}
          </select>
          <Button size="sm" variant="primary" onClick={add} className="ml-auto">
            Add rule
          </Button>
        </div>
        {conditionType === "group-stale" ? (
          <input
            value={nameQuery}
            onChange={(e) => setNameQuery(e.target.value)}
            placeholder="Only groups matching… (optional, e.g. “shopping”)"
            className="mt-2.5 w-full max-w-xs rounded-md border border-edge bg-raised px-2.5 py-1.5 text-[0.8125rem] text-ink placeholder:text-ink-faint"
            aria-label="Optional group name filter"
          />
        ) : null}
      </div>

      {/* Rules */}
      {rules.length === 0 ? (
        <EmptyState
          title="No rules yet"
          body="Try one: “When a group is untouched for 3 days, save it and close its tabs.” Your browser stays tidy without you touching it."
        />
      ) : (
        <ul className="mt-5 space-y-2">
          {rules.map((rule) => (
            <li
              key={rule.id}
              className="group flex items-center gap-3 rounded-lg border border-edge bg-raised px-3.5 py-2.5"
            >
              <Switch
                checked={rule.enabled}
                onChange={(enabled) => onToggle(rule.id, enabled)}
                aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
              />
              <p className="min-w-0 flex-1 text-sm text-ink">{describeRule(rule)}</p>
              {rule.runsCount ? (
                <span className="shrink-0 text-[0.75rem] tabular-nums text-ink-faint">
                  ran {rule.runsCount}×
                </span>
              ) : null}
              <button
                onClick={() => onDelete(rule.id)}
                className="shrink-0 rounded px-1.5 py-0.5 text-[0.8125rem] text-ink-faint opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Activity */}
      {activity.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-2 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">
            Recent activity
          </h2>
          <ul className="space-y-1">
            {activity.map((entry, index) => (
              <li
                key={`${entry.at}-${index}`}
                className="flex items-center gap-3 rounded-md px-1.5 py-1.5 text-[0.8125rem] hover:bg-sunken"
              >
                <span className="min-w-0 flex-1 truncate text-ink-secondary">{entry.description}</span>
                <span className="shrink-0 text-[0.75rem] tabular-nums text-ink-faint">
                  {formatRelative(entry.at)}
                </span>
                {entry.undoBatchId ? (
                  <button
                    onClick={() => onUndo(entry.undoBatchId!)}
                    className="shrink-0 text-[0.8125rem] font-medium text-accent hover:underline underline-offset-2"
                  >
                    Undo
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
