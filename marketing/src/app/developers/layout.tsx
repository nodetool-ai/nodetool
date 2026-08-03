import type { Metadata, Viewport } from "next";
import JsonLd from "../../components/JsonLd";

export const metadata: Metadata = {
  title: "NodeTool for Developers | Agent-First SDK, API & MCP Server",
  description:
    "Build creative AI applications with NodeTool's TypeScript SDK and REST API — or let an agent do it: every editor is exposed as tools, around 120 in all, over MCP for Claude Code and any MCP-aware agent. Write custom nodes in TypeScript or Python, validate and debug workflows from the CLI, deploy to production. Open source under AGPL-3.0.",
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/developers",
  },
  keywords: [
    "AI SDK",
    "MCP server",
    "agent tools API",
    "agent-first platform",
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
    title: "NodeTool for Developers | Agent-First SDK, API & MCP Server",
    description:
      "Build creative AI applications with NodeTool's TypeScript SDK and REST API — or point your agent at the MCP server and let it build them. Write custom nodes in TypeScript or Python, integrate with any model, and deploy to production.",
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
      "Agent-first SDK, API, and MCP server for creative AI applications. Open source under AGPL-3.0.",
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
            "Open-source, agent-first creative workspace. TypeScript SDK, REST API, and an MCP server exposing every editor as agent tools; write custom nodes in TypeScript or Python, drive the canvas from a CLI, and generate workflows in code.",
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
