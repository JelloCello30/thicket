import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { deviceLinkCompleteRequest } from "@thicket/types";
import { device, deviceLinkCode, preference } from "@thicket/db/schema";
import { db } from "@/lib/db";
import { corsPreflight, handled, json } from "@/lib/http";
import { HttpError, resolvePlan, sha256 } from "@/lib/request-auth";
import { rateLimit } from "@/lib/rate-limit";
import { clientIp } from "@/lib/http";
import { track } from "@/lib/track";
import { user as userTable } from "@thicket/db/schema";

export const OPTIONS = corsPreflight();

/** The extension redeems a link code for a long-lived, revocable device token. */
export const POST = handled(async (request) => {
  // Codes are short and human-typed, so this endpoint is guessable by volume.
  // Throttle per caller before touching the database at all.
  rateLimit(`link:${clientIp(request)}`, 10, 60_000);

  const body = deviceLinkCompleteRequest.safeParse(await request.json());
  if (!body.success) throw new HttpError(400, "invalid", "Invalid link request.");

  const database = await db();
  const codeHash = sha256(body.data.code.trim().toUpperCase());

  /**
   * Claim the code ATOMICALLY. Reading it and then marking it used is a
   * time-of-check/time-of-use race: five simultaneous redemptions of one
   * single-use code all passed the check and each minted a live device token.
   * A conditional UPDATE ... RETURNING lets exactly one caller win, because
   * the database applies the `usedAt IS NULL` predicate at write time.
   */
  const claimed = await database
    .update(deviceLinkCode)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(deviceLinkCode.codeHash, codeHash),
        isNull(deviceLinkCode.usedAt),
        gt(deviceLinkCode.expiresAt, new Date()),
      ),
    )
    .returning({ id: deviceLinkCode.id, userId: deviceLinkCode.userId });
  const code = claimed[0];
  if (!code) throw new HttpError(400, "invalid-code", "That code is invalid or expired. Get a fresh one from jellocello30.github.io/thicket.");

  const token = `tbm_${randomBytes(32).toString("base64url")}`;
  const deviceId = randomUUID();
  await database.insert(device).values({
    id: deviceId,
    userId: code.userId,
    name: body.data.device.name.slice(0, 120),
    browser: body.data.device.browser.slice(0, 120),
    tokenHash: sha256(token),
  });
  await database.insert(preference).values({ userId: code.userId }).onConflictDoNothing();

  const users = await database
    .select({ email: userTable.email, name: userTable.name })
    .from(userTable)
    .where(eq(userTable.id, code.userId))
    .limit(1);
  const user = users[0];
  if (!user) throw new HttpError(400, "invalid-code", "Account not found.");
  const plan = await resolvePlan(code.userId);

  await track("extension_linked", {}, { userId: code.userId, deviceId });
  return json({
    token,
    deviceId,
    user: { email: user.email, name: user.name, plan },
  });
});
