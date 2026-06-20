import JsonLd from "../../components/JsonLd";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NodeTool Cloud (Alpha) — Visual AI Workflows in Your Browser",
  description:
    "NodeTool Cloud is the hosted version of the open-source NodeTool platform, currently in alpha (not yet generally available). Build AI workflows in any browser, no install, no GPU. Bring your own API keys for OpenAI, Anthropic, Gemini, Replicate, and more. AGPL-3.0.",
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
