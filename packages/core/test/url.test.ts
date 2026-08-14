import { describe, expect, it } from "vitest";
import { getDomain, getSearchQuery, isNewTabPage, normalizeUrl } from "../src/url";

describe("normalizeUrl", () => {
  it("strips tracking params and keeps meaningful ones", () => {
    expect(
      normalizeUrl("https://www.example.com/p?utm_source=x&utm_medium=y&id=42&fbclid=abc"),
    ).toBe("https://example.com/p?id=42");
  });

  it("treats equal pages as equal regardless of param order and hash", () => {
    const a = normalizeUrl("https://shop.com/item?b=2&a=1#reviews");
    const b = normalizeUrl("https://www.shop.com/item?a=1&b=2");
    expect(a).toBe(b);
  });

  it("drops trailing slash on bare roots", () => {
    expect(normalizeUrl("https://www.zillow.com/")).toBe("https://zillow.com");
  });

  it("leaves non-http URLs alone", () => {
    expect(normalizeUrl("chrome://newtab/")).toBe("chrome://newtab/");
  });
});

describe("getDomain", () => {
  it("extracts registrable domains", () => {
    expect(getDomain("https://www.blog.zillow.com/x")).toBe("zillow.com");
    expect(getDomain("https://news.bbc.co.uk/story")).toBe("bbc.co.uk");
    expect(getDomain("https://localhost:3000/x")).toBe("localhost");
  });
});

describe("getSearchQuery", () => {
  it("reads Google search queries", () => {
    expect(getSearchQuery("https://www.google.com/search?q=apartments+silver+lake")).toBe(
      "apartments silver lake",
    );
  });
  it("ignores non-SERP Google pages", () => {
    expect(getSearchQuery("https://www.google.com/maps?q=tokyo")).toBeUndefined();
  });
  it("reads DuckDuckGo queries", () => {
    expect(getSearchQuery("https://duckduckgo.com/?q=best+camera")).toBe("best camera");
  });
});

describe("isNewTabPage", () => {
  it("detects new tabs", () => {
    expect(isNewTabPage("chrome://newtab/")).toBe(true);
    expect(isNewTabPage("about:blank")).toBe(true);
    expect(isNewTabPage("https://example.com")).toBe(false);
  });
});
