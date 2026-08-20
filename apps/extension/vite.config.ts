import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";

/**
 * Single Vite build with three entries: the MV3 service worker (module type,
 * so shared chunks via static imports are fine) and two HTML surfaces.
 * The manifest is static and copied verbatim.
 */
export default defineConfig(({ mode }) => {
  const serverOrigin =
    process.env.THICKET_APP_URL?.replace(/\/$/, "") ??
    (mode === "development" ? "http://localhost:3000" : undefined);
  const localOnly = !serverOrigin;

  return {
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "copy-manifest",
      closeBundle() {
        mkdirSync("dist", { recursive: true });
        copyFileSync("manifest.json", "dist/manifest.json");
      },
    },
  ],
  define: {
    __APP_URL__: JSON.stringify(serverOrigin ?? "https://jellocello30.github.io/thicket"),
    __EXT_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.1.0"),
    /**
     * The shipped build is local-only: no account, no sync, no AI, no
     * telemetry, and no server to reach. This is a compile-time literal so
     * Rollup deletes the entire HTTP client from the bundle rather than
     * leaving it present-but-unreachable — "no server" should be provable by
     * reading the uploaded artifact, not by trusting that an endpoint 404s.
     * scripts/package.mjs asserts the result.
     *
     * Keyed on whether a server was actually configured, NOT on dev-vs-prod:
     * keying it on mode would make every production build local-only forever,
     * so deploying a server later could never turn the paid tier back on.
     * Build the store artifact with no env var; build a server-backed one with
     * THICKET_APP_URL=https://your-host pnpm build.
     */
    __LOCAL_ONLY__: JSON.stringify(localOnly),
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: mode === "development",
    minify: mode !== "development",
    modulePreload: false,
    rollupOptions: {
      input: {
        background: path.resolve(__dirname, "src/background/index.ts"),
        popup: path.resolve(__dirname, "popup.html"),
        dashboard: path.resolve(__dirname, "dashboard.html"),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
      },
    },
  },
};
});
