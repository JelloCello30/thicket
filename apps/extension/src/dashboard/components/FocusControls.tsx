import { useEffect, useState } from "react";
import type { FocusSessionState, FocusStrictness } from "@tabmind/core";
import { Button, Dialog, Input, cn } from "@tabmind/ui";

const STRICTNESS_COPY: Record<FocusStrictness, { label: string; hint: string }> = {
  gentle: {
    label: "Gentle",
    hint: "Steps in only for known rabbit holes — social, video, forums, news.",
  },
  strict: {
    label: "Strict",
    hint: "Also steps in for anything that doesn't look related to your task.",
  },
  lockdown: {
    label: "Lockdown",
    hint: "Only your task's groups and sites you explicitly allow get through.",
  },
};

/** Start dialog: one input, duration chips, strictness chips, done. */
export function FocusDialog({
  open,
  onClose,
  onStart,
  defaultStrictness,
}: {
  open: boolean;
  onClose: () => void;
  onStart: (task: string, minutes: number | null, strictness: FocusStrictness) => void;
  defaultStrictness: FocusStrictness;
}) {
  const [task, setTask] = useState("");
  const [minutes, setMinutes] = useState<number | null>(50);
  const [strictness, setStrictness] = useState<FocusStrictness>(defaultStrictness);
  useEffect(() => {
    if (open) setStrictness(defaultStrictness);
  }, [open, defaultStrictness]);

  const start = () => {
    if (!task.trim()) return;
    onStart(task.trim(), minutes, strictness);
    setTask("");
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Focus"
      width={420}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!task.trim()} onClick={start}>
            Start focusing
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <label htmlFor="focus-task" className="mb-1.5 block text-[0.8125rem] text-ink-secondary">
          What are you working on?
        </label>
        <Input
          id="focus-task"
          autoFocus
          data-autofocus
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="finish the pricing page copy"
        />
      </form>
      <div className="mt-3 flex items-center gap-1.5">
        {[25, 50, null].map((preset) => (
          <button
            key={String(preset)}
            onClick={() => setMinutes(preset)}
            className={cn(
              "rounded-full border px-3 py-1 text-[0.8125rem] transition-colors",
              minutes === preset
                ? "border-accent bg-accent-soft font-medium text-accent"
                : "border-edge text-ink-secondary hover:border-edge-strong",
            )}
          >
            {preset ? `${preset} min` : "Open-ended"}
          </button>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5">
        {(Object.keys(STRICTNESS_COPY) as FocusStrictness[]).map((level) => (
          <button
            key={level}
            onClick={() => setStrictness(level)}
            className={cn(
              "rounded-full border px-3 py-1 text-[0.8125rem] transition-colors",
              strictness === level
                ? "border-accent bg-accent-soft font-medium text-accent"
                : "border-edge text-ink-secondary hover:border-edge-strong",
            )}
          >
            {STRICTNESS_COPY[level].label}
          </button>
        ))}
      </div>
      <p className="mt-3 text-[0.8125rem] leading-snug text-ink-secondary">
        {STRICTNESS_COPY[strictness].hint} You can override any intercept in one click, and it all
        stays on this device.
      </p>
    </Dialog>
  );
}

/** The active-session bar pinned above the dashboard content. */
export function FocusBar({
  focus,
  minutesLeft,
  onEnd,
}: {
  focus: FocusSessionState;
  minutesLeft: number | null;
  onEnd: () => void;
}) {
  const onBreak = focus.snoozedUntil != null && Date.now() < focus.snoozedUntil;
  return (
    <div className="mb-5 flex items-center gap-3 rounded-lg border border-accent/40 bg-accent-soft px-4 py-2.5">
      <span className="relative flex h-2 w-2 shrink-0">
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full bg-accent",
            !onBreak && "animate-ping opacity-40",
          )}
        />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-accent" />
      </span>
      <p className="min-w-0 flex-1 truncate text-sm text-ink">
        <span className="font-medium">Focusing:</span> {focus.task}
        {onBreak ? <span className="ml-2 text-ink-secondary">· on a break</span> : null}
      </p>
      <span className="shrink-0 text-[0.8125rem] tabular-nums text-ink-secondary">
        {minutesLeft != null ? `${minutesLeft}m left · ` : ""}
        {focus.blockedCount} blocked
      </span>
      <Button size="sm" variant="secondary" onClick={onEnd}>
        End focus
      </Button>
    </div>
  );
}
