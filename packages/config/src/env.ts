import { z } from "zod";

/**
 * Server environment validation. Import ONLY from server-side code.
 * Every optional var degrades a specific feature and is documented in .env.example.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  /** Postgres. Absent in dev/test → PGlite at .pglite/ (real Postgres, zero setup). */
  DATABASE_URL: z.string().url().optional(),

  /** Required in production. */
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  BETTER_AUTH_URL: z.string().url().optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),

  /** Google OAuth. Absent → Google button hidden, magic link still works. */
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),

  /** Magic-link email. Absent in dev → link printed to server console. */
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("TabMind <login@tabmind.app>"),

  /** AI. Absent → local heuristics only; AI endpoints return 503 with a clear code. */
  ANTHROPIC_API_KEY: z.string().optional(),
  /** Embeddings for semantic search. Absent → lexical search only. */
  VOYAGE_API_KEY: z.string().optional(),

  /** Stripe. Absent → billing page shows "not configured" state; no fake checkout. */
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  STRIPE_PRICE_PRO_MONTHLY: z.string().optional(),
  STRIPE_PRICE_PRO_YEARLY: z.string().optional(),

  /** Observability, all optional. */
  SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  POSTHOG_KEY: z.string().optional(),
  POSTHOG_HOST: z.string().url().default("https://us.i.posthog.com"),

  /** Comma-separated extension IDs allowed for device linking + CORS. */
  TABMIND_EXTENSION_IDS: z.string().default(""),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | null = null;

export function serverEnv(): ServerEnv {
  if (cached) return cached;
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === "production") {
    const required: (keyof ServerEnv)[] = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"];
    const missing = required.filter((k) => !env[k]);
    if (missing.length > 0) {
      throw new Error(`Missing required production environment variables: ${missing.join(", ")}`);
    }
  }
  cached = env;
  return env;
}

/** Test-only: clear the memoized env. */
export function __resetEnvCache(): void {
  cached = null;
}

export const featureAvailability = (env: ServerEnv) => ({
  googleAuth: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  emailDelivery: Boolean(env.RESEND_API_KEY),
  ai: Boolean(env.ANTHROPIC_API_KEY),
  embeddings: Boolean(env.VOYAGE_API_KEY),
  billing: Boolean(
    env.STRIPE_SECRET_KEY &&
      env.STRIPE_WEBHOOK_SECRET &&
      env.STRIPE_PRICE_PRO_MONTHLY &&
      env.STRIPE_PRICE_PRO_YEARLY,
  ),
  sentry: Boolean(env.SENTRY_DSN),
  posthog: Boolean(env.POSTHOG_KEY),
});
