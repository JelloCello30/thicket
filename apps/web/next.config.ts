import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: [
    "@tabmind/ui",
    "@tabmind/core",
    "@tabmind/types",
    "@tabmind/config",
    "@tabmind/db",
    "@tabmind/ai",
  ],
  serverExternalPackages: ["@electric-sql/pglite", "pg"],
  eslint: { ignoreDuringBuilds: true },
  async headers() {
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
  },
};

export default nextConfig;
