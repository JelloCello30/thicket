import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { magicLink } from "better-auth/plugins";
import { serverEnv } from "@thicket/config/env";
import * as schema from "@thicket/db/schema";
import { dbHandle } from "./db";
import { sendMagicLinkEmail } from "./email";

/** Lazily constructed so importing this module never touches the database at build time. */
function build(db: Awaited<ReturnType<typeof dbHandle>>["db"]) {
  const env = serverEnv();
  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    secret: env.BETTER_AUTH_SECRET ?? "dev-secret-change-me-in-production-0000",
    baseURL: env.BETTER_AUTH_URL ?? env.NEXT_PUBLIC_APP_URL,
    session: {
      expiresIn: 60 * 60 * 24 * 30,
      updateAge: 60 * 60 * 24,
    },
    socialProviders:
      env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
        ? {
            google: {
              clientId: env.GOOGLE_CLIENT_ID,
              clientSecret: env.GOOGLE_CLIENT_SECRET,
            },
          }
        : {},
    plugins: [
      magicLink({
        expiresIn: 600,
        sendMagicLink: async ({ email, url }) => {
          await sendMagicLinkEmail(email, url);
        },
      }),
    ],
  });
}

export type Auth = ReturnType<typeof build>;

const globalCache = globalThis as unknown as { __tabmindAuth?: Promise<Auth> };

export function getAuth(): Promise<Auth> {
  return (globalCache.__tabmindAuth ??= dbHandle().then(({ db }) => build(db)));
}
