import type { SiteCategory } from "@tabmind/types";

/**
 * Curated knowledge about well-known sites. This is a strong deterministic
 * signal that keeps the clusterer fast and predictable before any AI runs.
 */
interface SiteEntry {
  name: string;
  category: SiteCategory;
}

const SITES: Record<string, SiteEntry> = {
  // Real estate
  "zillow.com": { name: "Zillow", category: "realestate" },
  "redfin.com": { name: "Redfin", category: "realestate" },
  "apartments.com": { name: "Apartments.com", category: "realestate" },
  "streeteasy.com": { name: "StreetEasy", category: "realestate" },
  "trulia.com": { name: "Trulia", category: "realestate" },
  "realtor.com": { name: "Realtor.com", category: "realestate" },
  "hotpads.com": { name: "HotPads", category: "realestate" },
  "craigslist.org": { name: "Craigslist", category: "shopping" },
  "padmapper.com": { name: "PadMapper", category: "realestate" },
  "rent.com": { name: "Rent.com", category: "realestate" },
  "zumper.com": { name: "Zumper", category: "realestate" },
  "nerdwallet.com": { name: "NerdWallet", category: "finance" },
  "bankrate.com": { name: "Bankrate", category: "finance" },

  // Travel
  "airbnb.com": { name: "Airbnb", category: "travel" },
  "booking.com": { name: "Booking.com", category: "travel" },
  "expedia.com": { name: "Expedia", category: "travel" },
  "kayak.com": { name: "Kayak", category: "travel" },
  "skyscanner.com": { name: "Skyscanner", category: "travel" },
  "skyscanner.net": { name: "Skyscanner", category: "travel" },
  "hotels.com": { name: "Hotels.com", category: "travel" },
  "tripadvisor.com": { name: "Tripadvisor", category: "travel" },
  "google.com/travel": { name: "Google Travel", category: "travel" },
  "hopper.com": { name: "Hopper", category: "travel" },
  "united.com": { name: "United", category: "travel" },
  "delta.com": { name: "Delta", category: "travel" },
  "aa.com": { name: "American Airlines", category: "travel" },
  "jal.co.jp": { name: "JAL", category: "travel" },
  "ana.co.jp": { name: "ANA", category: "travel" },
  "japan-guide.com": { name: "Japan Guide", category: "travel" },
  "wanderlog.com": { name: "Wanderlog", category: "travel" },
  "rome2rio.com": { name: "Rome2Rio", category: "travel" },
  "seatguru.com": { name: "SeatGuru", category: "travel" },
  "hostelworld.com": { name: "Hostelworld", category: "travel" },
  "vrbo.com": { name: "Vrbo", category: "travel" },

  // Shopping / product research
  "amazon.com": { name: "Amazon", category: "shopping" },
  "bestbuy.com": { name: "Best Buy", category: "shopping" },
  "bhphotovideo.com": { name: "B&H", category: "shopping" },
  "adorama.com": { name: "Adorama", category: "shopping" },
  "newegg.com": { name: "Newegg", category: "shopping" },
  "walmart.com": { name: "Walmart", category: "shopping" },
  "target.com": { name: "Target", category: "shopping" },
  "ebay.com": { name: "eBay", category: "shopping" },
  "etsy.com": { name: "Etsy", category: "shopping" },
  "costco.com": { name: "Costco", category: "shopping" },
  "ikea.com": { name: "IKEA", category: "shopping" },
  "wayfair.com": { name: "Wayfair", category: "shopping" },
  "rtings.com": { name: "RTINGS", category: "shopping" },
  "wirecutter.com": { name: "Wirecutter", category: "shopping" },
  "dpreview.com": { name: "DPReview", category: "shopping" },
  "camelcamelcamel.com": { name: "CamelCamelCamel", category: "shopping" },
  "slickdeals.net": { name: "Slickdeals", category: "shopping" },

  // Dev
  "github.com": { name: "GitHub", category: "dev" },
  "gitlab.com": { name: "GitLab", category: "dev" },
  "stackoverflow.com": { name: "Stack Overflow", category: "dev" },
  "stackexchange.com": { name: "Stack Exchange", category: "dev" },
  "npmjs.com": { name: "npm", category: "dev" },
  "developer.mozilla.org": { name: "MDN", category: "dev" },
  "vercel.com": { name: "Vercel", category: "dev" },
  "netlify.com": { name: "Netlify", category: "dev" },
  "cloudflare.com": { name: "Cloudflare", category: "dev" },
  "aws.amazon.com": { name: "AWS", category: "dev" },
  "console.cloud.google.com": { name: "Google Cloud", category: "dev" },
  "supabase.com": { name: "Supabase", category: "dev" },
  "neon.tech": { name: "Neon", category: "dev" },
  "railway.app": { name: "Railway", category: "dev" },
  "docs.rs": { name: "docs.rs", category: "dev" },
  "crates.io": { name: "crates.io", category: "dev" },
  "pypi.org": { name: "PyPI", category: "dev" },
  "huggingface.co": { name: "Hugging Face", category: "dev" },

  // Work tools
  "figma.com": { name: "Figma", category: "work" },
  "linear.app": { name: "Linear", category: "work" },
  "notion.so": { name: "Notion", category: "work" },
  "slack.com": { name: "Slack", category: "work" },
  "atlassian.net": { name: "Jira", category: "work" },
  "asana.com": { name: "Asana", category: "work" },
  "trello.com": { name: "Trello", category: "work" },
  "airtable.com": { name: "Airtable", category: "work" },
  "miro.com": { name: "Miro", category: "work" },
  "loom.com": { name: "Loom", category: "work" },
  "zoom.us": { name: "Zoom", category: "work" },
  "meet.google.com": { name: "Google Meet", category: "work" },
  "calendly.com": { name: "Calendly", category: "work" },
  "docs.google.com": { name: "Google Docs", category: "docs" },
  "sheets.google.com": { name: "Google Sheets", category: "docs" },
  "slides.google.com": { name: "Google Slides", category: "docs" },
  "drive.google.com": { name: "Google Drive", category: "docs" },
  "dropbox.com": { name: "Dropbox", category: "docs" },
  "office.com": { name: "Microsoft 365", category: "docs" },
  "sharepoint.com": { name: "SharePoint", category: "docs" },
  "canva.com": { name: "Canva", category: "work" },
  "hubspot.com": { name: "HubSpot", category: "work" },
  "salesforce.com": { name: "Salesforce", category: "work" },
  "stripe.com": { name: "Stripe", category: "dev" },
  "posthog.com": { name: "PostHog", category: "dev" },
  "sentry.io": { name: "Sentry", category: "dev" },

  // Media
  "youtube.com": { name: "YouTube", category: "media" },
  "netflix.com": { name: "Netflix", category: "media" },
  "spotify.com": { name: "Spotify", category: "media" },
  "twitch.tv": { name: "Twitch", category: "media" },
  "vimeo.com": { name: "Vimeo", category: "media" },
  "soundcloud.com": { name: "SoundCloud", category: "media" },
  "hulu.com": { name: "Hulu", category: "media" },
  "max.com": { name: "Max", category: "media" },

  // Social / discussion
  "twitter.com": { name: "Twitter", category: "social" },
  "x.com": { name: "X", category: "social" },
  "reddit.com": { name: "Reddit", category: "discussion" },
  "news.ycombinator.com": { name: "Hacker News", category: "discussion" },
  "instagram.com": { name: "Instagram", category: "social" },
  "facebook.com": { name: "Facebook", category: "social" },
  "linkedin.com": { name: "LinkedIn", category: "social" },
  "bsky.app": { name: "Bluesky", category: "social" },
  "threads.net": { name: "Threads", category: "social" },
  "discord.com": { name: "Discord", category: "social" },
  "quora.com": { name: "Quora", category: "discussion" },

  // News / reading
  "nytimes.com": { name: "NYT", category: "news" },
  "washingtonpost.com": { name: "Washington Post", category: "news" },
  "wsj.com": { name: "WSJ", category: "news" },
  "bbc.com": { name: "BBC", category: "news" },
  "bbc.co.uk": { name: "BBC", category: "news" },
  "cnn.com": { name: "CNN", category: "news" },
  "theguardian.com": { name: "The Guardian", category: "news" },
  "reuters.com": { name: "Reuters", category: "news" },
  "bloomberg.com": { name: "Bloomberg", category: "news" },
  "theverge.com": { name: "The Verge", category: "news" },
  "techcrunch.com": { name: "TechCrunch", category: "news" },
  "arstechnica.com": { name: "Ars Technica", category: "news" },
  "wired.com": { name: "Wired", category: "news" },
  "economist.com": { name: "The Economist", category: "news" },
  "theatlantic.com": { name: "The Atlantic", category: "reading" },
  "newyorker.com": { name: "The New Yorker", category: "reading" },
  "medium.com": { name: "Medium", category: "reading" },
  "substack.com": { name: "Substack", category: "reading" },
  "longreads.com": { name: "Longreads", category: "reading" },
  "pocket.co": { name: "Pocket", category: "reading" },
  "getpocket.com": { name: "Pocket", category: "reading" },
  "instapaper.com": { name: "Instapaper", category: "reading" },

  // Jobs
  "indeed.com": { name: "Indeed", category: "jobs" },
  "glassdoor.com": { name: "Glassdoor", category: "jobs" },
  "lever.co": { name: "Lever", category: "jobs" },
  "greenhouse.io": { name: "Greenhouse", category: "jobs" },
  "wellfound.com": { name: "Wellfound", category: "jobs" },
  "ycombinator.com": { name: "Y Combinator", category: "jobs" },
  "otta.com": { name: "Otta", category: "jobs" },
  "ziprecruiter.com": { name: "ZipRecruiter", category: "jobs" },

  // Learning / reference
  "coursera.org": { name: "Coursera", category: "learning" },
  "udemy.com": { name: "Udemy", category: "learning" },
  "khanacademy.org": { name: "Khan Academy", category: "learning" },
  "edx.org": { name: "edX", category: "learning" },
  "duolingo.com": { name: "Duolingo", category: "learning" },
  "brilliant.org": { name: "Brilliant", category: "learning" },
  "wikipedia.org": { name: "Wikipedia", category: "reference" },
  "wiktionary.org": { name: "Wiktionary", category: "reference" },
  "britannica.com": { name: "Britannica", category: "reference" },
  "arxiv.org": { name: "arXiv", category: "reference" },
  "scholar.google.com": { name: "Google Scholar", category: "reference" },

  // AI tools
  "chatgpt.com": { name: "ChatGPT", category: "ai" },
  "claude.ai": { name: "Claude", category: "ai" },
  "gemini.google.com": { name: "Gemini", category: "ai" },
  "perplexity.ai": { name: "Perplexity", category: "ai" },

  // Mail / calendar
  "mail.google.com": { name: "Gmail", category: "mail" },
  "outlook.com": { name: "Outlook", category: "mail" },
  "outlook.office.com": { name: "Outlook", category: "mail" },
  "calendar.google.com": { name: "Google Calendar", category: "work" },
  "proton.me": { name: "Proton", category: "mail" },
  "fastmail.com": { name: "Fastmail", category: "mail" },

  // Search engines
  "google.com": { name: "Google", category: "search" },
  "bing.com": { name: "Bing", category: "search" },
  "duckduckgo.com": { name: "DuckDuckGo", category: "search" },
  "kagi.com": { name: "Kagi", category: "search" },
};

/** Hostname-first lookup so "docs.google.com" beats "google.com". */
export function lookupSite(hostname: string, domain: string): SiteEntry | undefined {
  const host = hostname.replace(/^www\./, "");
  if (SITES[host]) return SITES[host];
  // Walk up subdomains: a.b.example.com → b.example.com → example.com
  const parts = host.split(".");
  for (let i = 1; i < parts.length - 1; i++) {
    const candidate = parts.slice(i).join(".");
    if (SITES[candidate]) return SITES[candidate];
  }
  return SITES[domain];
}

/** Categories that read as "leisure reading" for the catch-all Reading group. */
export const READING_CATEGORIES: ReadonlySet<SiteCategory> = new Set([
  "reading",
  "news",
  "discussion",
  "media",
  "reference",
] as SiteCategory[]);

/** Categories that almost never define a project on their own (hubs/utilities). */
export const HUB_CATEGORIES: ReadonlySet<SiteCategory> = new Set([
  "search",
  "mail",
  "ai",
  "social",
] as SiteCategory[]);
