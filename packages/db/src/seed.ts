import { randomUUID } from "node:crypto";
import { createHash } from "node:crypto";
import { connect } from "./client";
import { migrate } from "./migrate";
import * as t from "./schema";

/**
 * Realistic local development data: one demo user with saved workspaces and
 * page history that mirror what TabMind actually produces. No lorem ipsum.
 */

const now = Date.now();
const H = 3_600_000;
const D = 24 * H;

function md5(s: string): string {
  return createHash("md5").update(s).digest("hex");
}

interface SeedTab {
  url: string;
  title: string;
  domain: string;
}

const workspaces: {
  title: string;
  summary: string;
  kind: string;
  color: string;
  state: "active" | "archived";
  lastActiveAgo: number;
  tabs: SeedTab[];
}[] = [
  {
    title: "Tokyo — October Trip",
    summary:
      "Flights from LAX around Oct 8–22, hotels in Shinjuku vs an Airbnb, JR Pass logistics, and a shortlist of neighborhoods and restaurants.",
    kind: "travel",
    color: "cyan",
    state: "active",
    lastActiveAgo: 3 * D,
    tabs: [
      { url: "https://www.kayak.com/flights/LAX-TYO/2026-10-08/2026-10-22", title: "Los Angeles to Tokyo flights | Kayak", domain: "kayak.com" },
      { url: "https://www.booking.com/searchresults.html?ss=Shinjuku%2C+Tokyo", title: "Booking.com: Hotels in Shinjuku, Tokyo", domain: "booking.com" },
      { url: "https://www.airbnb.com/s/Tokyo--Japan/homes", title: "Tokyo, Japan vacation rentals - Airbnb", domain: "airbnb.com" },
      { url: "https://www.japan-guide.com/e/e2018.html", title: "Japan Rail Pass - japan-guide.com", domain: "japan-guide.com" },
      { url: "https://www.japan-guide.com/e/e3053.html", title: "Tokyo Travel: Shinjuku - japan-guide.com", domain: "japan-guide.com" },
      { url: "https://tabelog.com/en/tokyo/", title: "Tokyo Restaurants - Tabelog", domain: "tabelog.com" },
      { url: "https://www.reddit.com/r/JapanTravel/comments/1fghij/tokyo_october_itinerary_check_7_days/", title: "Tokyo October itinerary check — 7 days : r/JapanTravel", domain: "reddit.com" },
      { url: "https://www.jrailpass.com/blog/tokyo-kyoto-shinkansen", title: "Tokyo to Kyoto by Shinkansen: times, prices | JRailPass", domain: "jrailpass.com" },
      { url: "https://www.timeout.com/tokyo/things-to-do/best-things-to-do-in-tokyo", title: "52 Best Things to Do in Tokyo, Japan", domain: "timeout.com" },
      { url: "https://en.wikipedia.org/wiki/Shibuya", title: "Shibuya - Wikipedia", domain: "wikipedia.org" },
    ],
  },
  {
    title: "Apartment Hunt",
    summary:
      "Comparing 2-bedroom rentals around Silver Lake and Echo Park. Three Zillow favorites so far; rent calculator says keep it under $3,500.",
    kind: "realestate",
    color: "green",
    state: "active",
    lastActiveAgo: 6 * H,
    tabs: [
      { url: "https://www.zillow.com/homedetails/3421-Sunset-Blvd-Los-Angeles-CA-90026/20501234_zpid/", title: "3421 Sunset Blvd, Los Angeles, CA 90026 | Zillow", domain: "zillow.com" },
      { url: "https://www.zillow.com/homedetails/1745-Micheltorena-St-Los-Angeles-CA-90026/20514567_zpid/", title: "1745 Micheltorena St, Los Angeles, CA 90026 - 2 bd | Zillow", domain: "zillow.com" },
      { url: "https://www.zillow.com/homedetails/2830-Waverly-Dr-Los-Angeles-CA-90039/20509876_zpid/", title: "2830 Waverly Dr APT 4, Los Angeles, CA 90039 | Zillow", domain: "zillow.com" },
      { url: "https://www.apartments.com/echo-park-los-angeles-ca/2-bedrooms/", title: "2 Bedroom Apartments for Rent in Echo Park, Los Angeles, CA", domain: "apartments.com" },
      { url: "https://www.reddit.com/r/LosAngeles/comments/1abcde/silver_lake_vs_echo_park_where_to_live/", title: "Silver Lake vs Echo Park — where to live? : r/LosAngeles", domain: "reddit.com" },
      { url: "https://www.nerdwallet.com/mortgages/rent-calculator", title: "Rent Calculator: How Much Rent Can I Afford? - NerdWallet", domain: "nerdwallet.com" },
      { url: "https://www.walkscore.com/CA/Los_Angeles/Silver_Lake", title: "Silver Lake, Los Angeles Walk Score", domain: "walkscore.com" },
    ],
  },
  {
    title: "Desk Setup",
    summary:
      "Standing desk + ultrawide monitor research. Leaning toward the 34\" LG and a Fully Jarvis frame; keyboard rabbit hole still open.",
    kind: "shopping",
    color: "orange",
    state: "active",
    lastActiveAgo: 9 * D,
    tabs: [
      { url: "https://www.rtings.com/monitor/reviews/best/ultrawide", title: "The 5 Best Ultrawide Monitors - Fall 2026 | RTINGS.com", domain: "rtings.com" },
      { url: "https://www.lg.com/us/monitors/lg-34wq75c-b", title: "LG 34\" Curved UltraWide QHD Monitor - LG USA", domain: "lg.com" },
      { url: "https://www.hermanmiller.com/products/seating/office-chairs/aeron-chairs/", title: "Aeron Chair - Herman Miller", domain: "hermanmiller.com" },
      { url: "https://www.wirecutter.com/reviews/best-standing-desk/", title: "The 4 Best Standing Desks of 2026 | Wirecutter", domain: "wirecutter.com" },
      { url: "https://www.reddit.com/r/MechanicalKeyboards/comments/1zxcvb/first_board_under_150_recommendations/", title: "First board under $150 — recommendations? : r/MechanicalKeyboards", domain: "reddit.com" },
      { url: "https://www.amazon.com/dp/B0C8XYZ123", title: "Keychron Q1 Pro Wireless Mechanical Keyboard - Amazon.com", domain: "amazon.com" },
    ],
  },
  {
    title: "Pricing Launch",
    summary:
      "Everything for the pricing-page launch: Figma v3 mocks, the launch checklist, tier model, and both open PRs.",
    kind: "work",
    color: "blue",
    state: "archived",
    lastActiveAgo: 21 * D,
    tabs: [
      { url: "https://www.figma.com/design/AbCdEf123/Pricing-page-v3", title: "Pricing page v3 – Figma", domain: "figma.com" },
      { url: "https://linear.app/acme/issue/ACM-482/pricing-page-launch-checklist", title: "ACM-482 Pricing page launch checklist – Linear", domain: "linear.app" },
      { url: "https://docs.google.com/document/d/1xYzAbC/edit", title: "Pricing launch brief - Google Docs", domain: "docs.google.com" },
      { url: "https://docs.google.com/spreadsheets/d/1qRsTuV/edit", title: "Pricing tiers model - Google Sheets", domain: "docs.google.com" },
      { url: "https://github.com/acme/web/pull/1841", title: "feat(pricing): new plan cards and annual toggle · PR #1841", domain: "github.com" },
      { url: "https://github.com/acme/web/pull/1847", title: "fix(pricing): currency formatting for EU locales · PR #1847", domain: "github.com" },
    ],
  },
];

