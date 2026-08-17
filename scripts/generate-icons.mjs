// Rasterize the Thicket mark into the PNG sizes Chrome requires.
// Run: node scripts/generate-icons.mjs
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const markSvg = (bg = "#2f6b4f", fg = "#ffffff") => `
<svg width="512" height="512" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="32" height="32" rx="8" fill="${bg}"/>
  <rect x="8" y="9.5" width="16" height="3" rx="1.5" fill="${fg}" fill-opacity="0.95"/>
  <rect x="8" y="14.5" width="9" height="3" rx="1.5" fill="${fg}" fill-opacity="0.55"/>
  <rect x="8" y="19.5" width="13" height="3" rx="1.5" fill="${fg}" fill-opacity="0.95"/>
</svg>`;

const targets = [
  { dir: "apps/extension/public/icons", sizes: [16, 32, 48, 128] },
  { dir: "apps/web/public/icons", sizes: [16, 32, 48, 180, 192, 512] },
];

for (const target of targets) {
  const out = path.join(root, target.dir);
  await mkdir(out, { recursive: true });
  for (const size of target.sizes) {
    const png = await sharp(Buffer.from(markSvg())).resize(size, size).png().toBuffer();
    await writeFile(path.join(out, `icon-${size}.png`), png);
  }
  console.log(`✓ ${target.dir}: ${target.sizes.join(", ")}`);
}

// Favicon SVG for the web app.
await writeFile(path.join(root, "apps/web/public/favicon.svg"), markSvg().trim());
console.log("✓ apps/web/public/favicon.svg");
