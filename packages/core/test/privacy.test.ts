import { describe, expect, it } from "vitest";
import {
  allowedOffDevice,
  isAuthFlowUrl,
  normalizeExcludedDomainInput,
  sanitizeForStorage,
  stripSensitiveParams,
} from "../src/privacy";

const ctx = { excludedDomains: new Set<string>() };

describe("sanitizeForStorage", () => {
  it("refuses incognito no matter what", () => {
    const v = sanitizeForStorage("https://example.com", "Example", {
      ...ctx,
      incognito: true,
    });
    expect(v.ok).toBe(false);
  });

  it("refuses auth flows", () => {
    for (const url of [
      "https://app.example.com/login",
      "https://example.com/signin?next=/home",
      "https://id.example.com/oauth2/authorize?client_id=x",
      "https://example.com/password-reset",
      "https://example.com/account/2fa",
    ]) {
      expect(sanitizeForStorage(url, "t", ctx).ok, url).toBe(false);
    }
  });

  it("refuses payment pages", () => {
    expect(sanitizeForStorage("https://shop.com/checkout", "Checkout", ctx).ok).toBe(false);
    expect(sanitizeForStorage("https://shop.com/cart/checkout", "Checkout", ctx).ok).toBe(false);
  });

  it("marks banking domains sensitive (kept local, never off-device)", () => {
    const v = sanitizeForStorage("https://www.chase.com/personal/checking", "Chase", ctx);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.sensitive).toBe(true);
    expect(allowedOffDevice(v)).toBe(false);
  });

  it("respects user-excluded domains", () => {
    const v = sanitizeForStorage("https://internal.acme.com/wiki", "Wiki", {
      excludedDomains: new Set(["acme.com"]),
    });
    expect(v.ok && v.sensitive).toBe(true);
  });

  it("passes ordinary pages and strips secrets", () => {
    const v = sanitizeForStorage(
      "https://example.com/article?id=5&session_token=abc123&ref=twitter",
      "A good article",
      ctx,
    );
    expect(v.ok).toBe(true);
    if (v.ok) {
      expect(v.url).not.toContain("session_token");
      expect(v.sensitive).toBe(false);
    }
  });
});

describe("stripSensitiveParams", () => {
  it("removes token-like params, keeps content params", () => {
    const out = stripSensitiveParams(
      "https://ex.com/doc?page=2&access_token=xyz&api_key=k&q=hello",
    );
    expect(out).toContain("page=2");
    expect(out).toContain("q=hello");
    expect(out).not.toContain("access_token");
    expect(out).not.toContain("api_key");
  });

  it("drops token-bearing hash fragments", () => {
    const out = stripSensitiveParams("https://ex.com/cb#access_token=secret&state=1");
    expect(out).not.toContain("secret");
  });
});

describe("isAuthFlowUrl", () => {
  it("does not flag ordinary pages", () => {
    expect(isAuthFlowUrl("https://example.com/blog/login-page-design")).toBe(false);
    expect(isAuthFlowUrl("https://example.com/products")).toBe(false);
  });
});

describe("normalizeExcludedDomainInput", () => {
  it("accepts messy user input", () => {
    expect(normalizeExcludedDomainInput(" https://www.BankOfAmerica.com/login ")).toBe(
      "bankofamerica.com",
    );
    expect(normalizeExcludedDomainInput("acme.com")).toBe("acme.com");
    expect(normalizeExcludedDomainInput("not a domain")).toBeNull();
  });
});
