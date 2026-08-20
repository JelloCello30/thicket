// Zip dist/ into release/thicket-<version>.zip for the Chrome Web Store,
// after asserting the artifact matches what the store listing claims.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
const out = path.join(dir, "release");
mkdirSync(out, { recursive: true });

const distManifestPath = path.join(dir, "dist", "manifest.json");
const shipped = JSON.parse(readFileSync(distManifestPath, "utf8"));

/**
 * Two artifacts come out of this repo and they have opposite invariants. The
 * store build talks to nothing and must prove it. A server build (built with
 * THICKET_APP_URL set) is supposed to call an API, so asserting "no fetch"
 * against it would be asserting the feature is broken.
 */
const serverOrigin = process.env.THICKET_APP_URL?.replace(/\/$/, "");
const localOnly = !serverOrigin;

/**
 * Harden the manifest for the public build. `externally_connectable` lists
 * localhost so the sign-in handoff works during development — but shipping it
 * means any page served from a dev server on that port, on any user's machine,
 * can message the extension and attempt to link a device. The published
 * artifact must only trust the real web app. The local-only build ships the
 * key not at all: with no accounts there is nothing to hand off.
 */
if (!localOnly) {
  // The sign-in handoff has to trust exactly one origin: the configured server.
  shipped.externally_connectable = { matches: [`${serverOrigin}/*`] };
  writeFileSync(distManifestPath, `${JSON.stringify(shipped, null, 2)}\n`);
  console.log(`· externally_connectable pinned to ${serverOrigin}`);
} else if (shipped.externally_connectable) {
  const before = shipped.externally_connectable.matches ?? [];
  const after = before.filter((m) => !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(m));
  if (after.length !== before.length) {
    shipped.externally_connectable.matches = after;
    writeFileSync(distManifestPath, `${JSON.stringify(shipped, null, 2)}\n`);
    console.log(`· stripped dev origins from externally_connectable: ${before.filter((m) => !after.includes(m)).join(", ")}`);
  }
  if (after.length === 0) {
    throw new Error("externally_connectable has no production origin — the sign-in handoff would be dead.");
  }
}

/**
 * Everything the Chrome Web Store listing promises, checked against the bytes
 * actually being uploaded. A permission the code cannot exercise is a
 * rejection; a `/api/` upload path inside a package declared "collects
 * nothing" is worse than a rejection. Both are cheap to assert here and
 * expensive to discover after submitting.
 */
const ALLOWED_PERMISSIONS = ["tabs", "tabGroups", "storage", "alarms", "favicon"];
const declared = shipped.permissions ?? [];
const unexpected = declared.filter((p) => !ALLOWED_PERMISSIONS.includes(p));
if (unexpected.length > 0) {
  throw new Error(
    `manifest declares permissions the store listing does not justify: ${unexpected.join(", ")}. ` +
      `Add the justification to docs/CHROME_WEB_STORE.md and this list together, or drop the permission.`,
  );
}
if ((shipped.optional_host_permissions ?? []).length > 0 || (shipped.host_permissions ?? []).length > 0) {
  throw new Error("host permissions are declared but nothing in this build reads a page.");
}

const jsFiles = [];
const walk = (p) => {
  for (const name of readdirSync(p)) {
    const full = path.join(p, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (full.endsWith(".js")) jsFiles.push(full);
  }
};
walk(path.join(dir, "dist"));

for (const file of localOnly ? jsFiles : []) {
  const source = readFileSync(file, "utf8");
  const rel = path.relative(dir, file);
  const endpoint = source.match(/["'`]\/api\/[a-z/]+/);
  if (endpoint) {
    throw new Error(
      `${rel} contains a server endpoint (${endpoint[0].slice(1)}) — the local-only build must not ` +
        `carry an upload path while the listing declares that nothing is collected.`,
    );
  }
  if (/\bfetch\(/.test(source)) {
    throw new Error(`${rel} calls fetch() — this build is meant to make no network request at all.`);
  }
  if (/chrome\.scripting\b/.test(source)) {
    throw new Error(`${rel} references chrome.scripting, which this build does not have permission for.`);
  }
}
console.log(
  localOnly
    ? `· verified ${jsFiles.length} bundled scripts: no fetch, no /api endpoint, no scripting`
    : `· server build for ${serverOrigin} — network assertions skipped by design`,
);

const zipPath = path.join(out, `thicket-${manifest.version}.zip`);
if (existsSync(zipPath)) rmSync(zipPath);
execFileSync("zip", ["-r", "-q", zipPath, "."], { cwd: path.join(dir, "dist") });
console.log(`✓ ${path.relative(process.cwd(), zipPath)}`);
