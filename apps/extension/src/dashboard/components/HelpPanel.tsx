import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Dialog, cn } from "@thicket/ui";
import { searchDocs } from "@thicket/core";

/**
 * The help system. Every topic can explain itself, point at the real
 * interface ("Show me"), or just perform the thing ("Do it for me").
 * All local, instant, and honest about what each action will do.
 */

export interface HelpStep {
  /** Matches a data-help attribute in the live UI. */
  anchor: string;
  text: string;
  /** Navigate here first so the anchor exists. */
  route?: string;
}

export interface HelpActions {
  navigate: (route: string) => void;
  openCommandBar: () => void;
  runCleanup: () => void;
  saveFirstGroup: () => void;
  openAccount: () => void;
}

interface HelpTopic {
  id: string;
  title: string;
  keywords: string;
  explain: string;
  steps?: HelpStep[];
  action?: { label: string; run: (actions: HelpActions) => void };
}

const TOPICS: HelpTopic[] = [
  {
    id: "save",
    title: "Save a group for later",
    keywords: "save workspace keep remember store project",
    explain:
      "Hover any group and press Save. The group becomes a workspace — every page in it survives closing the tabs, and comes back with one click from the Workspaces screen.",
    steps: [
      { anchor: "group", text: "Hover a group here — the actions appear on the right.", route: "now" },
    ],
    action: { label: "Save my first group now", run: (a) => a.saveFirstGroup() },
  },
  {
    id: "close",
    title: "Close a group without losing it",
    keywords: "close all tabs safely done finish",
    explain:
      "“Close all” on a group saves it as a workspace first, then closes the tabs. Nothing is lost: undo lives in the toast for 30 seconds, and the whole group stays restorable from Workspaces forever.",
    steps: [{ anchor: "group", text: "Hover a group and pick “Close all”.", route: "now" }],
  },
  {
    id: "restore",
    title: "Bring back something you closed",
    keywords: "restore reopen recover undo closed lost history bring back",
    explain:
      "History keeps everything Thicket has closed — single tabs and whole batches. Reopened tabs go back into the group they came from, not into a loose pile.",
    action: { label: "Open History", run: (a) => a.navigate("history") },
  },
  {
    id: "cleanup",
    title: "Clear the noise",
    keywords: "cleanup clean duplicates stale empty tidy declutter noise",
    explain:
      "Cleanup gathers duplicates, empty tabs, things you're done with, and pages already saved in a workspace. You see the full list first, untick anything, then close the rest in one go — undoable, always.",
    steps: [{ anchor: "cleanup", text: "It lives up here on the Now screen.", route: "now" }],
    action: { label: "Run cleanup now", run: (a) => a.runCleanup() },
  },
  {
    id: "automations",
    title: "Set up an automation",
    keywords: "automation rules automatic archive schedule auto close",
    explain:
      "Rules run quietly after each analysis: “when a group is untouched for 3 days, save it and close its tabs”, “when duplicates appear, close the extras”. Every automated close is undoable from the activity log.",
    steps: [
      { anchor: "automation-builder", text: "Build a rule here — When …, then …", route: "automations" },
    ],
    action: { label: "Open Automations", run: (a) => a.navigate("automations") },
  },
  {
    id: "search",
    title: "Find any page again",
    keywords: "search find command bar lost page article history semantic",
    explain:
      "⌘K opens the command bar. Type words you remember from a page — “rooftop”, “shinkansen” — and it searches your open tabs, saved workspaces, and page history at once. It also takes commands: “close duplicates”, “clean up”, “summarize”.",
    steps: [{ anchor: "command", text: "Or click here — same thing as ⌘K.", route: "now" }],
    action: { label: "Open the command bar", run: (a) => a.openCommandBar() },
  },
  {
    id: "fix-group",
    title: "Fix a wrong group",
    keywords: "move drag rename wrong group merge correct fix",
    explain:
      "Drag a tab onto another group to move it, drag one group header onto another to merge them, and double-click a name to rename. Thicket learns from every correction — the same mistake gets rarer.",
    steps: [{ anchor: "group", text: "Drag rows between groups right here.", route: "now" }],
  },
  {
    id: "exclude",
    title: "Keep a site out of Thicket",
    keywords: "exclude private ignore site domain privacy hide bank",
    explain:
      "Excluded sites are never grouped, never remembered, never sent anywhere. Banks and health portals are excluded automatically; add any domain in Settings → Excluded sites.",
    action: { label: "Open Settings", run: (a) => a.navigate("settings") },
  },
  {
    id: "forget",
    title: "Delete history",
    keywords: "delete history forget clear remove erase page memory wipe",
    explain:
      "Hover any entry in History and click × to forget that page — it disappears from history and from search. “Clear history…” at the top forgets everything at once. Nothing is kept anywhere else, so forgotten really means gone.",
    action: { label: "Open History", run: (a) => a.navigate("history") },
  },
];

