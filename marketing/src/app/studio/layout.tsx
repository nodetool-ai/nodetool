import JsonLd from "../../components/JsonLd";
import type { Metadata } from "next";

const TITLE = "NodeTool Studio — Local-First AI Workflow Desktop App";
const DESCRIPTION =
  "NodeTool Studio is the open-source desktop app for building AI workflows on your own hardware. Run Ollama, MLX, and GGUF models locally, work offline, keep your data on disk. macOS, Windows, Linux. AGPL-3.0.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/studio",
  },
  keywords: [
    "NodeTool Studio",
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
            "Open-source desktop app for building AI workflows on your own hardware. Run Ollama, MLX, and GGUF models locally, work offline, and keep your data on disk.",
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
