import { featureAvailability, serverEnv } from "@thicket/config/env";
import { corsPreflight, handled, json } from "@/lib/http";

export const dynamic = "force-dynamic";
export const OPTIONS = corsPreflight();

/**
 * What this deployment can actually do, as data.
 *
 * The extension is a complete product on its own and must never advertise a
 * server feature that isn't there — a sign-in button pointing at nothing, or
 * an "AI summary" that 503s, is worse than no button. Rather than hardcoding
 * that judgement into the extension, it asks the server it is configured
 * against and shows exactly what is available. Deploying with Stripe and
 * Anthropic keys therefore turns the paid tier on with no extension release.
 *
 * Public and unauthenticated on purpose: it reveals only which features are
 * configured, never any key or user data.
 */
export const GET = handled(async () => {
  const available = featureAvailability(serverEnv());
  return json(
    {
      accounts: true, // this endpoint answering at all means there is a server
      ai: available.ai,
      embeddings: available.embeddings,
      billing: available.billing,
      googleAuth: available.googleAuth,
      emailDelivery: available.emailDelivery,
    },
    { headers: { "cache-control": "public, max-age=300" } },
  );
});
