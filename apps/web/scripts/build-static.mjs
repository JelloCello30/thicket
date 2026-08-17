/**
 * Build the marketing site as a static export for GitHub Pages.
 *
 * The full app is a Next.js server app (auth, database, Stripe, API routes) and
 * cannot run on Pages. The marketing pages — home, pricing, privacy, terms,
 * download — have no server dependencies, so they export cleanly on their own.
 * That is exactly what a local-only launch needs: a real site and, critically,
 * a working privacy-policy URL for the Chrome Web Store listing.
 *
 * The dynamic routes are moved aside for the duration of the build (Next tries
 * to compile every route under app/, and route handlers are illegal in an
 * export) and restored afterwards, even if the build fails.
 *
 *   PAGES_BASE_PATH=/thicket node scripts/build-static.mjs
 *
 * Output: apps/web/out
 */
import { execFileSync } from "node:child_process";
import { existsSync, renameSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const webDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const appDir = path.join(webDir, "src", "app");
const parked = path.join(webDir, ".static-build-parked");

/** Routes that need a server. Excluded from the static site. */
const DYNAMIC_ROUTES = ["api", "app", "login", path.join("(marketing)", "pricing")];

const basePath = process.env.PAGES_BASE_PATH ?? "";
if (basePath && !/^\/[a-z0-9-]+$/.test(basePath)) {
  throw new Error(`PAGES_BASE_PATH must look like "/repo-name", got: ${basePath}`);
}

function park() {
  mkdirSync(parked, { recursive: true });
  for (const route of DYNAMIC_ROUTES) {
    const from = path.join(appDir, route);
    if (!existsSync(from)) continue;
    const to = path.join(parked, route);
    mkdirSync(path.dirname(to), { recursive: true }); // nested routes need their parent
    renameSync(from, to);
  }
}

function restore() {
  for (const route of DYNAMIC_ROUTES) {
    const from = path.join(parked, route);
    if (!existsSync(from)) continue;
    const to = path.join(appDir, route);
    mkdirSync(path.dirname(to), { recursive: true });
    renameSync(from, to);
  }
  rmSync(parked, { recursive: true, force: true });
}

let failed = null;
try {
  rmSync(path.join(webDir, "out"), { recursive: true, force: true });
  park();
  execFileSync("pnpm", ["exec", "next", "build"], {
    cwd: webDir,
    stdio: "inherit",
    env: { ...process.env, STATIC_EXPORT: "1", PAGES_BASE_PATH: basePath },
  });
} catch (error) {
  failed = error;
} finally {
  restore();
}
if (failed) throw failed;

// Pages serves from a plain file server; .nojekyll stops it from hiding
// directories that begin with an underscore, which is where Next puts assets.
writeFileSync(path.join(webDir, "out", ".nojekyll"), "");
console.log(`\n✓ static site in apps/web/out${basePath ? ` (base path ${basePath})` : ""}`);
