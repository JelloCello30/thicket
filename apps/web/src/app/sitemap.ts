import type { MetadataRoute } from "next";
import { serverEnv } from "@thicket/config/env";

/** Inherently static; `output: export` requires saying so explicitly. */
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = serverEnv().NEXT_PUBLIC_APP_URL;
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/pricing`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/download`, lastModified: now, changeFrequency: "monthly", priority: 0.9 },
    { url: `${base}/privacy`, lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${base}/terms`, lastModified: now, changeFrequency: "monthly", priority: 0.3 },
  ];
}
