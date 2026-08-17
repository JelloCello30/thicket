"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { GroupDot, cn } from "@thicket/ui";

/**
 * The hero demonstration: 47 real-looking tabs crammed into a tab strip,
 * settling into five named groups. Pure CSS transitions on measured
 * positions — no libraries, honest data, reduced-motion renders the
 * organized state immediately.
 */

interface DemoTab {
  label: string;
  group: number;
}

interface DemoGroup {
  name: string;
  color: string;
  dim?: boolean;
}

const GROUPS: DemoGroup[] = [
  { name: "Apartment Hunt", color: "green" },
  { name: "Japan Trip", color: "cyan" },
  { name: "Pricing Launch", color: "blue" },
  { name: "Camera Research", color: "orange" },
  { name: "Probably done", color: "grey", dim: true },
];

const TABS: DemoTab[] = [
  // Apartment Hunt (9)
  { label: "3421 Sunset Blvd — Zillow", group: 0 },
  { label: "1745 Micheltorena St — Zillow", group: 0 },
  { label: "2830 Waverly Dr — Zillow", group: 0 },
  { label: "2BR in Echo Park — Apartments.com", group: 0 },
  { label: "Silver Lake vs Echo Park — Reddit", group: 0 },
  { label: "Rent calculator — NerdWallet", group: 0 },
  { label: "Silver Lake Walk Score", group: 0 },
  { label: "First apartment checklist", group: 0 },
  { label: "apartments silver lake — Google", group: 0 },
  // Japan Trip (12)
  { label: "LAX → TYO — Kayak", group: 1 },
  { label: "LAX to Tokyo — Google Flights", group: 1 },
  { label: "Hotels in Shinjuku — Booking", group: 1 },
  { label: "Tokyo homes — Airbnb", group: 1 },
  { label: "Shinjuku — japan-guide", group: 1 },
  { label: "Japan Rail Pass — japan-guide", group: 1 },
  { label: "October itinerary check — Reddit", group: 1 },
  { label: "Tokyo restaurants — Tabelog", group: 1 },
  { label: "Things to do in Tokyo — Tripadvisor", group: 1 },
  { label: "52 things in Tokyo — Time Out", group: 1 },
  { label: "Shibuya — Wikipedia", group: 1 },
  { label: "Tokyo → Kyoto shinkansen", group: 1 },
  // Pricing Launch (14)
  { label: "Pricing page v3 — Figma", group: 2 },
  { label: "ACM-482 launch checklist — Linear", group: 2 },
  { label: "ACM-495 annual toggle — Linear", group: 2 },
  { label: "ACM-501 copy review — Linear", group: 2 },
  { label: "Pricing launch brief — Docs", group: 2 },
  { label: "Pricing tiers model — Sheets", group: 2 },
  { label: "#pricing-launch — Slack", group: 2 },
  { label: "Mira Chen — Slack", group: 2 },
  { label: "PR #1841 plan cards — GitHub", group: 2 },
  { label: "PR #1847 currency fix — GitHub", group: 2 },
  { label: "Deployments — Vercel", group: 2 },
  { label: "Products — Stripe", group: 2 },
  { label: "Pricing FAQ draft — Notion", group: 2 },
  { label: "Experiments — PostHog", group: 2 },
  // Camera Research (7)
  { label: "Sony a7 IV review — DPReview", group: 3 },
  { label: "Fujifilm X-T5 review — DPReview", group: 3 },
  { label: "a7 IV — B&H Photo", group: 3 },
  { label: "Best travel cameras — RTINGS", group: 3 },
  { label: "a7 IV vs X-T5 — Reddit", group: 3 },
  { label: "Which camera in 2026 — YouTube", group: 3 },
  { label: "a7 IV body — Adorama", group: 3 },
  // Probably done (5)
  { label: "Great Molasses Flood — Wikipedia", group: 4 },
  { label: "Vision Pro 2 hands-on — The Verge", group: 4 },
  { label: "Banana bread — Allrecipes", group: 4 },
  { label: "Today's Top Hits — Spotify", group: 4 },
  { label: "Chrome Web Store", group: 4 },
];

interface Position {
  x: number;
  y: number;
  w: number;
  faded?: boolean;
}

const CHIP_H = 26;
const GAP = 6;

function chaosLayout(width: number): { positions: Position[]; height: number } {
  const cols = width < 560 ? 4 : 6;
  const w = (width - GAP * (cols - 1)) / cols;
  const positions = TABS.map((_, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    return { x: col * (w + GAP), y: 34 + row * (CHIP_H + GAP), w };
  });
  const rows = Math.ceil(TABS.length / cols);
  return { positions, height: 34 + rows * (CHIP_H + GAP) + 6 };
}

