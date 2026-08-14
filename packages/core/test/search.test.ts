import { describe, expect, it } from "vitest";
import { searchDocs, type SearchDoc } from "../src/search";

const docs: SearchDoc[] = [
  {
    ref: "1",
    title: "Why startups shouldn't rush hiring — lessons from 40 founders",
    url: "https://example.com/hiring",
    domain: "example.com",
    lastSeenAt: Date.now() - 86_400_000,
  },
  {
    ref: "2",
    title: "3421 Sunset Blvd, Los Angeles — 2bd apartment with rooftop deck",
    url: "https://zillow.com/x",
    domain: "zillow.com",
    context: "Apartment Hunt",
    lastSeenAt: Date.now() - 3_600_000,
  },
  {
    ref: "3",
    title: "Sony a7 IV review",
    url: "https://dpreview.com/a7iv",
    domain: "dpreview.com",
    context: "Camera Research",
    lastSeenAt: Date.now() - 10 * 86_400_000,
  },
  {
    ref: "4",
    title: "Banana Bread Recipe",
    url: "https://allrecipes.com/bb",
    domain: "allrecipes.com",
  },
];

describe("searchDocs", () => {
  it("finds by paraphrase-adjacent tokens", () => {
    const hits = searchDocs("startups hiring too quickly", docs);
    expect(hits[0]?.ref).toBe("1");
  });

  it("finds the apartment with the rooftop", () => {
    const hits = searchDocs("apartment with the rooftop", docs);
    expect(hits[0]?.ref).toBe("2");
  });

  it("matches group context", () => {
    const hits = searchDocs("camera research", docs);
    expect(hits.map((h) => h.ref)).toContain("3");
  });

  it("requires most tokens to match for multi-word queries", () => {
    const hits = searchDocs("rooftop banana quantum physics", docs);
    expect(hits).toHaveLength(0);
  });

  it("returns empty for empty queries", () => {
    expect(searchDocs("", docs)).toEqual([]);
  });
});
