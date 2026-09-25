import JsonLd from "../../components/JsonLd";
import type { Metadata } from "next";

const TITLE = "NodeTool Studio | Make the work. Keep the project.";
const DESCRIPTION =
  "The recommended production edition of NodeTool for macOS, Windows, and Linux. Create with agents, revise the editable project, and use supported local models or remote providers.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/studio",
  },
  keywords: [
    "NodeTool Studio",
    "agent-first desktop app",
    "local AI agent",
    "local AI workflows",
    "offline AI",
    "Ollama desktop",
    "MLX Apple Silicon",
    "GGUF local LLM",
    "private AI",
    "open source AI workflow builder",
    "self-hosted AI",
    "desktop AI app",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://nodetool.ai/studio",
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

export default function StudioLayout({
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
          name: "NodeTool Studio",
          description:
            "The recommended production edition of NodeTool for macOS, Windows, and Linux, with editable projects and support for local models and remote providers.",
          applicationCategory: "MultimediaApplication",
          operatingSystem: "macOS, Windows, Linux",
          url: "https://nodetool.ai/studio",
          downloadUrl: "https://github.com/nodetool-ai/nodetool/releases",
          license: "https://github.com/nodetool-ai/nodetool/blob/main/LICENSE",
          offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          author: { "@type": "Organization", name: "NodeTool", url: "https://nodetool.ai" },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://nodetool.ai" },
            { "@type": "ListItem", position: 2, name: "Studio", item: "https://nodetool.ai/studio" },
          ],
        }}
      />
      {children}
    </>
  );
}
