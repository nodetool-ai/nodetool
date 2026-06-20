import JsonLd from "../../components/JsonLd";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NodeTool Studio — Local-First AI Workflow Desktop App",
  description:
    "NodeTool Studio is the open-source desktop app for building AI workflows on your own hardware. Run Ollama, MLX, and GGUF models locally, work offline, keep your data on disk. macOS, Windows, Linux. AGPL-3.0.",
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
