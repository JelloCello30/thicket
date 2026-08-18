import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { device, deviceLinkCode, user } from "@thicket/db/schema";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/request-auth";

import { POST as linkComplete } from "@/app/api/devices/link/complete/route";
import { GET as meGet } from "@/app/api/me/route";
import { withCors } from "@/lib/http";
import { NextResponse } from "next/server";
import { __resetEnvCache } from "@thicket/config/env";

const ctx = { params: Promise.resolve({}) };

function linkReq(code: string) {
  return new Request("http://localhost:3000/api/devices/link/complete", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ code, device: { name: "Chrome on Mac", browser: "Chrome" } }),
  });
}

beforeAll(async () => {
  const database = await db();
  await database.insert(user).values([
    { id: "u-victim", name: "Victim", email: "victim@test.dev" },
  ]);
});

describe("device link code: single-use guarantee", () => {
  it("SEQUENTIAL redemption of the same code is refused the second time", async () => {
    const database = await db();
    const code = "AAAA-1111";
    await database.insert(deviceLinkCode).values({
      id: randomUUID(),
      userId: "u-victim",
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + 600_000),
    });
    const first = await linkComplete(linkReq(code), ctx);
    expect(first.status).toBe(200);
    const second = await linkComplete(linkReq(code), ctx);
    expect(second.status).toBe(400);
  });

  it("CONCURRENT redemption of one code: how many tokens does it mint?", async () => {
    const database = await db();
    const code = "BBBB-2222";
    await database.insert(deviceLinkCode).values({
      id: randomUUID(),
      userId: "u-victim",
      codeHash: sha256(code),
      expiresAt: new Date(Date.now() + 600_000),
    });
    const results = await Promise.all([
      linkComplete(linkReq(code), ctx),
      linkComplete(linkReq(code), ctx),
      linkComplete(linkReq(code), ctx),
      linkComplete(linkReq(code), ctx),
      linkComplete(linkReq(code), ctx),
    ]);
    const ok = results.filter((r) => r.status === 200);
    const bodies = await Promise.all(ok.map((r) => r.json() as Promise<{ token: string }>));
    console.log("[device-auth] statuses:", results.map((r) => r.status).join(","));
    console.log("[device-auth] distinct tokens minted from one code:", new Set(bodies.map((b) => b.token)).size);

    // Every minted token must actually authenticate — prove they're all live.
    let live = 0;
    for (const b of bodies) {
      const res = await meGet(
        new Request("http://localhost:3000/api/me", {
          headers: { authorization: `Bearer ${b.token}` },
        }),
        ctx,
      );
      if (res.status === 200) live++;
    }
    console.log("[device-auth] live device tokens from ONE single-use code:", live);
    // One single-use code, one live token. Redeeming concurrently used to
    // mint five, because the check and the mark-used were separate statements.
    expect(live).toBe(1);
  });
});

describe("link/complete brute-force surface", () => {
  it("has no rate limit: N wrong codes in a row all reach the database", async () => {
    const statuses: number[] = [];
    for (let i = 0; i < 40; i++) {
      const res = await linkComplete(linkReq(`ZZZZ-${String(i).padStart(4, "0")}`), ctx);
      statuses.push(res.status);
    }
    const throttled = statuses.filter((s) => s === 429).length;
    console.log("[device-auth] 429s across 40 bad-code attempts:", throttled);
    // Codes are short and typed by hand; unthrottled this is brute-forceable.
    expect(throttled).toBeGreaterThan(0);
  });
});

describe("CORS default when TABMIND_EXTENSION_IDS is unset in production", () => {
  it("does NOT hand an allow-origin to an arbitrary extension", () => {
    const prev = { node: process.env.NODE_ENV, ids: process.env.TABMIND_EXTENSION_IDS };
    try {
      // @ts-expect-error test override
      process.env.NODE_ENV = "production";
      process.env.TABMIND_EXTENSION_IDS = "";
      process.env.DATABASE_URL = "postgres://x/y";
      process.env.BETTER_AUTH_SECRET = "x".repeat(40);
      process.env.BETTER_AUTH_URL = "https://example.com";
      __resetEnvCache();
      const hostile = new Request("https://example.com/api/me", {
        headers: { origin: "chrome-extension://hostileextensionidaaaaaaaaaaaaaa" },
      });
      const res = withCors(hostile, NextResponse.json({ ok: true }));
      const acao = res.headers.get("access-control-allow-origin");
      console.log("[device-auth] ACAO for unknown extension, prod, empty allowlist:", acao);
      expect(acao).toBeNull(); // FAILS if default-open
    } finally {
      // @ts-expect-error test restore
      process.env.NODE_ENV = prev.node;
      process.env.TABMIND_EXTENSION_IDS = prev.ids ?? "";
      delete process.env.DATABASE_URL;
      delete process.env.BETTER_AUTH_SECRET;
      delete process.env.BETTER_AUTH_URL;
      __resetEnvCache();
    }
  });
});

describe("device token lifetime", () => {
  it("a token minted long ago still authenticates (no expiry)", async () => {
    const database = await db();
    const token = "tbm_ancient_token_from_two_years_ago";
    await database.insert(device).values({
      id: "d-ancient",
      userId: "u-victim",
      name: "Old laptop",
      tokenHash: sha256(token),
      createdAt: new Date(Date.now() - 730 * 86_400_000),
      lastSeenAt: new Date(Date.now() - 730 * 86_400_000),
    });
    const res = await meGet(
      new Request("http://localhost:3000/api/me", {
        headers: { authorization: `Bearer ${token}` },
      }),
      ctx,
    );
    console.log("[device-auth] 2-year-old unused device token status:", res.status);
    expect(res.status).toBe(401); // FAILS if tokens never expire
  });

  it("deleting the account kills its device tokens (cascade)", async () => {
    const database = await db();
    await database.insert(user).values({ id: "u-gone", name: "Gone", email: "gone@test.dev" });
    const token = "tbm_token_of_deleted_account";
    await database.insert(device).values({
      id: "d-gone",
      userId: "u-gone",
      name: "Chrome",
      tokenHash: sha256(token),
    });
    await database.delete(user).where(eq(user.id, "u-gone"));
    const res = await meGet(
      new Request("http://localhost:3000/api/me", {
        headers: { authorization: `Bearer ${token}` },
      }),
      ctx,
    );
    console.log("[device-auth] token after account delete:", res.status);
    expect(res.status).toBe(401);
  });
});
