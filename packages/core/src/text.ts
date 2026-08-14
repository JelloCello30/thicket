/** Title tokenization + lightweight entity extraction. English-leaning, dependency-free. */

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "in", "on", "at", "to", "for", "with",
  "by", "from", "as", "is", "are", "was", "were", "be", "been", "it", "its", "this",
  "that", "these", "those", "you", "your", "my", "our", "we", "i", "me", "how", "what",
  "why", "when", "where", "which", "who", "can", "should", "will", "would", "could",
  "do", "does", "did", "not", "no", "vs", "via", "about", "into", "than", "then",
  "there", "here", "out", "up", "down", "over", "under", "after", "before", "best",
  "top", "new", "get", "make", "made", "using", "use", "guide", "review", "reviews",
  "home", "page", "official", "site", "website", "online", "free", "s",
]);

/** Suffixes sites append to titles: " - Zillow", " | The Verge", " — Medium". */
const TITLE_SEPARATOR = /\s+[|\-–—·:•]\s+/g;

export function stripSiteSuffix(title: string, siteName?: string, domain?: string): string {
  const parts = title.split(TITLE_SEPARATOR);
  if (parts.length <= 1) return title.trim();
  const last = (parts[parts.length - 1] ?? "").trim().toLowerCase();
  const site = siteName?.toLowerCase() ?? "";
  const dom = domain?.toLowerCase().replace(/\.(com|org|net|io|app|co)$/, "") ?? "";
  if (
    (site && (last === site || last.includes(site))) ||
    (dom && last.replace(/[^a-z0-9]/g, "").includes(dom.replace(/[^a-z0-9]/g, ""))) ||
    last.length <= 3
  ) {
    return parts.slice(0, -1).join(" — ").trim();
  }
  return title.trim();
}

export function tokenize(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, "$1 $2") // split camelCase: "JapanTravel" → "Japan Travel"
    .toLowerCase()
    .replace(/['’]/g, "")
    .split(/[^a-z0-9$]+/)
    .filter((t) => t.length >= 2 && t.length <= 30 && !STOPWORDS.has(t));
}

/**
 * Proper-noun-ish entities: runs of Capitalized Words (2+ chars) from the
 * original title, excluding sentence-leading single words that are stopwords
 * when lowercased. "4 Bed Apartment in Silver Lake" → ["Silver Lake"].
 */
export function extractEntities(title: string): string[] {
  const entities: string[] = [];
  const words = title.split(/\s+/);
  let run: string[] = [];
  const flush = (startIndex: number) => {
    if (run.length === 0) return;
    const phrase = run.join(" ");
    const isSentenceLead = startIndex === 0 && run.length === 1;
    // Title-case headlines produce junk runs like "BEST Things" — reject any
    // run built from stopwords.
    const hasStopword = run.some((w) => STOPWORDS.has(w.toLowerCase()));
    if (!isSentenceLead && !hasStopword && phrase.length >= 3 && run.length <= 4) {
      entities.push(phrase);
    }
    run = [];
  };
  let runStart = 0;
  for (let i = 0; i < words.length; i++) {
    const w = (words[i] ?? "").replace(/^[("'[]+|[)"',.!?:;\]]+$/g, "");
    const isCap = /^[A-Z][a-zA-Z0-9''&.-]*$/.test(w) && !/^[A-Z]$/.test(w);
    if (isCap) {
      if (run.length === 0) runStart = i;
      run.push(w);
    } else {
      flush(runStart);
    }
  }
  flush(runStart);
  // Dedupe, keep order.
  return [...new Set(entities)];
}

export function titleCase(text: string): string {
  return text
    .split(/\s+/)
    .map((w) => (w.length > 0 ? w[0]!.toUpperCase() + w.slice(1) : w))
    .join(" ");
}

/** Cosine similarity over token multisets. */
export function tokenCosine(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  const fa = new Map<string, number>();
  const fb = new Map<string, number>();
  for (const t of a) fa.set(t, (fa.get(t) ?? 0) + 1);
  for (const t of b) fb.set(t, (fb.get(t) ?? 0) + 1);
  let dot = 0;
  for (const [t, ca] of fa) {
    const cb = fb.get(t);
    if (cb) dot += ca * cb;
  }
  const magA = Math.sqrt([...fa.values()].reduce((s, c) => s + c * c, 0));
  const magB = Math.sqrt([...fb.values()].reduce((s, c) => s + c * c, 0));
  return dot / (magA * magB);
}

/** Jaccard overlap of two string sets, case-insensitive. */
export function jaccard(a: Iterable<string>, b: Iterable<string>): number {
  const sa = new Set([...a].map((s) => s.toLowerCase()));
  const sb = new Set([...b].map((s) => s.toLowerCase()));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const t of sa) if (sb.has(t)) inter++;
  return inter / (sa.size + sb.size - inter);
}
