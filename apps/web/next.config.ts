import type { NextConfig } from "next";

/**
 * The marketing site ships to GitHub Pages as a static export (see
 * scripts/build-static.mjs); the full app needs a server. One flag switches
 * between them so both builds come from the same source.
 */
const staticExport = process.env.STATIC_EXPORT === "1";
const basePath = process.env.PAGES_BASE_PATH || "";

const nextConfig: NextConfig = {
  ...(staticExport
    ? {
        output: "export" as const,
        // Pages serves project sites from /<repo>, and static export writes
        // real directories, so links need the trailing slash to resolve.
        trailingSlash: true,
        images: { unoptimized: true },
        ...(basePath ? { basePath, assetPrefix: basePath } : {}),
      }
    : {}),
  transpilePackages: [
    "@thicket/ui",
    "@thicket/core",
    "@thicket/types",
    "@thicket/config",
    "@thicket/db",
    "@thicket/ai",
  ],
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  eslint: { ignoreDuringBuilds: true },
  // Security headers are served by the host in the server build; a static
  // export cannot set them (Pages has no header config), so they're omitted
  // there rather than silently ignored.
  ...(staticExport ? {} : { headers }),
};

async function headers() {
  return [
    {
      source: "/(.*)",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
  ];
}

export default nextConfig;
