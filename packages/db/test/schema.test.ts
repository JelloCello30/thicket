import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { connect, type DbHandle } from "../src/client";
import { migrate } from "../src/migrate";
import * as t from "../src/schema";

let handle: DbHandle;

beforeAll(async () => {
  handle = await connect({ pgliteDir: "memory://", databaseUrl: "" as never });
  await migrate(handle);
});

afterAll(async () => {
  await handle.close();
});

describe("schema round trip on real Postgres (PGlite)", () => {
  it("creates a user with preferences, workspace, tabs, and history", async () => {
    const { db } = handle;
    await db.insert(t.user).values({ id: "u1", name: "Test", email: "t@example.com" });
    await db.insert(t.preference).values({ userId: "u1" });
    await db.insert(t.workspace).values({ id: "w1", userId: "u1", title: "Tokyo Trip" });
    await db.insert(t.workspaceTab).values({
      id: "wt1",
      workspaceId: "w1",
      url: "https://kayak.com/x",
      title: "Flights",
      domain: "kayak.com",
    });
    await db.insert(t.pageRecord).values({
      id: "p1",
      userId: "u1",
      url: "https://kayak.com/x",
      urlHash: "a".repeat(32),
      title: "Flights",
      domain: "kayak.com",
    });

    const prefs = await db.select().from(t.preference).where(eq(t.preference.userId, "u1"));
    expect(prefs[0]?.contentAnalysis).toBe(false);
    expect(prefs[0]?.aiEnabled).toBe(true);

    const tabs = await db.select().from(t.workspaceTab).where(eq(t.workspaceTab.workspaceId, "w1"));
    expect(tabs).toHaveLength(1);
  });

  it("enforces unique page per user+url", async () => {
    const { db } = handle;
    await expect(
      db.insert(t.pageRecord).values({
        id: "p2",
        userId: "u1",
        url: "https://kayak.com/x",
        urlHash: "a".repeat(32),
        title: "Flights again",
        domain: "kayak.com",
      }),
    ).rejects.toThrow();
  });

  it("supports vector embeddings and similarity ordering", async () => {
    const { db } = handle;
    const dims = t.EMBEDDING_DIMS;
    const mkVec = (fill: number) => Array.from({ length: dims }, (_, i) => (i === 0 ? fill : 0));
    await db.insert(t.pageRecord).values([
      {
        id: "pv1",
        userId: "u1",
        url: "https://a.example.com/",
        urlHash: "b".repeat(32),
        title: "close match",
        domain: "a.example.com",
        embedding: mkVec(1),
      },
      {
        id: "pv2",
        userId: "u1",
        url: "https://b.example.com/",
        urlHash: "c".repeat(32),
        title: "far match",
        domain: "b.example.com",
        embedding: mkVec(-1),
      },
    ]);
    const query = mkVec(0.9);
    const rows = await db
      .select({ id: t.pageRecord.id })
      .from(t.pageRecord)
      .where(sql`${t.pageRecord.embedding} IS NOT NULL`)
      .orderBy(sql`${t.pageRecord.embedding} <=> ${JSON.stringify(query)}::vector`)
      .limit(2);
    expect(rows[0]?.id).toBe("pv1");
  });

  it("cascade-deletes everything when the user is deleted", async () => {
    const { db } = handle;
    await db.insert(t.device).values({
      id: "d1",
      userId: "u1",
      name: "Chrome on Mac",
      tokenHash: "e".repeat(64),
    });
    await db.delete(t.user).where(eq(t.user.id, "u1"));
    expect(await db.select().from(t.workspace)).toHaveLength(0);
    expect(await db.select().from(t.workspaceTab)).toHaveLength(0);
    expect(await db.select().from(t.pageRecord)).toHaveLength(0);
    expect(await db.select().from(t.device)).toHaveLength(0);
    expect(await db.select().from(t.preference)).toHaveLength(0);
  });
});
