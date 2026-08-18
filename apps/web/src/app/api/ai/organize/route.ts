import { aiOrganizeRequest } from "@thicket/types";
import {
  aiService,
  enforceAiBudget,
  requireAiConfigured,
  requireAiPreference,
  stripExcerptsUnlessAllowed,
  withAiCache,
} from "@/lib/ai-server";
import { corsPreflight, handled, json } from "@/lib/http";
import { HttpError, requireUser } from "@/lib/request-auth";

export const OPTIONS = corsPreflight();

export const POST = handled(async (request) => {
  const user = await requireUser(request);
  requireAiConfigured();
  requireAiPreference(user);
  const parsed = aiOrganizeRequest.safeParse(await request.json());
  if (!parsed.success) throw new HttpError(400, "invalid", "Invalid organize payload.");
  stripExcerptsUnlessAllowed(parsed.data.tabs, user.contentAnalysis);
  const aiClaim = await enforceAiBudget(user, "organize");
  const { value, cached } = await withAiCache(user, "organize", parsed.data, () =>
    aiService.organize(parsed.data),
    aiClaim,
  );
  return json({ groups: value.groups, cached });
});
