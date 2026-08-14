import { randomBytes, randomUUID } from "node:crypto";
import { deviceLinkCode } from "@tabmind/db/schema";
import { db } from "@/lib/db";
import { handled, json } from "@/lib/http";
import { requireSessionUser, sha256 } from "@/lib/request-auth";
import { rateLimit } from "@/lib/rate-limit";

/** Browser session mints a short-lived one-time code the extension can redeem. */
export const POST = handled(async () => {
  const user = await requireSessionUser();
  rateLimit(`link:${user.id}`, 10);
  // 8 chars, unambiguous alphabet, grouped for humans: "K7FQ-2MXR"
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  const raw = Array.from(randomBytes(8), (b) => alphabet[b % alphabet.length]).join("");
  const code = `${raw.slice(0, 4)}-${raw.slice(4)}`;
  const database = await db();
  await database.insert(deviceLinkCode).values({
    id: randomUUID(),
    userId: user.id,
    codeHash: sha256(code),
    expiresAt: new Date(Date.now() + 10 * 60_000),
  });
  return json({ code, expiresInSeconds: 600 });
});
