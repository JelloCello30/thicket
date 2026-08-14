// Zip dist/ into release/tabmind-<version>.zip for the Chrome Web Store.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const manifest = JSON.parse(readFileSync(path.join(dir, "manifest.json"), "utf8"));
const out = path.join(dir, "release");
mkdirSync(out, { recursive: true });
const zipPath = path.join(out, `tabmind-${manifest.version}.zip`);
if (existsSync(zipPath)) rmSync(zipPath);
execFileSync("zip", ["-r", "-q", zipPath, "."], { cwd: path.join(dir, "dist") });
console.log(`✓ ${path.relative(process.cwd(), zipPath)}`);
