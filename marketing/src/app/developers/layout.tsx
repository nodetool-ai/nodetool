import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "NodeTool for Developers | Open-Source AI Workflow SDK & API",
  description:
    "Build AI-powered applications with NodeTool's Python SDK and REST API. Create custom nodes, integrate with any model, and deploy to production. Open-source, extensible, and developer-friendly.",
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/developers",
  },
  keywords: [
    "AI SDK",
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
    "AI orchestration framework",
  ],
  openGraph: {
    title: "NodeTool for Developers | Open-Source AI Workflow SDK & API",
    description:
      "Build AI-powered applications with NodeTool's Python SDK and REST API. Create custom nodes, integrate with any model, and deploy to production.",
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
      "Build AI-powered applications with NodeTool's Python SDK and REST API. Open-source and extensible.",
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
  return children;
}
