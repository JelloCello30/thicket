import type { Metadata, Viewport } from "next";
import { BRAND, SEO } from "@thicket/config";
import { serverEnv } from "@thicket/config/env";
import "./globals.css";

const env = serverEnv();

export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: {
    default: SEO.title,
    template: "%s — Thicket",
  },
  description: SEO.description,
  applicationName: BRAND.name,
  icons: {
    icon: [
      { url: "/favicon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-32.png", sizes: "32x32" },
    ],
    apple: "/icons/icon-180.png",
  },
  openGraph: {
    type: "website",
    siteName: BRAND.name,
    title: SEO.title,
    description: SEO.description,
    url: env.NEXT_PUBLIC_APP_URL,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "42 tabs. 4 actual things. Thicket." }],
  },
  twitter: {
    card: "summary_large_image",
    title: SEO.title,
    description: SEO.description,
    images: ["/og.png"],
  },
  alternates: { canonical: "/" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#faf9f7" },
    { media: "(prefers-color-scheme: dark)", color: "#161614" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          // Set theme before paint to avoid a flash; system preference wins.
          dangerouslySetInnerHTML={{
            __html: `try{if(matchMedia("(prefers-color-scheme: dark)").matches)document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
      </head>
      <body className="bg-bg font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
