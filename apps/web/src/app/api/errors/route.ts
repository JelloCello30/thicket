import { randomUUID } from "node:crypto";
import { errorReportRequest } from "@tabmind/types";
import { errorReport } from "@tabmind/db/schema";
import { db } from "@/lib/db";
import { corsPreflight, handled, json } from "@/lib/http";
import { HttpError } from "@/lib/request-auth";
import { rateLimit } from "@/lib/rate-limit";
import { captureServerError } from "@/lib/monitoring";

export const OPTIONS = corsPreflight();

/** Extension error intake. Unauthenticated (errors can happen signed out), tightly rate limited. */
export const POST = handled(async (request) => {
  rateLimit(`errors:${request.headers.get("origin") ?? "unknown"}`, 20);
  const parsed = errorReportRequest.safeParse(await request.json());
  if (!parsed.success) throw new HttpError(400, "invalid", "Invalid error report.");
  const database = await db();
  await database.insert(errorReport).values({
    id: randomUUID(),
    userId: null,
    message: parsed.data.message,
    stack: parsed.data.stack ?? null,
    context: parsed.data.context ?? null,
    version: parsed.data.version ?? null,
  });
  captureServerError(new Error(`[extension] ${parsed.data.context ?? ""}: ${parsed.data.message}`));
  return json({ ok: true });
});
