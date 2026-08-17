import type { AnalyzedTab } from "@thicket/types";

/**
 * Intent lexicons: deterministic vocabulary that links tabs which belong to
 * the same real-world activity even across different sites. This is how a
 * mortgage calculator ends up inside "Apartment Hunt" without any AI call.
 *
 * `strong` words are distinctive enough to establish a theme alone;
 * `weak` words need two hits (or category agreement) to avoid false glue —
 * one mention of "travel" must not drag a camera review into a trip.
 */
export type Theme =
  | "realestate"
  | "travel"
  | "cameras"
  | "laptops"
  | "phones"
  | "desksetup"
  | "jobs"
  | "learning"
  | "cooking"
  | "fitness"
  | "cars"
  | "weddings"
  | "moving"
  | "finance";

interface Lexicon {
  strong: string[];
  weak: string[];
}

const LEXICONS: Record<Theme, Lexicon> = {
  realestate: {
    strong: [
      "apartment", "apartments", "rent", "rental", "rentals", "mortgage", "zestimate",
      "sublet", "condo", "landlord", "realtor", "zillow",
    ],
    weak: [
      "lease", "studio", "bedroom", "bed", "bath", "sqft", "listing", "listings",
      "townhouse", "duplex", "deposit", "roommate", "neighborhood", "escrow",
      "downpayment", "housing", "walkability",
    ],
  },
  travel: {
    strong: [
      "itinerary", "airfare", "roundtrip", "layover", "shinkansen", "ryokan", "onsen",
      "hostel", "hostels", "sightseeing",
    ],
    weak: [
      "flight", "flights", "hotel", "hotels", "trip", "travel", "airline", "airport",
      "visa", "vacation", "resort", "luggage", "passport", "rail", "jr", "nonstop",
      "attractions", "restaurants",
    ],
  },
  cameras: {
    strong: ["mirrorless", "dslr", "a7", "a7iv", "x100", "megapixel", "autofocus", "viewfinder", "cameras"],
    weak: [
      "camera", "lens", "lenses", "sensor", "aperture", "sony", "canon",
      "nikon", "fujifilm", "fuji", "lumix", "photography", "photo",
    ],
  },
  laptops: {
    strong: ["macbook", "thinkpad", "ultrabook", "chromebook", "xps"],
    weak: ["laptop", "laptops", "ram", "ssd", "cpu", "gpu", "m3", "m4", "battery", "notebook"],
  },
  phones: {
    strong: ["iphone", "pixel", "galaxy", "smartphone"],
    weak: ["phone", "android", "ios", "case"],
  },
  desksetup: {
    strong: ["ultrawide", "keycaps", "ergonomic"],
    weak: [
      "desk", "monitor", "monitors", "keyboard", "keyboards", "mouse", "chair",
      "standing", "webcam", "dock", "mechanical", "switches", "setup",
    ],
  },
  jobs: {
    strong: ["resume", "recruiter", "hiring", "salaries"],
    weak: [
      "job", "jobs", "salary", "interview", "interviews", "cv", "career", "careers",
      "offer", "apply", "application", "openings",
    ],
  },
  learning: {
    strong: ["tutorial", "tutorials", "course", "courses", "bootcamp", "certification"],
    weak: ["learn", "learning", "lesson", "lessons", "syllabus"],
  },
  cooking: {
    strong: ["recipe", "recipes", "sourdough", "airfryer"],
    weak: ["cook", "cooking", "baking", "ingredients", "meal", "dinner", "oven"],
  },
  fitness: {
    strong: ["workout", "workouts", "marathon", "5k"],
    weak: ["gym", "training", "protein", "yoga", "stretching", "running", "reps"],
  },
  cars: {
    strong: ["carfax", "dealership", "suv", "sedan"],
    weak: ["car", "cars", "ev", "tesla", "toyota", "honda", "mileage", "msrp"],
  },
  weddings: {
    strong: ["bridal", "groom", "registry", "honeymoon", "caterer", "florist"],
    weak: ["wedding", "venue", "venues", "invitations"],
  },
  moving: {
    strong: ["movers", "uhaul", "relocation"],
    weak: ["moving", "storage", "boxes"],
  },
  finance: {
    strong: ["401k", "roth", "ira", "refinance", "apr"],
    weak: ["budget", "savings", "invest", "investing", "tax", "taxes", "credit", "apy"],
  },
};

/** Title phrases that establish a theme outright. */
const PHRASE_RULES: [RegExp, Theme][] = [
  [/things to do|places to (eat|visit|stay|see)|day trips?|where to (eat|stay)|best (restaurants|cafes|bars) in/i, "travel"],
  [/where to live|apartment hunting|house hunting|first apartment/i, "realestate"],
  [/(which|best) camera should/i, "cameras"],
  [/cover letter|interview (prep|questions)/i, "jobs"],
];

