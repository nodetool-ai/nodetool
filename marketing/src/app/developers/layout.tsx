import type { Metadata, Viewport } from "next";
import JsonLd from "../../components/JsonLd";

export const metadata: Metadata = {
  title: "NodeTool for Developers | Open-Source AI Workflow SDK & API",
  description:
    "Build creative AI applications with NodeTool's TypeScript SDK and REST API. Workflows run in an async Node.js runner. Write custom nodes in TypeScript or Python, integrate with any model, and deploy to production. Open source under AGPL-3.0.",
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/developers",
  },
  keywords: [
    "AI SDK",
    "TypeScript AI framework",
    "Python AI framework",
    "AI workflow API",
    "open-source AI",
    "custom AI nodes",
    "AI development tools",
    "LLM integration",
    "machine learning SDK",
    "AI automation API",
    "self-hosted AI platform",
    "developer AI tools",
    "model-agnostic SDK",
  ],
  openGraph: {
    title: "NodeTool for Developers | Open-Source AI Workflow SDK & API",
    description:
      "Build creative AI applications with NodeTool's TypeScript SDK and REST API. Workflows run in an async Node.js runner. Write custom nodes in TypeScript or Python, integrate with any model, and deploy to production.",
    url: "https://nodetool.ai/developers",
    siteName: "NodeTool",
    images: [
      {
        url: "/preview.png",
        alt: "NodeTool Developer Platform",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NodeTool for Developers",
    description:
      "Build creative AI applications with NodeTool's TypeScript SDK and REST API. Open source under AGPL-3.0.",
    images: ["/preview.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#050510",
  colorScheme: "dark",
};

export default function DevelopersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareSourceCode",
          name: "NodeTool",
          description:
            "Open-source creative AI workspace. TypeScript SDK and REST API; write custom nodes in TypeScript or Python, drive the canvas from a CLI, and generate workflows in code.",
          codeRepository: "https://github.com/nodetool-ai/nodetool",
          programmingLanguage: ["TypeScript", "Python"],
          license: "https://github.com/nodetool-ai/nodetool/blob/main/LICENSE",
          url: "https://nodetool.ai/developers",
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://nodetool.ai" },
            { "@type": "ListItem", position: 2, name: "Developers", item: "https://nodetool.ai/developers" },
          ],
        }}
      />
      {children}
    </>
  );
}
