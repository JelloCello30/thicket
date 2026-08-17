import { useEffect, useRef, useState } from "react";
import { Favicon, Kbd, Spinner, cn } from "@thicket/ui";
import type { CommandOutcome, SearchOutcome } from "../../shared/messages";
import { sendBg } from "../../shared/messages";
import { useFavicon } from "../state";

/**
 * ⌘K. One input for everything: search-as-you-type, commands on Enter.
 * Search results are instant and local; commands run through the background.
 */
export function CommandBar({
  open,
  onClose,
  onOutcome,
  aiAvailable,
}: {
  open: boolean;
  onClose: () => void;
  onOutcome: (outcome: CommandOutcome) => void;
  /** Signed in with AI on — free-form asks can escalate to the server. */
  aiAvailable: boolean;
}) {
  const [input, setInput] = useState("");
  const [results, setResults] = useState<SearchOutcome | null>(null);
  const [running, setRunning] = useState(false);
  const [selected, setSelected] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const favicon = useFavicon();

  useEffect(() => {
    if (open) {
      setInput("");
      setResults(null);
      setSelected(0);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    clearTimeout(debounceRef.current);
    const query = input.trim();
    if (query.length < 2) {
      setResults(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const outcome = await sendBg({ type: "search", query, scope: "all" });
        setResults(outcome);
        setSelected(0);
      } catch {
        /* background asleep — Enter still works */
      }
    }, 120);
    return () => clearTimeout(debounceRef.current);
  }, [input, open]);

  const flat = results
    ? [
        ...results.open.map((d) => ({ ...d, section: "Open tabs" })),
        ...results.workspaces.map((d) => ({ ...d, section: "Workspaces" })),
        ...results.history.map((d) => ({ ...d, section: "History" })),
      ]
    : [];

  const runCommand = async () => {
    const value = input.trim();
    if (!value || running) return;
    setRunning(true);
    try {
      const outcome = await sendBg({ type: "command", input: value });
      onOutcome(outcome);
      if (outcome.kind !== "searched") onClose();
      else if (outcome.searchResults) setResults(outcome.searchResults);
    } catch (error) {
      onOutcome({
        kind: "none",
        message: error instanceof Error ? error.message : "That didn't work.",
      });
    } finally {
      setRunning(false);
    }
  };

  const openResult = async (index: number) => {
    const doc = flat[index];
    if (!doc) return;
    if (doc.ref.startsWith("tab:")) {
      await sendBg({ type: "focus-tab", tabId: Number(doc.ref.slice(4)) });
    } else {
      await sendBg({ type: "reopen", url: doc.url });
    }
    onClose();
  };

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" onClick={onClose} aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command bar"
        className="relative w-full max-w-xl overflow-hidden rounded-lg border border-edge bg-raised shadow-lg"
      >
        <div className="flex items-center gap-2.5 border-b border-edge px-3.5">
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" className="shrink-0 text-ink-faint" aria-hidden>
            <circle cx="6.5" cy="6.5" r="4.75" stroke="currentColor" strokeWidth="1.5" />
            <path d="M10.5 10.5L13.5 13.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") onClose();
              else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSelected((s) => Math.min(s + 1, Math.max(flat.length - 1, 0)));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setSelected((s) => Math.max(s - 1, 0));
              } else if (e.key === "Enter") {
                e.preventDefault();
                if (flat.length > 0 && results && !looksLikeCommand(input)) void openResult(selected);
                else void runCommand();
              }
            }}
            placeholder={aiAvailable ? "Ask Thicket or find anything…" : "Search tabs, history, workspaces — or type a command…"}
            aria-label="Search or ask Thicket"
            className="h-12 w-full bg-transparent text-[0.9375rem] text-ink placeholder:text-ink-faint outline-none"
          />
          {running ? <Spinner size={16} className="text-ink-faint" /> : <Kbd>esc</Kbd>}
        </div>

        {flat.length > 0 ? (
          <ul className="max-h-[46vh] overflow-y-auto py-1.5" role="listbox" aria-label="Results">
            {flat.map((doc, index) => {
              const showSection = index === 0 || flat[index - 1]!.section !== doc.section;
              return (
                <li key={`${doc.ref}-${index}`}>
                  {showSection ? (
                    <p className="px-3.5 pb-1 pt-2 text-[0.6875rem] font-medium uppercase tracking-wider text-ink-faint">
                      {doc.section}
                      {doc.section === "History" && results?.semantic ? (
                        <span className="ml-1.5 normal-case tracking-normal text-accent">semantic</span>
                      ) : null}
                    </p>
                  ) : null}
                  <button
                    role="option"
                    aria-selected={index === selected}
                    onMouseEnter={() => setSelected(index)}
                    onClick={() => void openResult(index)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3.5 py-1.5 text-left",
                      index === selected && "bg-sunken",
                    )}
                  >
                    <Favicon domain={doc.domain} src={favicon(doc.url)} size={16} />
                    <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink">{doc.title}</span>
                    {doc.context ? (
                      <span className="shrink-0 text-[0.75rem] text-ink-faint">{doc.context}</span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        ) : input.trim().length >= 2 && results ? (
          <div className="px-3.5 py-4">
            <p className="text-sm text-ink-secondary">
              Nothing in your open tabs, workspaces, or recent history.
            </p>
            <p className="mt-1 text-[0.8125rem] text-ink-faint">
              {aiAvailable ? (
                <>
                  Press <Kbd>↵</Kbd> and Thicket will work out what you meant.
                </>
              ) : (
                "Commands still work on Enter — and signing in adds AI search across everything you've closed."
              )}
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5 px-3.5 py-3">
            {[
              "close tabs I don't need",
              "save everything about this trip",
              "summarize my research",
              "reopen yesterday's tabs",
            ].map((hint) => (
              <button
                key={hint}
                onClick={() => setInput(hint)}
                className="rounded-full border border-edge px-2.5 py-1 text-[0.75rem] text-ink-secondary hover:border-edge-strong hover:text-ink"
              >
                {hint}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const COMMAND_LEADS =
  /^(close|save|keep|restore|reopen|bring|summari|compare|clean|clear|tidy|pause|resume|show|archive|help|find|search|ask|what|why|how|which|who|can|does|is|are)\b/i;

function looksLikeCommand(input: string): boolean {
  return COMMAND_LEADS.test(input.trim());
}
