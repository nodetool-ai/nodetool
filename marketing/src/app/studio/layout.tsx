import JsonLd from "../../components/JsonLd";
import type { Metadata } from "next";

const TITLE = "NodeTool Studio — Agent-first creative workspace, offline";
const DESCRIPTION =
  "You direct the vision. The agent builds the film — on your own hardware. Describe your idea and NodeTool Studio's agent writes the script, boards every scene, generates the footage, and cuts a multi-track timeline you can still edit. Run open weights locally through Ollama, MLX, and GGUF, or bring your own API keys and pay provider prices. No credits, no markups, no lock-in. Offline, files on disk. macOS, Windows, Linux. AGPL-3.0.";

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
            "Open-source, agent-first creative workspace for the desktop. Describe an idea and the agent writes the script, boards the scenes, generates the footage, and cuts the timeline — on Ollama, MLX, and GGUF models running locally, or on your own API keys at provider prices. Works offline, files stay on disk.",
          applicationCategory: "MultimediaApplication",
          operatingSystem: "macOS, Windows, Linux",
          url: "https://nodetool.ai/studio",
          downloadUrl: "https://github.com/nodetool-ai/nodetool/releases",
          softwareVersion: "1.0",
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
