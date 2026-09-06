import JsonLd from "../../components/JsonLd";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "AI for Advertising | NodeTool",
  description:
    "Put generative models into your creative and production pipeline, from the first idea through to delivery. Product videos, ad creative, social calendars, and brand assets from every major model, on your own keys. Teams move faster, pitch more ambitious work, and spend less doing it.",
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/marketing",
  },
  keywords: [
    "AI for advertising",
    "AI advertising workflow",
    "AI marketing agent",
    "agent-first marketing workspace",
    "AI product video generator",
    "AI content calendar tool",
    "brand asset generator AI",
    "AI ad video tool open source",
    "AI marketing workflow tool",
    "BYOK AI for marketing teams",
  ],
  openGraph: {
    title: "AI for Advertising | NodeTool",
    description:
      "From the first idea through to delivery: product videos, ad creative, social calendars, and brand assets, from every major model, on your own keys.",
    url: "https://nodetool.ai/marketing",
    siteName: "NodeTool",
    images: [
      {
        url: "/preview.png",
        alt: "NodeTool Marketing Workflow Canvas",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI for Advertising | NodeTool",
    description:
      "Every model. Your keys. Your agent. Advertising production end to end.",
    images: ["/preview.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#050510",
  colorScheme: "dark",
};

export default function MarketingLayout({
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
          name: "NodeTool for Marketing Teams",
          description:
            "The agent-first workspace for marketing teams: hand the brief to an agent and it builds the workflow that turns out product videos, ad creative, social calendars, and brand assets from every major model, with your own keys. No marked-up credits, no lock-in, output at campaign volume.",
          applicationCategory: "MultimediaApplication",
          operatingSystem: "macOS, Windows, Linux, Web browser",
          url: "https://nodetool.ai/marketing",
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
            { "@type": "ListItem", position: 2, name: "Marketing", item: "https://nodetool.ai/marketing" },
          ],
        }}
      />
      {children}
    </>
  );
}
