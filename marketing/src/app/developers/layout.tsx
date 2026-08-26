import type { Metadata, Viewport } from "next";
import JsonLd from "../../components/JsonLd";

export const metadata: Metadata = {
  title: "NodeTool for Developers | The QuickJS Sandbox, the DSL, and Agent Code Execution",
  description:
    "One QuickJS WebAssembly isolate runs every Code node body, saved script, and agent action in NodeTool. Capabilities are globals granted per run, libraries are imports from 38 shipped packs, and 424 AI nodes are async functions you can await. 208 platform tools reachable from sandboxed code. Open source under AGPL-3.0.",
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/developers",
  },
  keywords: [
    "QuickJS sandbox",
    "WebAssembly JavaScript sandbox",
    "sandboxed code execution",
    "CodeAct agent",
    "agent code execution",
    "LLM code interpreter",
    "AI workflow DSL",
    "TypeScript AI framework",
    "MCP server",
    "agent tools API",
    "custom AI nodes",
    "open-source AI",
    "self-hosted AI platform",
    "capability-based security",
    "model-agnostic SDK",
  ],
  openGraph: {
    title: "NodeTool for Developers | The QuickJS Sandbox and the DSL Inside It",
    description:
      "Write sandboxed JavaScript that calls 424 AI nodes as async functions, builds workflow graphs, and reaches 208 platform tools by import — the same isolate your agent acts in.",
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
      "A QuickJS sandbox where your code and your agent's code run on the same engine, with the same limits and the same imports. Open source under AGPL-3.0.",
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
            "Open-source creative workspace built on a QuickJS WebAssembly sandbox. Code node bodies, saved scripts, and agent actions run on one isolate with capability-scoped host bridges, 38 library packs, 424 nodes callable as async functions, and 208 platform tools reachable by import.",
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
