import JsonLd from "../../components/JsonLd";
import type { Metadata } from "next";

const TITLE = "Build AI Workflows in Your Browser — NodeTool Cloud (Alpha)";
const DESCRIPTION =
  "Build AI workflows in your browser — no install, no GPU required. NodeTool Cloud is the hosted, browser-based edition of the open-source NodeTool platform, currently in alpha (not yet generally available). Bring your own API keys for OpenAI, Anthropic, Gemini, Replicate, and more. AGPL-3.0.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/cloud",
  },
  keywords: [
    "NodeTool Cloud",
    "hosted AI workflows",
    "browser AI workflow builder",
    "BYOK AI",
    "no GPU AI",
    "team AI workflows",
    "managed AI platform",
    "open source SaaS",
    "OpenAI workflow",
    "Anthropic Claude workflow",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://nodetool.ai/cloud",
    siteName: "NodeTool",
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function CloudLayout({
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
          name: "NodeTool Cloud",
          description:
            "Hosted, browser-based edition of the open-source NodeTool platform (alpha). Build AI workflows with no install and no GPU, bringing your own API keys for OpenAI, Anthropic, Gemini, Replicate, and more.",
          applicationCategory: "MultimediaApplication",
          operatingSystem: "Web browser",
          url: "https://nodetool.ai/cloud",
          softwareVersion: "alpha",
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
            { "@type": "ListItem", position: 2, name: "Cloud", item: "https://nodetool.ai/cloud" },
          ],
        }}
      />
      {children}
    </>
  );
}
