import { tokenize } from "./text";

export interface SearchDoc {
  /** Opaque ref returned in results (tab id, page id, workspace-tab id…). */
  ref: string;
  title: string;
  url: string;
  domain: string;
  /** Extra searchable context, e.g. workspace title or group name. */
  context?: string;
  /** Recency in ms epoch — newer gets a small boost. */
  lastSeenAt?: number;
}

export interface ScoredDoc extends SearchDoc {
  score: number;
}

/**
 * Lexical search used for open tabs, local history, and as the server-side
 * fallback when embeddings aren't available. Weighted token match with
 * phrase and prefix bonuses — instant and predictable.
 */
export function searchDocs(query: string, docs: SearchDoc[], limit = 20, now = Date.now()): ScoredDoc[] {
  const qTokens = tokenize(query);
  const qLower = query.trim().toLowerCase();
  if (qTokens.length === 0 && qLower.length < 2) return [];

  const scored: ScoredDoc[] = [];
  for (const doc of docs) {
    const title = doc.title.toLowerCase();
    const hay = `${title} ${doc.domain} ${(doc.context ?? "").toLowerCase()}`;
    const hayTokens = new Set(tokenize(hay));
    let score = 0;

    let matched = 0;
    for (const qt of qTokens) {
      if (hayTokens.has(qt)) {
        matched++;
        score += 2;
      } else {
        // Prefix match: "apart" → "apartment"
        for (const ht of hayTokens) {
          if (ht.startsWith(qt) && qt.length >= 3) {
            matched += 0.5;
            score += 1;
            break;
          }
        }
      }
    }
    if (qTokens.length > 0 && matched === 0) continue;
    // Require most tokens to hit for multi-word queries.
    if (qTokens.length >= 2 && matched / qTokens.length < 0.5) continue;

    if (title.includes(qLower)) score += 4;
    if (doc.domain.includes(qLower)) score += 2;
    score += (matched / Math.max(1, qTokens.length)) * 3;

    if (doc.lastSeenAt) {
      const days = (now - doc.lastSeenAt) / 86_400_000;
      score += Math.max(0, 1.5 - days / 20);
    }

    scored.push({ ...doc, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, limit);
}
