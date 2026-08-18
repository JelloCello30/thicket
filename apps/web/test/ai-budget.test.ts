import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { aiUsage, user } from "@thicket/db/schema";
import { db } from "@/lib/db";
import { enforceAiBudget } from "@/lib/ai-server";
import type { RequestUser } from "@/lib/request-auth";

/**
 * The daily AI cap is the only thing standing between a fixed $8/month price
 * and a metered model bill. It used to be a SELECT count() followed by a
 * comparison, which every concurrent request passed at once.
 */
describe("daily AI budget", () => {
  const userId = randomUUID();
  const CAP = 5;

  const subject = (): RequestUser =>
    ({
      id: userId,
      email: "budget@example.com",
      name: "Budget",
      plan: "pro",
      aiEnabled: true,
      contentAnalysis: false,
      entitlements: { aiCallsPerDay: CAP },
    }) as unknown as RequestUser;

  beforeAll(async () => {
    const database = await db();
    await database.insert(user).values({
      id: userId,
      email: "budget@example.com",
      name: "Budget",
      emailVerified: true,
    });
  });

  it("admits exactly the cap when requests arrive together", async () => {
    const attempts = await Promise.allSettled(
      Array.from({ length: CAP * 4 }, () => enforceAiBudget(subject(), "summarize")),
    );
    const admitted = attempts.filter((a) => a.status === "fulfilled").length;

    const database = await db();
    const rows = await database
      .select()
      .from(aiUsage)
      .where(and(eq(aiUsage.userId, userId), eq(aiUsage.cached, false)));

    console.log(`[ai-budget] admitted ${admitted} of ${CAP * 4} concurrent, cap ${CAP}`);
    console.log(`[ai-budget] rows claimed: ${rows.length}`);
    // Not "at most a few over" — over-admitting here is money.
    expect(admitted).toBeLessThanOrEqual(CAP);
    expect(rows.length).toBeLessThanOrEqual(CAP);
  });

  it("refuses once the cap is consumed", async () => {
    await expect(enforceAiBudget(subject(), "summarize")).rejects.toMatchObject({ status: 429 });
  });
});
