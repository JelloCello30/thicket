import type { MetadataRoute } from "next";
import { BRAND, SEO } from "@thicket/config";

/** Inherently static; `output: export` requires saying so explicitly. */
export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: BRAND.name,
    short_name: BRAND.name,
    description: SEO.description,
    start_url: "/",
    display: "browser",
    background_color: "#faf9f7",
    theme_color: "#2f6b4f",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
