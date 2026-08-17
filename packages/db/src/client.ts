import { drizzle as drizzleNode, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";
import * as schema from "./schema";
import { defaultPgliteDir } from "./paths";

/**
 * One schema, two drivers:
 *  - production/staging: node-postgres against DATABASE_URL (managed Postgres
 *    with the pgvector extension — Neon, Supabase, RDS all qualify)
 *  - dev/test without DATABASE_URL: PGlite, a real Postgres compiled to WASM,
 *    persisted at .pglite/ (or in-memory for tests). Zero local setup.
 */
export type Db = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Db;
  kind: "postgres" | "pglite";
  close: () => Promise<void>;
}

interface GlobalDbCache {
  __thicketDb?: DbHandle;
}

const globalCache = globalThis as unknown as GlobalDbCache;

async function createPglite(dataDir: string): Promise<DbHandle> {
  // webpackIgnore: PGlite ships WASM/tarball assets that must load from
  // node_modules at runtime — bundling it breaks asset resolution.
  const { PGlite } = await import(/* webpackIgnore: true */ "@electric-sql/pglite");
  const { vector } = await import(/* webpackIgnore: true */ "@electric-sql/pglite/vector");
  const pglite = new PGlite(dataDir, { extensions: { vector } });
  const db = drizzlePglite(pglite, { schema }) as unknown as Db;
  return {
    db,
    kind: "pglite",
    close: async () => {
      await pglite.close();
    },
  };
}

function createNode(url: string): DbHandle {
  const pool = new Pool({ connectionString: url, max: 10 });
  const db = drizzleNode(pool, { schema });
  return {
    db,
    kind: "postgres",
    close: async () => {
      await pool.end();
    },
  };
}

export interface ConnectOptions {
  databaseUrl?: string;
  /** PGlite data directory; "memory://" for throwaway test databases. */
  pgliteDir?: string;
}

/** Create a fresh connection (used by tests and scripts). */
export async function connect(options: ConnectOptions = {}): Promise<DbHandle> {
  const url = options.databaseUrl ?? process.env.DATABASE_URL;
  if (url) return createNode(url);
  const dir = options.pgliteDir ?? process.env.PGLITE_DIR ?? defaultPgliteDir();
  return createPglite(dir);
}

/** Shared connection for the app — cached across HMR reloads in dev. */
export async function getDb(options: ConnectOptions = {}): Promise<DbHandle> {
  if (globalCache.__thicketDb) return globalCache.__thicketDb;
  const handle = await connect(options);
  globalCache.__thicketDb = handle;
  return handle;
}

export { schema };
