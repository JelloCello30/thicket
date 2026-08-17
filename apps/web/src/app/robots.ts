import type { MetadataRoute } from "next";
import { serverEnv } from "@thicket/config/env";

/** Inherently static; `output: export` requires saying so explicitly. */
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  const base = serverEnv().NEXT_PUBLIC_APP_URL;
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/app", "/api"] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
