import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import Script from "next/script";
import MotionProvider from "../components/MotionProvider";
import JsonLd from "../components/JsonLd";
import {
  organizationSchema,
  softwareApplicationSchema,
} from "../lib/siteSchema";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});
const jetBrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  style: ["normal"],
  display: "swap",
  variable: "--font-jetbrains-mono",
});

export const metadata: Metadata = {
  title: "NodeTool | Open-source creative AI workspace",
  description:
    "Open-source creative AI workspace. Create images, video, audio, and text with agents, then inspect and edit their work. Keep your project context together.",
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/",
  },
  keywords: [
    "agent-first creative workspace",
    "creative AI workspace",
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
    title: "NodeTool | Open-source creative AI workspace",
    description:
      "Open-source creative AI workspace. Create images, video, audio, and text with agents, then inspect and edit their work. Keep your project context together.",
    url: "https://nodetool.ai",
    siteName: "NodeTool",
    images: [
      {
        url: "/preview.png",
        alt: "NodeTool | Open-source creative AI workspace",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NodeTool | Open-source creative AI workspace",
    description:
      "Open-source creative AI workspace. Create images, video, audio, and text with agents, then inspect and edit their work. Keep your project context together.",
    images: ["/preview.png"],
  },
};

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
    <html lang="en" className={`${inter.variable} ${jetBrainsMono.variable}`}>
      <head>

        <JsonLd data={softwareApplicationSchema} />
        <JsonLd data={organizationSchema} />

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
