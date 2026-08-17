import "server-only";
import { getDb, migrate, type DbHandle } from "@thicket/db";

/**
 * One shared handle for the whole app, created lazily on first use — never
 * at build time. In dev without DATABASE_URL this is PGlite (real
 * Postgres/WASM) and migrations apply automatically; in production it's
 * managed Postgres and migrations run at deploy time.
 */
async function initialize(): Promise<DbHandle> {
  const handle = await getDb();
  if (handle.kind === "pglite") {
    await migrate(handle);
  }
  return handle;
}

const globalCache = globalThis as unknown as { __tabmindDbInit?: Promise<DbHandle> };

export function dbHandle(): Promise<DbHandle> {
  return (globalCache.__tabmindDbInit ??= initialize());
}

export async function db() {
  return (await dbHandle()).db;
}
