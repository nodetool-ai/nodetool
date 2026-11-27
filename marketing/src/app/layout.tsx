import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Script from "next/script";
import MotionProvider from "../components/MotionProvider";
import JsonLd from "../components/JsonLd";
import { DEFAULT_OG_IMAGES } from "../lib/defaultOgImage";
import { HOME_LANGUAGE_ALTERNATES } from "../data/languagePages";
import {
  organizationSchema,
  softwareApplicationSchema,
  webSiteSchema,
} from "../lib/siteSchema";

// Self-hosted from @fontsource so `next build` makes no network request:
// `next/font/google` fetched the CSS and font files from Google on every
// build, and a failed fetch failed the build. One variable file covers
// weights 300 to 700. The five static files it replaced were all preloaded
// (120 KB), which on a slow phone connection delayed the hero image that is
// the LCP element on most pages.
const inter = localFont({
  src: "../../node_modules/@fontsource-variable/inter/files/inter-latin-wght-normal.woff2",
  weight: "300 700",
  style: "normal",
  variable: "--font-inter",
});
const jetBrainsMono = localFont({
  src: [
    {
      path: "../../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-500-normal.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../../node_modules/@fontsource/jetbrains-mono/files/jetbrains-mono-latin-600-normal.woff2",
      weight: "600",
      style: "normal",
    },
  ],
  display: "swap",
  // Code type sits below the fold on every page. Preloading its three files
  // spent mobile bandwidth on them before the hero poster, the LCP element.
  preload: false,
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "NodeTool | Open-source AI film studio, agents, node workflows",
  description:
    "Open-source AI film studio with agents and node workflows. Write a brief, approve stills before paying for video, edit on a multi-track timeline, and run on your own keys.",
  metadataBase: new URL("https://nodetool.ai"),
  // hreflang: the home page and /ja list each other. Every other route sets
  // its own `alternates`, which replaces this object, so the languages stay on
  // the home page only.
  alternates: {
    canonical: "/",
    languages: HOME_LANGUAGE_ALTERNATES,
  },
  keywords: [
    "agent-first creative workspace",
    "open source creative AI",
    "agents that build workflows",
    "MCP creative tools",
    "BYOK AI canvas",
    "AI workflow canvas",
    "ComfyUI alternative",
    "Weavy alternative",
    "Figma Weave alternative",
    "vendor-neutral AI tool",
    "node-based AI canvas",
    "Flux workflow",
    "Seedance workflow",
    "image video audio AI",
    "model-agnostic AI",
  ],
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    other: [{ rel: "manifest", url: "/site.webmanifest" }],
  },
  openGraph: {
    title: "NodeTool | Open-source AI film studio, agents, node workflows",
    description:
      "Open-source AI film studio with agents and node workflows. Write a brief, approve stills before paying for video, edit on a multi-track timeline, and run on your own keys.",
    url: "https://nodetool.ai",
    siteName: "NodeTool",
    images: DEFAULT_OG_IMAGES,
    locale: "en_US",
    type: "website",
  },
  // No title or description here: Next.js fills them from each page's
  // openGraph, which a root value would override on every child route.
  twitter: {
    card: "summary_large_image",
  },
};

/**
 * The root layout serves every route, so it renders <html lang="en"> and each
 * translated page marks its own <main> with its language. This script sets
 * the document language from the path before first paint, so the header,
 * footer, browser translate prompt, screen readers and CJK font selection
 * (see `:lang()` rules in globals.css) see the page's language too.
 */
const PATH_LANGUAGES: Record<string, string> = Object.fromEntries(
  Object.entries(HOME_LANGUAGE_ALTERNATES)
    .filter(([hreflang]) => hreflang !== "en" && hreflang !== "x-default")
    .map(([hreflang, path]) => [path.slice(1), hreflang])
);
const DOCUMENT_LANGUAGE_SCRIPT = `(function(){var l=${JSON.stringify(PATH_LANGUAGES)}[location.pathname.split("/")[1]];if(l)document.documentElement.lang=l;})();`;

export const viewport: Viewport = {
  themeColor: "#020617",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${jetBrainsMono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: DOCUMENT_LANGUAGE_SCRIPT }} />

        <JsonLd data={softwareApplicationSchema} />
        <JsonLd data={organizationSchema} />
        <JsonLd data={webSiteSchema} />

        <Script
          defer
          data-domain="nodetool.ai"
          src="https://plausible.io/js/script.file-downloads.outbound-links.pageview-props.tagged-events.js"
          strategy="afterInteractive"
        />
        <Script id="plausible-setup" strategy="afterInteractive">
          {`
            window.plausible = window.plausible || function() { 
              (window.plausible.q = window.plausible.q || []).push(arguments) 
            }
          `}
        </Script>
      </head>
      <body className={inter.className}>
        <MotionProvider>{children}</MotionProvider>
      </body>
    </html>
  );
}