const CATEGORY_THEMES: Partial<Record<AnalyzedTab["category"], Theme>> = {
  realestate: "realestate",
  travel: "travel",
  jobs: "jobs",
  learning: "learning",
};

/**
 * Themes a site category can assert on its own. Two of these on one tab are
 * rival claims about what the user is doing, so the loser needs real evidence.
 */
const ANCHORED_THEMES = new Set<Theme>(Object.values(CATEGORY_THEMES));

const strongIndex = new Map<string, Theme[]>();
const weakIndex = new Map<string, Theme[]>();
for (const [theme, lex] of Object.entries(LEXICONS) as [Theme, Lexicon][]) {
  for (const w of lex.strong) {
    const arr = strongIndex.get(w) ?? [];
    arr.push(theme);
    strongIndex.set(w, arr);
  }
  for (const w of lex.weak) {
    const arr = weakIndex.get(w) ?? [];
    arr.push(theme);
    weakIndex.set(w, arr);
  }
}

/**
 * Themes a tab holds on VOCABULARY evidence — its title actually says so.
 * Kept separate from category-derived themes because pairScore must not pay
 * for the same fact twice: two travel sites already score a same-category
 * bonus, and adding a "shared travel theme" on top of it reached 0.53 — over
 * the union bar — with no evidence the two trips are the same trip.
 */
export function tabEvidenceThemes(tab: Pick<AnalyzedTab, "tokens" | "category" | "title">): Set<Theme> {
  const all = tabThemes(tab);
  const catTheme = CATEGORY_THEMES[tab.category];
  if (catTheme && !hasVocabularyEvidence(tab, catTheme)) all.delete(catTheme);
  return all;
}

function hasVocabularyEvidence(tab: Pick<AnalyzedTab, "tokens" | "title">, theme: Theme): boolean {
  for (const token of new Set(tab.tokens)) {
    if ((strongIndex.get(token) ?? []).includes(theme)) return true;
    if ((weakIndex.get(token) ?? []).includes(theme)) return true;
  }
  for (const [pattern, phraseTheme] of PHRASE_RULES) {
    if (phraseTheme === theme && pattern.test(tab.title)) return true;
  }
  return false;
}

/** Themes present in a tab, from category + title/query vocabulary. */
export function tabThemes(tab: Pick<AnalyzedTab, "tokens" | "category" | "title">): Set<Theme> {
  const themes = new Set<Theme>();
  const catTheme = CATEGORY_THEMES[tab.category];
  if (catTheme) themes.add(catTheme);

  const strongHits = new Map<Theme, number>();
  const weakHits = new Map<Theme, number>();
  for (const token of new Set(tab.tokens)) {
    for (const t of strongIndex.get(token) ?? []) strongHits.set(t, (strongHits.get(t) ?? 0) + 1);
    for (const t of weakIndex.get(token) ?? []) weakHits.set(t, (weakHits.get(t) ?? 0) + 1);
  }
  const all = new Set<Theme>([...strongHits.keys(), ...weakHits.keys()]);
  for (const theme of all) {
    const strong = strongHits.get(theme) ?? 0;
    const weak = weakHits.get(theme) ?? 0;
    /**
     * A site whose own category already names its activity must not pick up a
     * RIVAL activity theme from one loose word. "Los Angeles vacation rentals"
     * on Airbnb is travel, not an apartment hunt — but "rentals" is a strong
     * realestate word, and that single token used to bridge someone's trip
     * into their housing search and fuse two unrelated groups.
     *
     * Only anchored themes (the ones a site category can assert) compete this
     * way; a finance site keeping a realestate theme from "Rent Calculator" is
     * still exactly right, because finance asserts no rival activity.
     */
    const rivalsCategory =
      catTheme != null &&
      theme !== catTheme &&
      ANCHORED_THEMES.has(theme) &&
      ANCHORED_THEMES.has(catTheme);
    const strongBar = rivalsCategory ? 2 : 1;
    const weakBar = rivalsCategory ? 3 : 2;
    if (strong >= strongBar || weak >= weakBar || (weak >= 1 && catTheme === theme)) themes.add(theme);
  }

  for (const [pattern, theme] of PHRASE_RULES) {
    if (pattern.test(tab.title)) themes.add(theme);
  }
  return themes;
}

/** Human label for a theme, used in group naming. */
export const THEME_LABELS: Record<Theme, string> = {
  realestate: "Apartment Hunt",
  travel: "Trip Planning",
  cameras: "Camera Research",
  laptops: "Laptop Research",
  phones: "Phone Research",
  desksetup: "Desk Setup",
  jobs: "Job Search",
  learning: "Learning",
  cooking: "Cooking",
  fitness: "Fitness",
  cars: "Car Research",
  weddings: "Wedding Planning",
  moving: "Moving",
  finance: "Finances",
};
