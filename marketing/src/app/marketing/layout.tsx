import JsonLd from "../../components/JsonLd";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "NodeTool for marketing teams | AI production at campaign scale",
  description:
    "The open AI workspace for marketing teams: product videos, ad creative, social calendars, and brand assets from every major model, called with your own keys, on one node-based canvas. No marked-up credits, no lock-in, output at campaign volume.",
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/marketing",
  },
  keywords: [
    "AI product video generator",
    "AI content calendar tool",
    "brand asset generator AI",
    "AI ad video tool open source",
    "AI marketing workflow tool",
    "BYOK AI for marketing teams",
  ],
  openGraph: {
    title: "NodeTool for marketing teams | AI production at campaign scale",
    description:
      "Product videos, ad creative, social calendars, and brand assets — every model, your keys, one canvas built for campaign volume.",
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
    title: "NodeTool for marketing teams",
    description:
      "Every model. Your keys. Your canvas. AI production at campaign scale.",
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
            "The open AI workspace for marketing teams: product videos, ad creative, social calendars, and brand assets from every major model, called with your own keys, on one node-based canvas. No marked-up credits, no lock-in, output at campaign volume.",
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
