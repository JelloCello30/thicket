import { describe, expect, it } from "vitest";
import { analyzeTabs } from "../src/analyze";
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

describe("incognito", () => {
  /**
   * The extension promises, in the store listing and on the live privacy
   * page, that private windows are never observed. The guard lives here; the
   * bug was that the caller never passed the flag, so page memory recorded
   * private URLs anyway. These pin the contract from both directions.
   */
  it("refuses to store anything from a private window", () => {
    const v = sanitizeForStorage("https://example.com/whatever", "Whatever", {
      excludedDomains: new Set<string>(),
      incognito: true,
    });
    expect(v.ok).toBe(false);
  });

  it("stores the same page from a normal window", () => {
    const v = sanitizeForStorage("https://example.com/whatever", "Whatever", {
      excludedDomains: new Set<string>(),
      incognito: false,
    });
    expect(v.ok).toBe(true);
  });
});

describe("analyzeTab privacy blanking", () => {
  const base = { windowId: 1, index: 0, pinned: false, active: false };
  const ctx = { excludedDomains: new Set(["chase.com"]), preferences: { paused: false }, now: Date.now() };

  it("keeps nothing identifying from a private tab, not even the domain", () => {
    const [tab] = analyzeTabs(
      [{ ...base, id: 1, url: "https://example.com/secret", title: "Secret", incognito: true } as never],
      ctx,
    );
    expect(tab!.excluded).toBe(true);
    expect(tab!.excludedReason).toBe("incognito");
    expect(tab!.url).toBe("");
    expect(tab!.title).toBe("");
    expect(tab!.domain).toBe("");
  });

  it("drops the address and title of an excluded site from the analysis snapshot", () => {
    const [tab] = analyzeTabs(
      [{ ...base, id: 1, url: "https://chase.com/accounts/1234", title: "Checking ...1234" } as never],
      ctx,
    );
    expect(tab!.excluded).toBe(true);
    expect(tab!.url).toBe("");
    expect(tab!.normalizedUrl).toBe("");
    expect(tab!.title).toBe("");
    // The domain stays: the user chose this exclusion and should see which.
    expect(tab!.domain).toBe("chase.com");
  });
});
