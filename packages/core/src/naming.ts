import type { AnalyzedTab, GroupKind } from "@tabmind/types";
import { titleCase } from "./text";
import { THEME_LABELS, type Theme } from "./themes";
import type { TabFeatures } from "./similarity";

/**
 * Short, human group names. The bar: something a person would have typed
 * themselves. "Apartment Hunt", "Japan Trip", "Camera Research" — never
 * "AI Generated Group 4" or "Miscellaneous Research Category".
 */

export interface NamingResult {
  name: string;
  kind: GroupKind;
  entity?: string;
  signals: string[];
}

const THEME_KINDS: Partial<Record<Theme, GroupKind>> = {
  realestate: "realestate",
  travel: "travel",
  cameras: "shopping",
  laptops: "shopping",
  phones: "shopping",
  desksetup: "shopping",
  cars: "shopping",
  jobs: "jobs",
  learning: "learning",
  weddings: "project",
  moving: "project",
  cooking: "research",
  fitness: "research",
  finance: "research",
};

function dominant<T>(items: T[]): { value: T; count: number } | null {
  const counts = new Map<T, number>();
  for (const item of items) counts.set(item, (counts.get(item) ?? 0) + 1);
  let best: { value: T; count: number } | null = null;
  for (const [value, count] of counts) {
    if (!best || count > best.count) best = { value, count };
  }
  return best;
}

/** Most common entity across tabs, requiring it to appear in ≥2 tabs. */
function dominantEntity(members: AnalyzedTab[]): string | undefined {
  const counts = new Map<string, { display: string; count: number }>();
  for (const tab of members) {
    const seen = new Set<string>();
    for (const entity of tab.entities) {
      const key = entity.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      const existing = counts.get(key);
      if (existing) existing.count++;
      else counts.set(key, { display: entity, count: 1 });
    }
  }
  let best: { display: string; count: number } | undefined;
  for (const value of counts.values()) {
    if (value.count >= 2 && (!best || value.count > best.count)) best = value;
  }
  // Prefer shorter entities on ties-ish ("Tokyo" over "Tokyo Station Hotel").
  if (best) {
    for (const value of counts.values()) {
      if (
        value.count >= best.count &&
        value.display.length < best.display.length &&
        best.display.toLowerCase().includes(value.display.toLowerCase())
      ) {
        best = value;
      }
    }
  }
  return best?.display;
}

function dominantTheme(features: TabFeatures[]): { theme: Theme; count: number } | null {
  const counts = new Map<Theme, number>();
  for (const f of features) {
    for (const theme of f.themes) counts.set(theme, (counts.get(theme) ?? 0) + 1);
  }
  let best: { theme: Theme; count: number } | null = null;
  for (const [theme, count] of counts) {
    if (!best || count > best.count) best = { theme, count };
  }
  return best && best.count >= Math.max(2, features.length * 0.4) ? best : null;
}

const PLACE_HINT = /land|shire|ville|berg|burg|ton$|tokyo|kyoto|osaka|paris|london|lisbon|rome|berlin|york|angeles|francisco|seattle|austin|denver|portland|chicago|boston|miami|japan|italy|france|spain|mexico|portugal|iceland|hawaii|bali|seoul|taipei|bangkok|vietnam|peru/i;

export function nameCluster(members: AnalyzedTab[], features: TabFeatures[]): NamingResult {
  const signals: string[] = [];
  const entity = dominantEntity(members);
  const theme = dominantTheme(features);
  const domains = members.map((t) => t.domain).filter(Boolean);
  const domDominant = dominant(domains);
  const siteNames = members.map((t) => t.siteName).filter(Boolean);
  const queries = members.map((t) => t.searchQuery).filter((q): q is string => Boolean(q));

  if (domDominant && domDominant.count >= members.length * 0.7 && siteNames[0]) {
    const site = members.find((t) => t.domain === domDominant.value)?.siteName;
    if (site) signals.push(`Mostly ${site}`);
  }
  if (queries.length > 0) signals.push(`From your “${queries[0]}” search`);
  if (entity) signals.push(`All around ${entity}`);

  const kind: GroupKind = theme ? (THEME_KINDS[theme.theme] ?? "research") : inferKindFromCategories(members);

  // Travel: "{Place} Trip" beats the generic label.
  if (theme?.theme === "travel") {
    if (entity && PLACE_HINT.test(entity)) return { name: `${clip(entity)} Trip`, kind: "travel", entity, signals };
    if (entity) return { name: `${clip(entity)} Trip`, kind: "travel", entity, signals };
    return { name: "Trip Planning", kind: "travel", entity, signals };
  }

  if (theme && THEME_LABELS[theme.theme]) {
    const label = THEME_LABELS[theme.theme];
    // "Camera Research" already includes the noun; add the entity when it's a
    // specific model people are comparing ("Sony a7 IV" → keep label simple).
    return { name: label, kind, entity, signals };
  }

  // Work tools cluster: name it after the shared entity (project) when present.
  const workish = members.filter((t) => t.category === "work" || t.category === "docs" || t.category === "dev").length;
  if (workish >= members.length * 0.6) {
    if (entity) return { name: `Work — ${clip(entity)}`, kind: "work", entity, signals };
    return { name: "Work", kind: "work", entity, signals };
  }

  if (entity) return { name: clip(entity), kind, entity, signals };

  if (queries.length > 0) {
    const q = queries[0]!;
    return { name: clip(titleCase(q)), kind: "research", signals };
  }

  if (domDominant && domDominant.count >= members.length * 0.7) {
    const site = members.find((t) => t.domain === domDominant.value)?.siteName ?? domDominant.value;
    return { name: clip(site), kind, signals };
  }

  // Last resort: category label — still human, never "Miscellaneous".
  return { name: kindLabel(kind), kind, signals };
}

function inferKindFromCategories(members: AnalyzedTab[]): GroupKind {
  const cats = dominant(members.map((t) => t.category));
  switch (cats?.value) {
    case "realestate":
      return "realestate";
    case "travel":
      return "travel";
    case "shopping":
      return "shopping";
    case "jobs":
      return "jobs";
    case "learning":
      return "learning";
    case "work":
    case "docs":
    case "dev":
      return "work";
    case "news":
    case "reading":
    case "discussion":
    case "reference":
      return "reading";
    case "media":
      return "media";
    default:
      return "research";
  }
}

function kindLabel(kind: GroupKind): string {
  switch (kind) {
    case "realestate":
      return "Apartment Hunt";
    case "travel":
      return "Trip Planning";
    case "shopping":
      return "Shopping";
    case "work":
      return "Work";
    case "jobs":
      return "Job Search";
    case "learning":
      return "Learning";
    case "reading":
      return "Reading";
    case "media":
      return "Watching";
    default:
      return "Research";
  }
}

function clip(name: string, max = 28): string {
  const trimmed = name.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}
