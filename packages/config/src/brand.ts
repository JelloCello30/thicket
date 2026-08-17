export const BRAND = {
  name: "Thicket",
  tagline: "Your tabs, organized by what you're actually doing.",
  shortLine: "Never organize a browser tab again.",
  domain: "jellocello30.github.io",
  url: "https://jellocello30.github.io/thicket",
  supportEmail: "nolan.h.woo@gmail.com",
  /** Chrome Web Store listing URL — fill in after first publish. */
  chromeStoreUrl: "https://chromewebstore.google.com/detail/thicket/EXTENSION_ID_PENDING",
} as const;

export const SEO = {
  title: "Thicket — Your tabs, organized",
  description:
    "Thicket organizes your browser tabs by what you're actually doing, remembers your research, and helps you find anything again. Runs entirely on your device.",
} as const;

/**
 * True for the static, server-less build of the site (GitHub Pages).
 * In that build there is no account, no sync, and nothing to buy — so the site
 * must not link to sign-in or advertise a plan a visitor cannot purchase.
 * The full server build leaves all of it in place.
 */
export const LOCAL_ONLY = process.env.STATIC_EXPORT === "1";
