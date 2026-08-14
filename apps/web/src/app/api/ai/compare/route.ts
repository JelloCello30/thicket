import { aiCompareRequest } from "@tabmind/types";
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
  requireProFeature(user, "compare");
  const parsed = aiCompareRequest.safeParse(await request.json());
  if (!parsed.success) throw new HttpError(400, "invalid", "Invalid compare payload.");
  stripExcerptsUnlessAllowed(parsed.data.tabs, user.contentAnalysis);
  await enforceAiBudget(user, "compare");
  const { value } = await withAiCache(user, "compare", parsed.data, () => aiService.compare(parsed.data));
  // Wire shape: rows carry a values record keyed by column.
  return json({
    subject: value.subject,
    columns: value.columns,
    rows: value.rows.map((row) => ({
      key: row.key,
      values: Object.fromEntries(row.cells.map((cell) => [cell.column, cell.value])),
    })),
  });
});
