import "server-only";

/** Device tokens idle longer than this are revoked on next use (180 days). */
const DEVICE_TOKEN_MAX_IDLE_MS = 180 * 24 * 60 * 60 * 1000;
import { createHash } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { headers } from "next/headers";
import { device, preference, subscription, user } from "@thicket/db/schema";
import { entitlementsFor } from "@thicket/config";
import type { Entitlements, Plan } from "@thicket/types";
import { getAuth } from "./auth";
import { db } from "./db";

/**
 * Request authentication for API routes. Two principals:
 *  - a browser session (Better Auth cookie) from the web app
 *  - a device token (Authorization: Bearer tbm_…) from the extension
 * Both resolve to the same RequestUser; authorization decisions run on it.
 */

export interface RequestUser {
  id: string;
  email: string;
  name: string;
  plan: Plan;
  entitlements: Entitlements;
  deviceId?: string;
  aiEnabled: boolean;
  contentAnalysis: boolean;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** How long a failing payment keeps Pro while Stripe retries the card. */
const PAST_DUE_GRACE_MS = 14 * 24 * 60 * 60 * 1000;

export async function resolvePlan(userId: string): Promise<Plan> {
  const rows = await (await db())
    .select({
      plan: subscription.plan,
      status: subscription.status,
      currentPeriodEnd: subscription.currentPeriodEnd,
    })
    .from(subscription)
    .where(eq(subscription.userId, userId))
    .limit(1);
  const row = rows[0];
  if (!row || row.plan !== "pro") return "free";
  if (["active", "trialing"].includes(row.status)) return "pro";
  /**
   * past_due is a grace period, not a plan. Keeping Pro while Stripe retries a
   * card is right; keeping it forever is free Pro for anyone whose card fails,
   * and whether that ever ends depended on a Stripe dunning setting nothing in
   * this repo controls. Bound it here instead.
   */
  if (row.status === "past_due") {
    const end = row.currentPeriodEnd?.getTime() ?? 0;
    return end > Date.now() - PAST_DUE_GRACE_MS ? "pro" : "free";
  }
  return "free";
}

async function loadUser(userId: string, deviceId?: string): Promise<RequestUser> {
  const database = await db();
  const rows = await database
    .select({ id: user.id, email: user.email, name: user.name })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  const record = rows[0];
  if (!record) throw new HttpError(401, "auth-required", "Account not found.");
  const plan = await resolvePlan(userId);
  const prefRows = await database
    .select()
    .from(preference)
    .where(eq(preference.userId, userId))
    .limit(1);
  const prefs = prefRows[0];
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    plan,
    entitlements: entitlementsFor(plan),
    deviceId,
    aiEnabled: prefs?.aiEnabled ?? true,
    contentAnalysis: prefs?.contentAnalysis ?? false,
  };
}

export async function requireUser(request: Request): Promise<RequestUser> {
  const authorization = request.headers.get("authorization");
  if (authorization?.startsWith("Bearer tbm_")) {
    const token = authorization.slice("Bearer ".length);
    const tokenHash = sha256(token);
    const database = await db();
    const rows = await database
      .select({ id: device.id, userId: device.userId, lastSeenAt: device.lastSeenAt })
      .from(device)
      .where(and(eq(device.tokenHash, tokenHash), isNull(device.revokedAt)))
      .limit(1);
    const record = rows[0];
    if (!record) throw new HttpError(401, "auth-required", "This device is no longer connected.");
    /**
     * A device token that has gone unused for a long time is far more likely
     * to be a forgotten or leaked credential than a returning user, and it
     * used to authenticate forever. Expire the dormant ones; an active
     * extension heartbeats on every sync, so a real user never hits this.
     */
    const dormantFor = Date.now() - (record.lastSeenAt?.getTime() ?? 0);
    if (dormantFor > DEVICE_TOKEN_MAX_IDLE_MS) {
      await database
        .update(device)
        .set({ revokedAt: new Date() })
        .where(eq(device.id, record.id))
        .catch(() => undefined);
      throw new HttpError(401, "auth-required", "This device was disconnected after a long idle period. Reconnect it from Settings.");
    }
    // Touch lastSeenAt at most once a minute (cheap heartbeat).
    void database
      .update(device)
      .set({ lastSeenAt: new Date() })
      .where(eq(device.id, record.id))
      .catch(() => undefined);
    return loadUser(record.userId, record.id);
  }

  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session) throw new HttpError(401, "auth-required", "Sign in to continue.");
  return loadUser(session.user.id);
}

export async function requireSessionUser(): Promise<RequestUser> {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  if (!session) throw new HttpError(401, "auth-required", "Sign in to continue.");
  return loadUser(session.user.id);
}