function organizedLayout(width: number): {
  positions: Position[];
  headers: { x: number; y: number; w: number }[];
  height: number;
} {
  const cols = width < 560 ? 2 : width < 860 ? 3 : 5;
  const colW = (width - GAP * 2 * (cols - 1)) / cols;
  const colX = (c: number) => c * (colW + GAP * 2);
  const colHeights = new Array<number>(cols).fill(0);
  const headers: { x: number; y: number; w: number }[] = [];
  const groupPositions = new Map<number, { x: number; yStart: number }>();

  GROUPS.forEach((_, groupIndex) => {
    // Place each group in the currently shortest column.
    let target = 0;
    for (let c = 1; c < cols; c++) if (colHeights[c]! < colHeights[target]!) target = c;
    const yStart = colHeights[target]!;
    headers.push({ x: colX(target), y: yStart, w: colW });
    groupPositions.set(groupIndex, { x: colX(target), yStart: yStart + 30 });
    const count = TABS.filter((t) => t.group === groupIndex).length;
    colHeights[target] = yStart + 30 + count * (CHIP_H + GAP) + 18;
  });

  const perGroupIndex = new Map<number, number>();
  const positions = TABS.map((tab) => {
    const index = perGroupIndex.get(tab.group) ?? 0;
    perGroupIndex.set(tab.group, index + 1);
    const base = groupPositions.get(tab.group)!;
    return {
      x: base.x,
      y: base.yStart + index * (CHIP_H + GAP),
      w: colW,
      faded: GROUPS[tab.group]!.dim,
    };
  });

  return { positions, headers, height: Math.max(...colHeights) };
}

const SSR_WIDTH = 976; // corrected by ResizeObserver on mount; only no-JS keeps it

export function TabDemo() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(SSR_WIDTH);
  const [organized, setOrganized] = useState(false);
  const [reduced, setReduced] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(media.matches);
    if (media.matches) setOrganized(true);
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth || SSR_WIDTH);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (reduced || startedRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting) && !startedRef.current) {
          startedRef.current = true;
          setTimeout(() => setOrganized(true), 1100);
          observer.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [reduced]);

  const chaos = useMemo(() => chaosLayout(width), [width]);
  const tidy = useMemo(() => organizedLayout(width), [width]);

  const layout = organized ? tidy.positions : chaos.positions;
  const height = organized ? tidy.height : chaos.height;

  return (
    <figure aria-label="47 browser tabs being organized into five groups by Thicket">
      <div className="rounded-xl border border-edge bg-raised p-3 shadow-md sm:p-4">
        <div className="mb-1 flex items-center gap-1.5 px-0.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-ink/15" />
          <span className="ml-3 text-[0.75rem] tabular-nums text-ink-faint">
            {organized ? "47 tabs · 5 things" : "47 tabs"}
          </span>
          <button
            onClick={() => {
              if (reduced) return;
              setOrganized(false);
              setTimeout(() => setOrganized(true), 1300);
            }}
            className={cn(
              "ml-auto rounded px-2 py-0.5 text-[0.75rem] text-ink-faint transition-opacity hover:text-ink",
              organized && !reduced ? "opacity-100" : "pointer-events-none opacity-0",
            )}
          >
            Replay
          </button>
        </div>
        <div
          ref={containerRef}
          className="relative w-full transition-[height] duration-700 ease-in-out"
          style={{ height }}
        >
          {tidy.headers.map((header, i) => (
            <div
              key={GROUPS[i]!.name}
              className="absolute flex items-center gap-1.5 transition-opacity duration-500"
              style={{
                transform: `translate(${header.x}px, ${header.y}px)`,
                width: header.w,
                opacity: organized ? 1 : 0,
                transitionDelay: organized ? "450ms" : "0ms",
              }}
            >
              <GroupDot color={GROUPS[i]!.color} />
              <span className="truncate text-[0.75rem] font-semibold text-ink">{GROUPS[i]!.name}</span>
              <span className="text-[0.6875rem] tabular-nums text-ink-faint">
                {TABS.filter((t) => t.group === i).length}
              </span>
            </div>
          ))}
          {TABS.map((tab, i) => {
            const pos = layout[i]!;
            return (
              <div
                key={tab.label}
                className={cn(
                  "absolute flex items-center rounded-[6px] border border-edge bg-bg px-2 transition-all duration-700 ease-in-out",
                  organized && pos.faded ? "opacity-45" : "opacity-100",
                )}
                style={{
                  transform: `translate(${pos.x}px, ${pos.y}px)`,
                  width: pos.w,
                  height: CHIP_H,
                  transitionDelay: organized ? `${(i % 12) * 28}ms` : `${(i % 8) * 12}ms`,
                }}
              >
                <span
                  className="mr-1.5 h-1.5 w-1.5 shrink-0 rounded-full transition-colors duration-500"
                  style={{
                    background: organized
                      ? `var(--tm-group-${GROUPS[tab.group]!.color})`
                      : "var(--tm-border-strong)",
                  }}
                  aria-hidden="true"
                />
                <span className="truncate text-[0.7rem] leading-none text-ink-secondary">{tab.label}</span>
              </div>
            );
          })}
        </div>
      </div>
      <figcaption className="mt-2.5 text-center text-[0.75rem] text-ink-faint">
        Real session, real grouping — this is what installing Thicket feels like.
      </figcaption>
    </figure>
  );
}
