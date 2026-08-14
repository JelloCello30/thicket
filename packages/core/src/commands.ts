import type { CommandIntent } from "@tabmind/types";
import { tokenize } from "./text";

export interface CommandContext {
  groups: { id: string; name: string; entity?: string }[];
  workspaces: { id: string; title: string }[];
}

/**
 * Deterministic command grammar. Handles the common commands instantly and
 * locally; anything genuinely free-form falls through to `ask` (AI) or search.
 */
export function parseCommand(raw: string, ctx: CommandContext): CommandIntent {
  const input = raw.trim();
  if (!input) return { type: "unknown", raw };
  const lower = input.toLowerCase();

  // Settings / navigation
  if (/^(open |show |go to )?settings$/.test(lower)) return { type: "open_dashboard", section: "settings" };
  if (/^(open |show |go to )?(history|recently closed)$/.test(lower)) return { type: "open_dashboard", section: "history" };
  if (/^(open |show |go to )?workspaces$/.test(lower)) return { type: "open_dashboard", section: "workspaces" };
  if (/^pause( tabmind)?$/.test(lower)) return { type: "pause" };
  if (/^(resume|unpause)( tabmind)?$/.test(lower)) return { type: "resume" };

  // Cleanup
  if (/^(clean( ?up)?|clear( the)? noise|tidy( up)?|declutter)\b/.test(lower)) return { type: "cleanup" };
  if (/^close (the )?(tabs? )?(i|that i)? ?(probably )?(do?n'?t|don t) need\b/.test(lower)) {
    return { type: "close", target: "stale" };
  }
  if (/\b(close|remove)\b.*\b(duplicates?|dupes?)\b/.test(lower)) return { type: "close", target: "duplicates" };
  if (/\b(close|remove)\b.*\b(stale|old|unused|inactive|done)\b.*\btabs?\b/.test(lower)) {
    return { type: "close", target: "stale" };
  }

  // Close a specific group
  const closeMatch = lower.match(/^close (?:the )?(?:group )?(.+?)(?: group| tabs)?$/);
  if (closeMatch) {
    const group = matchGroup(closeMatch[1]!, ctx);
    if (group) return { type: "close", target: "group", groupId: group.id };
  }

  // Save / keep
  const saveMatch = lower.match(/^(?:save|keep) (?:the )?(?:everything (?:about|related to|for) )?(.+?)(?: group| tabs| workspace)?$/);
  if (saveMatch) {
    const rest = saveMatch[1]!;
    const group = matchGroup(rest, ctx);
    if (group) return { type: "save", target: "group", groupId: group.id };
    return { type: "save", target: "matching", query: rest };
  }

  // Restore / reopen
  const restoreMatch = lower.match(/^(?:restore|reopen|bring back|open) (?:the )?(?:tabs (?:from|for) )?(?:my )?(.+?)(?: workspace| tabs| research)?$/);
  if (restoreMatch && /^(restore|reopen|bring back)/.test(lower)) {
    const ws = matchWorkspace(restoreMatch[1]!, ctx);
    if (ws) return { type: "restore", workspaceId: ws.id };
  }

  // Summarize
  const sumMatch = lower.match(/^summari[sz]e (?:my |the )?(.+?)(?: group| tabs| research)?$/);
  if (sumMatch) {
    const group = matchGroup(sumMatch[1]!, ctx);
    if (group) return { type: "summarize", groupId: group.id };
  }

  // Compare
  const cmpMatch = lower.match(/^compare\b(?: (?:my |the |these ))?(.*?)$/);
  if (cmpMatch != null) {
    const rest = (cmpMatch[1] ?? "").replace(/\b(tabs|group)\b/g, "").trim();
    if (!rest) return { type: "compare" };
    const group = matchGroup(rest, ctx);
    return { type: "compare", groupId: group?.id };
  }

  // Show a group
  const showMatch = lower.match(/^(?:show|focus|open)(?: me)?(?: only)? (?:the )?(?:tabs (?:for|from|relevant to) )?(?:my )?(.+?)(?: group| tabs)?$/);
  if (showMatch) {
    const group = matchGroup(showMatch[1]!, ctx);
    if (group) return { type: "show_group", groupId: group.id };
  }

  // Find / search
  const findMatch = lower.match(/^(?:find|search(?: for)?|where(?:'s| is| was)|look for)\s+(.+)$/);
  if (findMatch) {
    const query = stripFiller(findMatch[1]!);
    const scope: "open" | "history" | "all" = /\b(yesterday|last week|last month|closed|was)\b/.test(lower)
      ? "history"
      : "all";
    return { type: "search", query, scope };
  }

  // Questions → AI
  if (/^(what|why|which|when|how|who|can|does|is|are)\b/.test(lower) || lower.endsWith("?")) {
    return { type: "ask", question: input };
  }

  // A bare group name typed directly
  const direct = matchGroup(lower, ctx);
  if (direct) return { type: "show_group", groupId: direct.id };
  const directWs = matchWorkspace(lower, ctx);
  if (directWs) return { type: "restore", workspaceId: directWs.id };

  // Default: treat it as a search — never a dead end.
  return { type: "search", query: stripFiller(input), scope: "all" };
}

function stripFiller(query: string): string {
  return query
    .replace(/^(that|the|my|those|these)\s+/i, "")
    .replace(/^(tabs?|pages?|article|thing)\s+(about|on|for|with|from)\s+/i, "")
    .trim();
}

function matchGroup(text: string, ctx: CommandContext) {
  return bestMatch(
    text,
    ctx.groups.map((g) => ({ ...g, label: g.entity ? `${g.name} ${g.entity}` : g.name })),
  );
}

function matchWorkspace(text: string, ctx: CommandContext) {
  return bestMatch(text, ctx.workspaces.map((w) => ({ id: w.id, label: w.title })));
}

const TEMPORAL_TOKENS = new Set([
  "yesterday", "yesterdays", "today", "todays", "last", "week", "weeks", "month",
  "months", "tuesday", "monday", "wednesday", "thursday", "friday", "saturday", "sunday",
]);

function bestMatch<T extends { id: string; label: string }>(text: string, items: T[]): T | undefined {
  // Containment, not Jaccard: "apartment" should match "Apartment Hunt" even
  // though the label has extra tokens. Temporal words never count against it.
  const queryTokens = tokenize(text).filter((t) => !TEMPORAL_TOKENS.has(t));
  if (queryTokens.length === 0) return undefined;
  let best: T | undefined;
  let bestScore = 0;
  for (const item of items) {
    const labelTokens = new Set(tokenize(item.label));
    let matched = 0;
    for (const qt of queryTokens) if (labelTokens.has(qt)) matched++;
    let score = matched / queryTokens.length;
    if (item.label.trim().toLowerCase() === text.trim().toLowerCase()) score = 1.5;
    if (score > bestScore || (score === bestScore && best && matched > 0)) {
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    }
  }
  return bestScore >= 0.5 ? best : undefined;
}
