/** Server-side Sentry, env-gated: a DSN turns it on, absence keeps it fully out. */
export async function register() {
  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 0.1,
      enableLogs: false,
    });
  }
}

export async function onRequestError(error: unknown) {
  if (process.env.SENTRY_DSN) {
    const Sentry = await import("@sentry/nextjs");
    Sentry.captureException(error);
  }
}
