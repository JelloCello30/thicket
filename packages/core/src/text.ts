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
/**
 * Interface chrome that looks like a proper noun but names no subject. Left in,
 * these fuse unrelated work: two pull requests from different repos both yield
 * the entity "Pull Request" and score as the same topic, and every MDN page
 * shares "Web APIs". A site's own furniture is never what the user is doing.
 */
const BOILERPLATE_ENTITIES = new Set([
  "pull request", "pull requests", "merge request", "issue", "issues", "commit", "commits",
  "web apis", "api reference", "documentation", "docs", "release notes", "changelog",
  "sign in", "log in", "login", "search results", "new tab", "untitled", "home page",
  "dashboard", "settings", "inbox", "notifications", "comments", "discussion", "discussions",
  "google docs", "google drive", "google sheets", "google slides", "google search",
  "terms of service", "privacy policy", "shopping cart", "your account", "my account",
  "product details", "customer reviews", "frequently asked questions",
]);

/**
 * Named entities in a page title. `context` (the site's name and domain) lets
 * the extractor reject the site's own branding — "Amazon.com" is not a topic.
 */
export function extractEntities(title: string, context: { siteName?: string; domain?: string } = {}): string[] {
  const entities: string[] = [];
  const words = title.split(/\s+/);
  const brand = new Set(
    [context.siteName, context.domain?.replace(/\.[a-z.]+$/, "")]
      .filter((v): v is string => Boolean(v))
      .map((v) => v.toLowerCase().replace(/[^a-z0-9]/g, "")),
  );
  const isBrand = (phrase: string): boolean => {
    const flat = phrase.toLowerCase().replace(/[^a-z0-9]/g, "");
    for (const b of brand) if (b.length >= 3 && (flat === b || flat.startsWith(b))) return true;
    return false;
  };
  let run: string[] = [];
  const push = (phrase: string) => {
    if (phrase.length < 3) return;
    if (BOILERPLATE_ENTITIES.has(phrase.toLowerCase())) return;
    if (isBrand(phrase)) return;
    entities.push(phrase);
  };
  const flush = (startIndex: number) => {
    if (run.length === 0) return;
    /**
     * Title-case headlines capitalize their connectives ("Eaton Fire Spreads
     * To Altadena"), so rejecting any run containing a stopword used to throw
     * the whole headline away — two articles about one story then shared no
     * entity at all and read as unrelated. Split at the stopword instead and
     * keep the real noun phrases either side.
     */
    const hasStopword = run.some((w) => STOPWORDS.has(w.toLowerCase()));
    if (!hasStopword) {
      const isSentenceLead = startIndex === 0 && run.length === 1;
      if (!isSentenceLead) {
        // Long runs used to be discarded outright, which silently erased the
        // strongest signal retail and headline titles have: "Breville Barista
        // Express Espresso Machine" produced no entity at all. Truncate
        // instead of rejecting.
        push(run.slice(0, 4).join(" "));
        // A story's or product's subject is the HEAD of its title; the rest is
        // what happened or which variant. Emitting the head is what lets
        // several outlets covering one event, or several retailers listing one
        // product, share an entity and land in one group.
        if (run.length >= 3) push(run.slice(0, 2).join(" "));
      }
      run = [];
      return;
    }
    /**
     * The run contains a connective, so it is a title-case headline rather than
     * a name. Keep only the part BEFORE the first stopword — the subject —
     * and only when it is a real phrase. Fragments after the stopword ("Things"
     * out of "THE 15 BEST Things to Do in Tokyo") are noise, which is why the
     * original code threw such runs away wholesale; the cost of that was that
     * two articles about one event shared no entity at all.
     */
    const head: string[] = [];
    for (const word of run) {
      if (STOPWORDS.has(word.toLowerCase())) break;
      head.push(word);
    }
    if (head.length >= 2) {
      if (head.length <= 4) push(head.join(" "));
      if (head.length >= 3) push(head.slice(0, 2).join(" "));
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
