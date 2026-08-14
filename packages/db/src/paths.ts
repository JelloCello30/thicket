import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Locate repo-relative resources without import.meta.url (which bundlers
 * try to statically resolve). Walk up from cwd to the workspace root.
 */
export function findWorkspaceRoot(start = process.cwd()): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

export function defaultPgliteDir(): string {
  return path.join(findWorkspaceRoot(), ".pglite");
}

export function defaultMigrationsDir(): string {
  return path.join(findWorkspaceRoot(), "packages", "db", "drizzle");
}
