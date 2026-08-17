import type { TabSnapshot } from "@thicket/types";

/**
 * A realistic 47-tab browser session. Used by unit tests (clustering quality
 * bar), the DB seed script, and local demo mode. No lorem ipsum — these are
 * the tabs of a real person doing five real things.
 */

export const DEMO_NOW = 1_755_200_000_000; // fixed instant for determinism

const H = 3_600_000;
const MIN = 60_000;

let autoId = 100;
function tab(
  partial: Partial<TabSnapshot> & { url: string; title: string },
): TabSnapshot {
  return {
    id: autoId++,
    windowId: 1,
    index: autoId - 100,
    pinned: false,
    active: false,
    ...partial,
  } as TabSnapshot;
}

export function demoTabs(now: number = DEMO_NOW): TabSnapshot[] {
  autoId = 100;
  const t = (agoMs: number) => now - agoMs;

  const apartmentSearch = tab({
    url: "https://www.google.com/search?q=apartments+silver+lake+los+angeles+2+bedroom",
    title: "apartments silver lake los angeles 2 bedroom - Google Search",
    lastAccessed: t(3 * H),
  });

  const jGuideShinjuku = tab({
    url: "https://www.japan-guide.com/e/e3053.html",
    title: "Tokyo Travel: Shinjuku - japan-guide.com",
    lastAccessed: t(22 * H),
  });

  const linearChecklist = tab({
    url: "https://linear.app/acme/issue/ACM-482/pricing-page-launch-checklist",
    title: "ACM-482 Pricing page launch checklist – Linear",
    lastAccessed: t(25 * MIN),
  });

  const docsBrief = tab({
    url: "https://docs.google.com/document/d/1xYzAbC/edit",
    title: "Pricing launch brief - Google Docs",
    lastAccessed: t(1 * H),
  });

  const githubPr = tab({
    url: "https://github.com/acme/web/pull/1841",
    title: "feat(pricing): new plan cards and annual toggle by mira · Pull Request #1841 · acme/web",
    lastAccessed: t(30 * MIN),
  });

  return [
    // ——— Apartment Hunt (9) ———
    apartmentSearch,
    tab({
      url: "https://www.zillow.com/homedetails/3421-Sunset-Blvd-Los-Angeles-CA-90026/20501234_zpid/",
      title: "3421 Sunset Blvd, Los Angeles, CA 90026 | Zillow",
      openerTabId: apartmentSearch.id,
      lastAccessed: t(2.5 * H),
    }),
    tab({
      url: "https://www.zillow.com/homedetails/1745-Micheltorena-St-Los-Angeles-CA-90026/20514567_zpid/",
      title: "1745 Micheltorena St, Los Angeles, CA 90026 - 2 bd | Zillow",
      lastAccessed: t(2.4 * H),
    }),
    tab({
      url: "https://www.zillow.com/homedetails/2830-Waverly-Dr-Los-Angeles-CA-90039/20509876_zpid/",
      title: "2830 Waverly Dr APT 4, Los Angeles, CA 90039 | Zillow",
      lastAccessed: t(2.2 * H),
    }),
    tab({
      url: "https://www.apartments.com/echo-park-los-angeles-ca/2-bedrooms/",
      title: "2 Bedroom Apartments for Rent in Echo Park, Los Angeles, CA - Apartments.com",
      lastAccessed: t(4 * H),
    }),
    tab({
      url: "https://www.reddit.com/r/LosAngeles/comments/1abcde/silver_lake_vs_echo_park_where_to_live/",
      title: "Silver Lake vs Echo Park — where to live? : r/LosAngeles",
      lastAccessed: t(5 * H),
    }),
    tab({
      url: "https://www.nerdwallet.com/mortgages/rent-calculator",
      title: "Rent Calculator: How Much Rent Can I Afford? - NerdWallet",
      lastAccessed: t(6 * H),
    }),
    tab({
      url: "https://www.streeteasy.com/blog/first-apartment-checklist/",
      title: "The First Apartment Checklist Every Renter Needs - StreetEasy",
      lastAccessed: t(26 * H),
    }),
    tab({
      url: "https://www.walkscore.com/CA/Los_Angeles/Silver_Lake",
      title: "Silver Lake, Los Angeles Walk Score",
      lastAccessed: t(7 * H),
    }),

    // ——— Japan Trip (12) ———
    tab({
      url: "https://www.google.com/travel/flights?q=flights%20LAX%20to%20Tokyo%20october",
      title: "LAX to Tokyo flights - Google Travel",
      lastAccessed: t(20 * H),
    }),
    tab({
      url: "https://www.kayak.com/flights/LAX-TYO/2026-10-08/2026-10-22",
      title: "Los Angeles to Tokyo flights | Kayak",
      lastAccessed: t(21 * H),
    }),
    tab({
      url: "https://www.booking.com/searchresults.html?ss=Shinjuku%2C+Tokyo",
      title: "Booking.com: Hotels in Shinjuku, Tokyo",
      lastAccessed: t(19 * H),
    }),
    tab({
      url: "https://www.airbnb.com/s/Tokyo--Japan/homes?checkin=2026-10-08&checkout=2026-10-15",
      title: "Tokyo, Japan vacation rentals - Airbnb",
      lastAccessed: t(19.5 * H),
    }),
    jGuideShinjuku,
    tab({
      url: "https://www.japan-guide.com/e/e2018.html",
      title: "Japan Rail Pass - japan-guide.com",
      lastAccessed: t(23 * H),
    }),
    tab({
      url: "https://www.reddit.com/r/JapanTravel/comments/1fghij/tokyo_october_itinerary_check_7_days/",
      title: "Tokyo October itinerary check — 7 days : r/JapanTravel",
      lastAccessed: t(18 * H),
    }),
    tab({
      url: "https://tabelog.com/en/tokyo/",
      title: "Tokyo Restaurants - Tabelog",
      lastAccessed: t(24 * H),
    }),
    tab({
      url: "https://www.tripadvisor.com/Attractions-g298184-Activities-Tokyo_Tokyo_Prefecture_Kanto.html",
      title: "THE 15 BEST Things to Do in Tokyo - Tripadvisor",
      lastAccessed: t(25 * H),
    }),
    tab({
      url: "https://www.timeout.com/tokyo/things-to-do/best-things-to-do-in-tokyo",
      title: "52 Best Things to Do in Tokyo, Japan",
      lastAccessed: t(26 * H),
    }),
    tab({
      url: "https://en.wikipedia.org/wiki/Shibuya",
      title: "Shibuya - Wikipedia",
      openerTabId: jGuideShinjuku.id,
      lastAccessed: t(27 * H),
    }),
    tab({
      url: "https://www.jrailpass.com/blog/tokyo-kyoto-shinkansen",
      title: "Tokyo to Kyoto by Shinkansen: times, prices | JRailPass",
      lastAccessed: t(28 * H),
    }),

    // ——— Work — Pricing Launch (14) ———
    tab({
      url: "https://www.figma.com/design/AbCdEf123/Pricing-page-v3?node-id=101-2043",
      title: "Pricing page v3 – Figma",
      lastAccessed: t(10 * MIN),
      active: true,
    }),
    linearChecklist,
    tab({
      url: "https://linear.app/acme/issue/ACM-495/annual-plan-toggle-state",
      title: "ACM-495 Annual plan toggle state – Linear",
      lastAccessed: t(40 * MIN),
    }),
    docsBrief,
    tab({
      url: "https://docs.google.com/spreadsheets/d/1qRsTuV/edit#gid=0",
      title: "Pricing tiers model - Google Sheets",
      lastAccessed: t(2 * H),
    }),
    tab({
      url: "https://app.slack.com/client/T024BE7LD/C04PRICING",
      title: "pricing-launch (Channel) - Acme - Slack",
      lastAccessed: t(15 * MIN),
    }),
    githubPr,
    tab({
      url: "https://github.com/acme/web/pull/1847",
      title: "fix(pricing): currency formatting for EU locales · Pull Request #1847 · acme/web",
      lastAccessed: t(50 * MIN),
    }),
    tab({
      url: "https://vercel.com/acme/web/deployments",
      title: "Deployments – acme/web – Vercel",
      openerTabId: githubPr.id,
      lastAccessed: t(1.2 * H),
    }),
    tab({
      url: "https://dashboard.stripe.com/test/products",
      title: "Products – Stripe Dashboard",
      openerTabId: linearChecklist.id,
      lastAccessed: t(1.5 * H),
    }),
    tab({
      url: "https://www.notion.so/acme/Pricing-FAQ-draft-8a7b6c5d",
      title: "Pricing FAQ draft - Notion",
      lastAccessed: t(3 * H),
    }),
    tab({
      url: "https://posthog.com/docs/experiments",
      title: "Experiments - PostHog Docs",
      openerTabId: docsBrief.id,
      lastAccessed: t(4 * H),
    }),
    tab({
      url: "https://linear.app/acme/issue/ACM-501/pricing-page-copy-review",
      title: "ACM-501 Pricing page copy review – Linear",
      lastAccessed: t(5 * H),
    }),
    tab({
      url: "https://app.slack.com/client/T024BE7LD/D04DESIGN",
      title: "Mira Chen (DM) - Acme - Slack",
      lastAccessed: t(45 * MIN),
    }),

    // ——— Camera Research (7) ———
    tab({
      url: "https://www.dpreview.com/reviews/sony-a7-iv-review",
      title: "Sony a7 IV review: Digital Photography Review",
      lastAccessed: t(30 * H),
    }),
    tab({
      url: "https://www.dpreview.com/reviews/fujifilm-x-t5-review",
      title: "Fujifilm X-T5 review: Digital Photography Review",
      lastAccessed: t(31 * H),
    }),
    tab({
      url: "https://www.bhphotovideo.com/c/product/1668893-REG/sony_ilce_7m4_b_alpha_a7_iv_mirrorless.html",
      title: "Sony a7 IV Mirrorless Camera | B&H Photo Video",
      lastAccessed: t(29 * H),
    }),
    tab({
      url: "https://www.rtings.com/camera/reviews/best/cameras-for-travel",
      title: "The 6 Best Travel Cameras - Fall 2026 | RTINGS.com",
      lastAccessed: t(32 * H),
    }),
    tab({
      url: "https://www.reddit.com/r/AskPhotography/comments/1klmno/a7_iv_vs_xt5_for_travel_and_video/",
      title: "a7 IV vs X-T5 for travel and video? : r/AskPhotography",
      lastAccessed: t(33 * H),
    }),
    tab({
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ1",
      title: "Sony a7 IV vs Fuji X-T5 — Which camera should you buy in 2026?",
      lastAccessed: t(34 * H),
    }),
    tab({
      url: "https://www.adorama.com/so7m4.html",
      title: "Sony Alpha a7 IV Mirrorless Digital Camera Body - Adorama",
      lastAccessed: t(28 * H),
    }),

    // ——— Probably done / drifting (5) ———
    tab({
      url: "https://en.wikipedia.org/wiki/Great_Molasses_Flood",
      title: "Great Molasses Flood - Wikipedia",
      lastAccessed: t(96 * H),
    }),
    tab({
      url: "https://www.theverge.com/2026/8/2/vision-pro-2-hands-on",
      title: "Apple Vision Pro 2 hands-on: lighter, cheaper, still weird - The Verge",
      lastAccessed: t(120 * H),
    }),
    tab({
      url: "https://www.allrecipes.com/recipe/20144/banana-banana-bread/",
      title: "Banana Banana Bread Recipe - Allrecipes",
      lastAccessed: t(150 * H),
    }),
    tab({
      url: "https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
      title: "Today's Top Hits - Spotify",
      lastAccessed: t(80 * H),
    }),
    tab({
      url: "https://chrome.google.com/webstore/category/extensions",
      title: "Chrome Web Store - Extensions",
      lastAccessed: t(200 * H),
    }),
  ];
}

/** Smaller variant for tests that need a tiny session. */
export function tinyTabSet(now: number = DEMO_NOW): TabSnapshot[] {
  return demoTabs(now).slice(0, 9);
}
