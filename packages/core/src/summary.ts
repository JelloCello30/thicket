import type { AnalysisResult, AnalyzedTab, ComparisonTable, GroupSummary } from "@tabmind/types";

/**
 * On-device summaries and comparisons. Signed out (or offline), the
 * Summarize/Compare buttons still do something genuinely useful — built only
 * from what's already known locally: titles, domains, activity. Never a
 * guessed fact; missing data stays missing. The AI versions replace these
 * when available.
 */

const PRICE_RE = /\$\s?\d{1,3}(?:,\d{3})*(?:\.\d{2})?/g;

function groupMembers(analysis: AnalysisResult, groupId: string): { name: string; members: AnalyzedTab[]; entity?: string; kind: string } {
  const group = analysis.groups.find((g) => g.id === groupId);
  if (!group) throw new Error("That group is gone — tabs may have changed.");
  const byId = new Map(analysis.tabs.map((t) => [t.tabId, t]));
  const members = group.tabIds
    .map((id) => byId.get(id))
    .filter((t): t is AnalyzedTab => Boolean(t) && !t!.excluded);
  return { name: group.name, members, entity: group.entity, kind: group.kind };
}

function ago(ms: number, now: number): string {
  const minutes = Math.max(0, Math.round((now - ms) / 60_000));
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function pricesIn(members: AnalyzedTab[]): number[] {
  const values: number[] = [];
  for (const tab of members) {
    for (const match of tab.title.match(PRICE_RE) ?? []) {
      const value = Number(match.replace(/[$,\s]/g, ""));
      if (Number.isFinite(value) && value > 0) values.push(value);
    }
  }
  return [...new Set(values)].sort((a, b) => a - b);
}

function fmtPrice(value: number): string {
  return `$${value.toLocaleString("en-US", { maximumFractionDigits: value % 1 ? 2 : 0 })}`;
}

export function localGroupSummary(
  analysis: AnalysisResult,
  groupId: string,
  now = Date.now(),
): GroupSummary {
  const { name, members, kind } = groupMembers(analysis, groupId);

  const domainCounts = new Map<string, number>();
  for (const tab of members) {
    const label = tab.siteName || tab.domain;
    if (label) domainCounts.set(label, (domainCounts.get(label) ?? 0) + 1);
  }
  const topDomains = [...domainCounts.entries()].sort((a, b) => b[1] - a[1]);
  const lastActive = Math.max(0, ...members.map((t) => t.lastAccessed ?? 0));
  const oldest = Math.min(...members.map((t) => t.lastAccessed ?? now));

  const doing = `${members.length} ${members.length === 1 ? "tab" : "tabs"} across ${domainCounts.size} ${
    domainCounts.size === 1 ? "site" : "sites"
  }, last touched ${ago(lastActive, now)}.`;

  const findings: string[] = [];
  if (topDomains.length > 0) {
    findings.push(
      `Mostly ${topDomains
        .slice(0, 3)
        .map(([site, n]) => (n > 1 ? `${site} (${n})` : site))
        .join(", ")}`,
    );
  }
  const prices = pricesIn(members);
  if (prices.length >= 2) {
    findings.push(`Prices in your tabs run ${fmtPrice(prices[0]!)}–${fmtPrice(prices[prices.length - 1]!)}`);
  } else if (prices.length === 1) {
    findings.push(`One price visible: ${fmtPrice(prices[0]!)}`);
  }
  const queries = [...new Set(members.map((t) => t.searchQuery).filter(Boolean))] as string[];
  if (queries.length > 0) {
    findings.push(`Started from ${queries.length === 1 ? "the search" : "searches like"} “${queries[0]}”`);
  }
  if (now - oldest > 36 * 3_600_000 && members.length > 1) {
    findings.push(`The oldest tab here has been open since ${ago(oldest, now)}`);
  }

  const keep = [...members]
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (b.lastAccessed ?? 0) - (a.lastAccessed ?? 0))
    .slice(0, 3)
    .map((tab) => ({
      url: tab.url,
      title: tab.title,
      why: tab.pinned ? "pinned" : "most recent",
    }));

  const comparable = ["shopping", "realestate", "travel"].includes(kind) && members.length >= 2;
  const nextStep = comparable
    ? `Hit Compare to see these ${name.toLowerCase().includes("hunt") ? "candidates" : "options"} side by side.`
    : `Save “${name}” as a workspace and these ${members.length} tabs survive closing.`;

  return { doing, findings, keep, nextStep, source: "local" };
}

export function localComparison(
  analysis: AnalysisResult,
  groupId: string,
  now = Date.now(),
): ComparisonTable {
  const { name, members, entity } = groupMembers(analysis, groupId);
  if (members.length < 2) throw new Error("Comparing needs at least two tabs.");

  const rows = members.map((tab) => {
    const price = tab.title.match(PRICE_RE)?.[0]?.replace(/\s/g, "") ?? null;
    return {
      url: tab.url,
      title: tab.title,
      values: {
        price,
        site: tab.siteName || tab.domain || null,
        seen: tab.lastAccessed ? ago(tab.lastAccessed, now) : null,
      } as Record<string, string | null>,
    };
  });

  return {
    subject: entity ?? name,
    columns: [
      { key: "price", label: "Price" },
      { key: "site", label: "Site" },
      { key: "seen", label: "Last viewed" },
    ],
    rows,
    source: "local",
  };
}
