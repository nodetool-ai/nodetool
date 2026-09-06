import JsonLd from "../../components/JsonLd";
import type { Metadata } from "next";

const TITLE = "NodeTool Cloud | Open-source creative AI workspace (Alpha)";
const DESCRIPTION =
  "Open-source creative AI workspace. Create images, video, audio, and text with agents, then inspect and edit their work. Keep your project context together. Cloud is the hosted browser edition, in alpha. Use hosted storage and your own provider keys; no local model support.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/cloud",
  },
  keywords: [
    "NodeTool Cloud",
    "agent-first workspace",
    "browser AI agent",
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
            "Open-source creative AI workspace. Create images, video, audio, and text with agents, then inspect and edit their work. Keep your project context together. Cloud is the hosted browser edition, in alpha. Use hosted storage and your own provider keys; no local model support.",
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
