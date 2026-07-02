import JsonLd from "../../components/JsonLd";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "NodeTool for working creatives | The open creative AI workspace",
  description:
    "The open creative AI workspace, made for working artists, motion designers, and AI-native illustrators. Every major model from every major provider, called with your own keys, on one node-based canvas with masks, inpaint, outpaint, relight, upscale, and compositing built in.",
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/creatives",
  },
  keywords: [
    "creative AI workspace",
    "BYOK creative AI",
    "ComfyUI alternative for creatives",
    "Weavy alternative",
    "AI canvas for artists",
    "Flux workflow",
    "Seedance workflow",
    "ElevenLabs workflow",
    "AI tools for motion designers",
    "AI tools for illustrators",
  ],
  openGraph: {
    title: "NodeTool for working creatives | The open creative AI workspace",
    description:
      "Every model. Your keys. Your canvas. The open-source creative AI workspace for working artists, motion designers, and illustrators.",
    url: "https://nodetool.ai/creatives",
    siteName: "NodeTool",
    images: [
      {
        url: "/preview.png",
        alt: "NodeTool Creative Workflow Canvas",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NodeTool for working creatives",
    description:
      "Every model. Your keys. Your canvas. The open creative AI workspace.",
    images: ["/preview.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#050510",
  colorScheme: "dark",
};

export default function CreativesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "NodeTool for Creatives",
          description:
            "The open creative AI workspace for working artists, motion designers, and AI-native illustrators. Every major model from every major provider, called with your own keys, on one node-based canvas with masks, inpaint, outpaint, relight, upscale, and compositing built in.",
          applicationCategory: "MultimediaApplication",
          operatingSystem: "macOS, Windows, Linux, Web browser",
          url: "https://nodetool.ai/creatives",
          license: "https://github.com/nodetool-ai/nodetool/blob/main/LICENSE",
          author: { "@type": "Organization", name: "NodeTool", url: "https://nodetool.ai" },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://nodetool.ai" },
            { "@type": "ListItem", position: 2, name: "Creatives", item: "https://nodetool.ai/creatives" },
          ],
        }}
      />
      {children}
    </>
  );
}
