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
export default defineConfig(({ mode }) => ({
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
    __APP_URL__: JSON.stringify(
      mode === "development" ? "http://localhost:3000" : "https://tabmind.app",
    ),
    __EXT_VERSION__: JSON.stringify(process.env.npm_package_version ?? "0.1.0"),
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
        focus: path.resolve(__dirname, "focus.html"),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "background" ? "background.js" : "assets/[name]-[hash].js"),
      },
    },
  },
}));
