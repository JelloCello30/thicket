import { aiSummarizeRequest } from "@tabmind/types";
import {
  aiService,
  enforceAiBudget,
  requireAiConfigured,
  requireAiPreference,
  requireProFeature,
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
  requireProFeature(user, "summaries");
  const parsed = aiSummarizeRequest.safeParse(await request.json());
  if (!parsed.success) throw new HttpError(400, "invalid", "Invalid summarize payload.");
  stripExcerptsUnlessAllowed(parsed.data.tabs, user.contentAnalysis);
  await enforceAiBudget(user, "summarize");
  const { value } = await withAiCache(user, "summarize", parsed.data, () =>
    aiService.summarize(parsed.data),
  );
  return json(value);
});
