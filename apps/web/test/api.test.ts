import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import Stripe from "stripe";
import { device, pageRecord, subscription, user, workspace } from "@tabmind/db/schema";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { sha256 } from "@/lib/request-auth";

import { GET as meGet } from "@/app/api/me/route";
import { GET as searchGet } from "@/app/api/search/route";
import { POST as syncWorkspacesPost } from "@/app/api/sync/workspaces/route";
import { POST as syncPagesPost } from "@/app/api/sync/pages/route";
import { POST as organizePost } from "@/app/api/ai/organize/route";
import { POST as eventsPost } from "@/app/api/events/route";
import { POST as webhookPost } from "@/app/api/stripe/webhook/route";

const FREE_TOKEN = "tbm_test_free_token";
const PRO_TOKEN = "tbm_test_pro_token";

const ctx = { params: Promise.resolve({}) };

function req(
  path: string,
  { method = "GET", token, body }: { method?: string; token?: string; body?: unknown } = {},
): Request {
  return new Request(`http://localhost:3000${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function workspacePayload(id: string, title = "Workspace") {
  const now = Date.now();
  return {
    id,
    title,
    kind: "project",
    state: "active" as const,
    color: "blue",
    position: 0,
    createdAt: now,
    updatedAt: now,
    lastActiveAt: now,
    tabs: [
      {
        id: `${id}-t1`,
        url: "https://example.com/a",
        title: "Example",
        domain: "example.com",
        pinned: false,
        position: 0,
        addedAt: now,
      },
    ],
  };
}

beforeAll(async () => {
  const database = await db();
  await database.insert(user).values([
    { id: "u-free", name: "Free User", email: "free@test.dev" },
    { id: "u-pro", name: "Pro User", email: "pro@test.dev" },
  ]);
  await database.insert(device).values([
    { id: "d-free", userId: "u-free", name: "Test Chrome", tokenHash: sha256(FREE_TOKEN) },
    { id: "d-pro", userId: "u-pro", name: "Test Chrome", tokenHash: sha256(PRO_TOKEN) },
  ]);
  await database.insert(subscription).values({
    id: randomUUID(),
    userId: "u-pro",
    plan: "pro",
    status: "active",
    stripeCustomerId: "cus_test_pro",
  });
});

describe("device-token auth", () => {
  it("rejects bogus tokens", async () => {
    // (The cookie-session path needs Next's request scope; it's exercised by
    // the live login flow, not unit tests.)
    expect((await meGet(req("/api/me", { token: "tbm_wrong" }), ctx)).status).toBe(401);
  });

  it("resolves the user, plan, and entitlements", async () => {
    const response = await meGet(req("/api/me", { token: FREE_TOKEN }), ctx);
    expect(response.status).toBe(200);
    const body = (await response.json()) as { user: { plan: string }; entitlements: { maxWorkspaces: number } };
    expect(body.user.plan).toBe("free");
    expect(body.entitlements.maxWorkspaces).toBe(3);
  });

  it("rejects revoked devices", async () => {
    const database = await db();
    const token = "tbm_revoked_token";
    await database.insert(device).values({
      id: "d-revoked",
      userId: "u-free",
      name: "Old laptop",
      tokenHash: sha256(token),
      revokedAt: new Date(),
    });
    expect((await meGet(req("/api/me", { token }), ctx)).status).toBe(401);
  });
});

describe("workspace sync entitlements (enforced server-side)", () => {
  it("lets a free account keep 3 workspaces and refuses the 4th", async () => {
    const three = await syncWorkspacesPost(
      req("/api/sync/workspaces", {
        method: "POST",
        token: FREE_TOKEN,
        body: { upserts: [1, 2, 3].map((i) => workspacePayload(`wsf-${i}`)), deletes: [] },
      }),
      ctx,
    );
    expect(three.status).toBe(200);

    const fourth = await syncWorkspacesPost(
      req("/api/sync/workspaces", {
        method: "POST",
        token: FREE_TOKEN,
        body: { upserts: [workspacePayload("wsf-4")], deletes: [] },
      }),
      ctx,
    );
    expect(fourth.status).toBe(402);
    const body = (await fourth.json()) as { error: { code: string } };
    expect(body.error.code).toBe("pro-required");
  });

  it("updating an existing workspace is not an addition", async () => {
    const response = await syncWorkspacesPost(
      req("/api/sync/workspaces", {
        method: "POST",
        token: FREE_TOKEN,
        body: { upserts: [{ ...workspacePayload("wsf-1", "Renamed"), updatedAt: Date.now() + 5000 }], deletes: [] },
      }),
      ctx,
    );
    expect(response.status).toBe(200);
  });

  it("lets pro accounts exceed the cap", async () => {
    const response = await syncWorkspacesPost(
      req("/api/sync/workspaces", {
        method: "POST",
        token: PRO_TOKEN,
        body: { upserts: [1, 2, 3, 4, 5].map((i) => workspacePayload(`wsp-${i}`)), deletes: [] },
      }),
      ctx,
    );
    expect(response.status).toBe(200);
  });

  it("refuses writing another user's workspace", async () => {
    const response = await syncWorkspacesPost(
      req("/api/sync/workspaces", {
        method: "POST",
        token: FREE_TOKEN,
        body: {
          upserts: [{ ...workspacePayload("wsp-1", "Hijack"), updatedAt: Date.now() + 10_000 }],
          deletes: [],
        },
      }),
      ctx,
    );
    expect(response.status).toBe(403);
  });

  it("never deletes another user's workspace", async () => {
    const response = await syncWorkspacesPost(
      req("/api/sync/workspaces", {
        method: "POST",
        token: FREE_TOKEN,
        body: { upserts: [], deletes: ["wsp-2"] },
      }),
      ctx,
    );
    expect(response.status).toBe(200);
    const database = await db();
    const survivors = await database.select().from(workspace).where(eq(workspace.id, "wsp-2"));
    expect(survivors).toHaveLength(1);
  });
});

describe("page-memory ingest re-applies privacy rules server-side", () => {
  it("records ordinary pages, refuses sensitive ones", async () => {
    const now = Date.now();
    const response = await syncPagesPost(
      req("/api/sync/pages", {
        method: "POST",
        token: FREE_TOKEN,
        body: {
          visits: [
            { url: "https://maggieappleton.com/local-first", title: "Local-first software", domain: "maggieappleton.com", visitedAt: now },
            { url: "https://www.chase.com/personal/checking", title: "Chase Checking", domain: "chase.com", visitedAt: now },
            { url: "https://app.example.com/login?next=/x", title: "Sign in", domain: "example.com", visitedAt: now },
            { url: "https://ex.com/doc?access_token=supersecret", title: "Doc", domain: "ex.com", visitedAt: now },
          ],
        },
      }),
      ctx,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { recorded: number };
    expect(body.recorded).toBe(2); // article + token-stripped doc

    const database = await db();
    const pages = await database.select().from(pageRecord).where(eq(pageRecord.userId, "u-free"));
    const urls = pages.map((p) => p.url).join(" ");
    expect(urls).toContain("maggieappleton.com");
    expect(urls).not.toContain("chase.com");
    expect(urls).not.toContain("login");
    expect(urls).not.toContain("supersecret");
  });

  it("search finds recorded pages lexically", async () => {
    const response = await searchGet(
      req("/api/search?q=local-first%20software", { token: FREE_TOKEN }),
      ctx,
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { results: { url: string }[]; semantic: boolean };
    expect(body.results.some((r) => r.url.includes("maggieappleton"))).toBe(true);
    expect(body.semantic).toBe(false); // no embeddings configured in tests
  });
});

describe("AI endpoints degrade honestly without a key", () => {
  it("returns 503 ai-unavailable instead of pretending", async () => {
    const response = await organizePost(
      req("/api/ai/organize", {
        method: "POST",
        token: PRO_TOKEN,
        body: {
          tabs: [{ key: "1", title: "A", domain: "a.com", category: "other" }],
          proposed: [],
        },
      }),
      ctx,
    );
    expect(response.status).toBe(503);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("ai-unavailable");
  });
});

describe("event intake", () => {
  it("accepts allowlisted names and drops the rest", async () => {
    const response = await eventsPost(
      req("/api/events", {
        method: "POST",
        token: FREE_TOKEN,
        body: {
          events: [
            { name: "workspace_saved", props: { tabs: 5 }, at: Date.now() },
            { name: "totally_made_up", props: {}, at: Date.now() },
          ],
        },
      }),
      ctx,
    );
    expect(response.status).toBe(200);
    const database = await db();
    const { event } = await import("@tabmind/db/schema");
    const rows = await database.select().from(event);
    const names = rows.map((r) => r.name);
    expect(names).toContain("workspace_saved");
    expect(names).not.toContain("totally_made_up");
  });
});

describe("stripe webhook", () => {
  const stripe = new Stripe("sk_test_51_fake_key_for_signature_tests_only");
  const secret = "whsec_test_secret_for_tabmind_tests";

  function subscriptionEvent(id: string): string {
    return JSON.stringify({
      id,
      object: "event",
      type: "customer.subscription.updated",
      data: {
        object: {
          id: "sub_test_1",
          object: "subscription",
          customer: "cus_free_upgrade",
          status: "active",
          cancel_at_period_end: false,
          metadata: { tabmindUserId: "u-free" },
          items: {
            data: [
              {
                price: { id: "price_test_monthly" },
                current_period_end: Math.floor(Date.now() / 1000) + 30 * 86400,
              },
            ],
          },
        },
      },
    });
  }

  async function post(payload: string, signature: string) {
    return webhookPost(
      new Request("http://localhost:3000/api/stripe/webhook", {
        method: "POST",
        headers: { "stripe-signature": signature },
        body: payload,
      }),
    );
  }

  it("rejects bad signatures", async () => {
    const payload = subscriptionEvent("evt_bad_sig");
    const response = await post(payload, "t=1,v1=deadbeef");
    expect(response.status).toBe(400);
  });

  it("applies subscription state and upgrades the plan", async () => {
    const payload = subscriptionEvent("evt_upgrade_1");
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const response = await post(payload, signature);
    expect(response.status).toBe(200);

    const me = await meGet(req("/api/me", { token: FREE_TOKEN }), ctx);
    const body = (await me.json()) as { user: { plan: string }; entitlements: { maxWorkspaces: number | null } };
    expect(body.user.plan).toBe("pro");
    expect(body.entitlements.maxWorkspaces).toBeNull();
  });

  it("is idempotent by event id", async () => {
    const payload = subscriptionEvent("evt_upgrade_1");
    const signature = stripe.webhooks.generateTestHeaderString({ payload, secret });
    const response = await post(payload, signature);
    expect(response.status).toBe(200);
    const database = await db();
    const subs = await database.select().from(subscription).where(eq(subscription.userId, "u-free"));
    expect(subs).toHaveLength(1);
  });
});
