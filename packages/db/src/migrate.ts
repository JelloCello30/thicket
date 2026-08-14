import { sql } from "drizzle-orm";
import { connect, type DbHandle } from "./client";

/**
 * Apply all pending migrations. Used by `pnpm db:migrate`, the test setup,
 * and (optionally) at deploy time. Works against both drivers.
 */
export async function migrate(handle: DbHandle, migrationsFolder?: string): Promise<void> {
  const folder = migrationsFolder ?? new URL("../drizzle", import.meta.url).pathname;
  // pgvector must exist before the generated migrations reference it.
  await handle.db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
  if (handle.kind === "postgres") {
    const { migrate: migrateNode } = await import("drizzle-orm/node-postgres/migrator");
    await migrateNode(handle.db as never, { migrationsFolder: folder });
  } else {
    const { migrate: migratePglite } = await import("drizzle-orm/pglite/migrator");
    await migratePglite(handle.db as never, { migrationsFolder: folder });
  }
}

const isMain = process.argv[1]?.endsWith("migrate.ts") || process.argv[1]?.endsWith("migrate.js");
if (isMain) {
  const handle = await connect();
  try {
    await migrate(handle);
    console.log(`✓ migrations applied (${handle.kind})`);
  } finally {
    await handle.close();
  }
}
