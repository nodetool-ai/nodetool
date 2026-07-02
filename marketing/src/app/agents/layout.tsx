import JsonLd from "../../components/JsonLd";
import type { Metadata } from "next";

const TITLE = "AI Agent Workflow Builder — Visual Canvas | NodeTool";
const DESCRIPTION =
  "Build and run AI agents visually — plan-act agents on a node canvas that plan the steps, pick the model, and execute, no code required. Wire image, video, music, and voice models — Flux, Seedance, Veo, Kling, Suno, ElevenLabs — into agents that ship the work. Open source, BYOK, runs on your machine.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/agents",
  },
  keywords: [
    "AI agent workflow builder",
    "visual AI agent builder",
    "no-code AI agents",
    "plan-act agents",
    "creative AI agents",
    "art director agent",
    "brief to asset",
    "automated brand pack",
    "AI motion design agent",
    "creative workflow automation",
    "image generation agent",
    "video generation agent",
    "BYOK creative agents",
    "open source creative agents",
    "node-based creative pipeline",
    "Flux Seedance Veo Suno ElevenLabs",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://nodetool.ai/agents",
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

export default function AgentsLayout({
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
          name: "NodeTool Agents",
          description:
            "Plan-act AI agents built visually on NodeTool's node canvas: give an agent a goal and it plans the steps, picks the model, and executes across image, video, music, and voice models — Flux, Seedance, Veo, Kling, Suno, ElevenLabs. Open source, BYOK, runs on your machine.",
          applicationCategory: "MultimediaApplication",
          operatingSystem: "macOS, Windows, Linux, Web browser",
          url: "https://nodetool.ai/agents",
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
            { "@type": "ListItem", position: 2, name: "Agents", item: "https://nodetool.ai/agents" },
          ],
        }}
      />
      {children}
    </>
  );
}
