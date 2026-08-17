import { aiCommandRequest } from "@thicket/types";
import { aiService, enforceAiBudget, requireAiConfigured, requireAiPreference, withAiCache } from "@/lib/ai-server";
import { corsPreflight, handled, json } from "@/lib/http";
import { HttpError, requireUser } from "@/lib/request-auth";

export const OPTIONS = corsPreflight();

export const POST = handled(async (request) => {
  const user = await requireUser(request);
  requireAiConfigured();
  requireAiPreference(user);
  const parsed = aiCommandRequest.safeParse(await request.json());
  if (!parsed.success) throw new HttpError(400, "invalid", "Invalid command payload.");
  await enforceAiBudget(user, "command");
  const { value } = await withAiCache(user, "command", parsed.data, () => aiService.command(parsed.data));
  return json(value);
});
