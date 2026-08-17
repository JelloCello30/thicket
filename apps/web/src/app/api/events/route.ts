import { eventsBatchRequest } from "@thicket/types";
import { RATE_LIMITS } from "@thicket/config";
import { corsPreflight, handled, json } from "@/lib/http";
import { HttpError, requireUser } from "@/lib/request-auth";
import { rateLimit } from "@/lib/rate-limit";
import { track } from "@/lib/track";

export const OPTIONS = corsPreflight();

const ALLOWED_EVENTS = new Set([
  "extension_installed",
  "extension_linked",
  "onboarding_completed",
  "first_analysis",
  "workspace_saved",
  "workspace_restored",
  "tabs_cleaned",
  "ai_command_used",
  "search_used",
  "upgrade_started",
]);

export const POST = handled(async (request) => {
  const user = await requireUser(request);
  rateLimit(`events:${user.id}`, RATE_LIMITS.eventsPerMinute);
  const parsed = eventsBatchRequest.safeParse(await request.json());
  if (!parsed.success) throw new HttpError(400, "invalid", "Invalid events payload.");
  for (const item of parsed.data.events) {
    if (!ALLOWED_EVENTS.has(item.name)) continue; // allowlist: no arbitrary event names
    await track(item.name, item.props, { userId: user.id, deviceId: user.deviceId }, new Date(item.at));
  }
  return json({ ok: true });
});
