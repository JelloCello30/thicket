// Zip dist/ into release/thicket-<version>.zip for the Chrome Web Store.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
const out = path.join(dir, "release");
mkdirSync(out, { recursive: true });

/**
 * Harden the manifest for the public build. `externally_connectable` lists
 * localhost so the sign-in handoff works during development — but shipping it
 * means any page served from a dev server on that port, on any user's machine,
 * can message the extension and attempt to link a device. The published
 * artifact must only trust the real web app.
 */
const distManifestPath = path.join(dir, "dist", "manifest.json");
const shipped = JSON.parse(readFileSync(distManifestPath, "utf8"));
const before = shipped.externally_connectable?.matches ?? [];
const after = before.filter((m) => !/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/)/.test(m));
if (after.length !== before.length) {
  shipped.externally_connectable.matches = after;
  writeFileSync(distManifestPath, `${JSON.stringify(shipped, null, 2)}\n`);
  console.log(`· stripped dev origins from externally_connectable: ${before.filter((m) => !after.includes(m)).join(", ")}`);
}
if (after.length === 0) {
  throw new Error("externally_connectable has no production origin — the sign-in handoff would be dead.");
}

const zipPath = path.join(out, `thicket-${manifest.version}.zip`);
if (existsSync(zipPath)) rmSync(zipPath);
execFileSync("zip", ["-r", "-q", zipPath, "."], { cwd: path.join(dir, "dist") });
console.log(`✓ ${path.relative(process.cwd(), zipPath)}`);
