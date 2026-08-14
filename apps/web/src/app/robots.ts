import type { MetadataRoute } from "next";
import { serverEnv } from "@tabmind/config/env";

export default function robots(): MetadataRoute.Robots {
  const base = serverEnv().NEXT_PUBLIC_APP_URL;
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/api"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