const extraHistory: SeedTab[] = [
  { url: "https://www.theverge.com/2026/8/2/vision-pro-2-hands-on", title: "Apple Vision Pro 2 hands-on: lighter, cheaper, still weird - The Verge", domain: "theverge.com" },
  { url: "https://paulgraham.com/ds.html", title: "Do Things that Don't Scale", domain: "paulgraham.com" },
  { url: "https://www.dpreview.com/reviews/sony-a7-iv-review", title: "Sony a7 IV review: Digital Photography Review", domain: "dpreview.com" },
  { url: "https://maggieappleton.com/local-first", title: "A Shelfish Starter Guide to Local-First Software", domain: "maggieappleton.com" },
  { url: "https://www.seriouseats.com/classic-banana-bread-recipe", title: "Classic Banana Bread Recipe - Serious Eats", domain: "seriouseats.com" },
];

export async function seed(): Promise<void> {
  const handle = await connect();
  try {
    await migrate(handle);
    const { db } = handle;

    const userId = "demo-user";
    await db
      .insert(t.user)
      .values({
        id: userId,
        name: "Demo User",
        email: "demo@tabmind.app",
        emailVerified: true,
      })
      .onConflictDoNothing();

    await db.insert(t.preference).values({ userId }).onConflictDoNothing();
    await db
      .insert(t.subscription)
      .values({ id: randomUUID(), userId, plan: "pro", status: "active" })
      .onConflictDoNothing();

    for (const [wsIndex, ws] of workspaces.entries()) {
      const wsId = `demo-ws-${wsIndex}`;
      await db
        .insert(t.workspace)
        .values({
          id: wsId,
          userId,
          title: ws.title,
          summary: ws.summary,
          kind: ws.kind,
          color: ws.color,
          state: ws.state,
          position: wsIndex,
          createdAt: new Date(now - ws.lastActiveAgo - 5 * D),
          updatedAt: new Date(now - ws.lastActiveAgo),
          lastActiveAt: new Date(now - ws.lastActiveAgo),
        })
        .onConflictDoNothing();
      for (const [tabIndex, tab] of ws.tabs.entries()) {
        await db
          .insert(t.workspaceTab)
          .values({
            id: `demo-tab-${wsIndex}-${tabIndex}`,
            workspaceId: wsId,
            url: tab.url,
            title: tab.title,
            domain: tab.domain,
            position: tabIndex,
            addedAt: new Date(now - ws.lastActiveAgo - tabIndex * 600_000),
          })
          .onConflictDoNothing();
      }
    }

    const allPages = [...workspaces.flatMap((w) => w.tabs), ...extraHistory];
    for (const [i, page] of allPages.entries()) {
      await db
        .insert(t.pageRecord)
        .values({
          id: `demo-page-${i}`,
          userId,
          url: page.url,
          urlHash: md5(page.url),
          title: page.title,
          domain: page.domain,
          firstSeenAt: new Date(now - 10 * D - i * H),
          lastSeenAt: new Date(now - (i % 9) * D - (i % 7) * H),
          visitCount: 1 + (i % 5),
        })
        .onConflictDoNothing();
    }

    console.log(
      `✓ seeded demo user demo@tabmind.app with ${workspaces.length} workspaces and ${allPages.length} history pages (${handle.kind})`,
    );
  } finally {
    await handle.close();
  }
}

const isMain = process.argv[1]?.endsWith("seed.ts") || process.argv[1]?.endsWith("seed.js");
if (isMain) await seed();
