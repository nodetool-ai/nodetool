import JsonLd from "../../components/JsonLd";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "Node-Based AI Editor — Open Source, Every Model, One Canvas | NodeTool",
  description:
    "NodeTool is a node-based AI editor for image, video, audio, and text. Open source under AGPL-3.0, bring your own API keys at provider prices, and run models locally with Ollama, MLX, or llama.cpp — on desktop or in the browser.",
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/node-based-ai-editor",
  },
  keywords: [
    "node-based AI editor",
    "AI node editor",
    "node-based AI workflow",
    "node ai",
    "node based ai",
    "open source AI node editor",
    "visual AI workflow builder",
    "BYOK AI canvas",
  ],
  openGraph: {
    title: "Node-Based AI Editor — Open Source, Every Model, One Canvas | NodeTool",
    description:
      "Every model, your keys, one node-based canvas for image, video, audio, and text. Open source, local models included.",
    url: "https://nodetool.ai/node-based-ai-editor",
    siteName: "NodeTool",
    images: [
      {
        url: "/preview.png",
        alt: "NodeTool node-based AI editor canvas",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Node-Based AI Editor | NodeTool",
    description:
      "Open source, every model, one canvas. The node-based AI editor for image, video, audio, and text.",
    images: ["/preview.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#050510",
  colorScheme: "dark",
};

export default function NodeBasedAiEditorLayout({
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
          name: "NodeTool",
          description:
            "NodeTool is a node-based AI editor for image, video, audio, and text — open source under AGPL-3.0, BYOK at provider prices, with local model support via Ollama, MLX, and llama.cpp.",
          applicationCategory: "MultimediaApplication",
          operatingSystem: "macOS, Windows, Linux, Web browser",
          url: "https://nodetool.ai/node-based-ai-editor",
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
            {
              "@type": "ListItem",
              position: 2,
              name: "Node-Based AI Editor",
              item: "https://nodetool.ai/node-based-ai-editor",
            },
          ],
        }}
      />
      {children}
    </>
  );
}