export function findHelpTopics(query?: string): HelpTopic[] {
  if (!query?.trim()) return TOPICS;
  const hits = searchDocs(
    query,
    TOPICS.map((t) => ({ ref: t.id, title: `${t.title} ${t.keywords}`, url: "", domain: "" })),
    6,
  );
  const ranked = hits
    .map((h) => TOPICS.find((t) => t.id === h.ref))
    .filter((t): t is HelpTopic => Boolean(t));
  return ranked.length > 0 ? ranked : TOPICS;
}

export function HelpPanel({
  open,
  initialQuery,
  onClose,
  actions,
  onStartTour,
}: {
  open: boolean;
  initialQuery?: string;
  onClose: () => void;
  actions: HelpActions;
  onStartTour: (steps: HelpStep[]) => void;
}) {
  const [query, setQuery] = useState(initialQuery ?? "");
  useEffect(() => setQuery(initialQuery ?? ""), [initialQuery, open]);
  const topics = useMemo(() => findHelpTopics(query), [query]);
  const [openTopic, setOpenTopic] = useState<string | null>(null);

  useEffect(() => {
    // A specific question with one clear best answer? Open it directly.
    if (!open || !initialQuery) return;
    const best = findHelpTopics(initialQuery)[0];
    if (best) setOpenTopic(best.id);
  }, [open, initialQuery]);

  if (!open) return null;
  return (
    <Dialog open onClose={onClose} title="Help" width={480}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="What do you need? e.g. “bring back closed tabs”"
        className="mb-3 w-full rounded-md border border-edge-strong bg-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint outline-none focus-visible:[box-shadow:var(--tm-focus-ring)]"
        aria-label="Search help"
      />
      <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
        {topics.map((topic) => {
          const expanded = openTopic === topic.id;
          return (
            <li key={topic.id} className={cn("rounded-lg border", expanded ? "border-edge bg-sunken/50" : "border-transparent")}>
              <button
                onClick={() => setOpenTopic(expanded ? null : topic.id)}
                className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm font-medium text-ink hover:bg-sunken"
                aria-expanded={expanded}
              >
                {topic.title}
                <span className="text-ink-faint">{expanded ? "–" : "+"}</span>
              </button>
              {expanded ? (
                <div className="px-3 pb-3">
                  <p className="text-[0.8125rem] leading-relaxed text-ink-secondary">{topic.explain}</p>
                  <div className="mt-2.5 flex gap-2">
                    {topic.steps ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          onClose();
                          onStartTour(topic.steps!);
                        }}
                      >
                        Show me
                      </Button>
                    ) : null}
                    {topic.action ? (
                      <Button
                        size="sm"
                        variant="primary"
                        onClick={() => {
                          onClose();
                          topic.action!.run(actions);
                        }}
                      >
                        {topic.action.label}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </Dialog>
  );
}

/* ───────────────────────── Spotlight tour ───────────────────────── */

export function Spotlight({
  steps,
  onDone,
  navigate,
}: {
  steps: HelpStep[];
  onDone: () => void;
  navigate: (route: string) => void;
}) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const step = steps[index];

  const measure = useCallback(() => {
    if (!step) return;
    const el = document.querySelector(`[data-help="${step.anchor}"]`);
    setRect(el ? el.getBoundingClientRect() : null);
    el?.scrollIntoView({ block: "center" });
  }, [step]);

  useEffect(() => {
    if (!step) return;
    if (step.route) navigate(step.route);
    // Let the route render, then find the anchor.
    const t = setTimeout(measure, 120);
    const onResize = () => measure();
    window.addEventListener("resize", onResize);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onDone();
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [step, measure, navigate, onDone]);

  if (!step) return null;
  const pad = 8;
  const tooltipTop = rect ? Math.min(rect.bottom + 14, window.innerHeight - 140) : window.innerHeight / 2;
  const tooltipLeft = rect ? Math.max(16, Math.min(rect.left, window.innerWidth - 336)) : 16;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-label="Guided tour">
      {rect ? (
        <div
          className="absolute rounded-lg transition-all duration-200"
          style={{
            top: rect.top - pad,
            left: rect.left - pad,
            width: rect.width + pad * 2,
            height: rect.height + pad * 2,
            boxShadow: "0 0 0 9999px color-mix(in srgb, var(--tm-ink) 45%, transparent)",
            border: "2px solid var(--tm-accent)",
          }}
        />
      ) : (
        <div className="absolute inset-0 bg-ink/45" onClick={onDone} />
      )}
      <div
        className="absolute w-80 rounded-lg border border-edge bg-raised p-3.5 shadow-lg"
        style={{ top: tooltipTop, left: tooltipLeft }}
      >
        <p className="text-sm leading-relaxed text-ink">
          {rect ? step.text : "This lives on another screen — taking you there…"}
        </p>
        <div className="mt-2.5 flex items-center justify-between">
          <span className="text-[0.75rem] tabular-nums text-ink-faint">
            {index + 1} of {steps.length}
          </span>
          <div className="flex gap-1.5">
            <Button size="sm" variant="ghost" onClick={onDone}>
              Done
            </Button>
            {index < steps.length - 1 ? (
              <Button size="sm" variant="primary" onClick={() => setIndex(index + 1)}>
                Next
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
