import JsonLd from "../../components/JsonLd";
import type { Metadata } from "next";

const TITLE = "Agent-First Creative Workspace | NodeTool";
const DESCRIPTION =
  "NodeTool is agent-first: every editor — node canvas, sketch pad, storyboard, video timeline, script, 3D scene, app builder — is exposed to agents as tools, around 120 in all. Say what you want and the agent plans the steps, builds the workflow, runs it across Flux, Seedance, Veo, Kling, Suno, and ElevenLabs, and fixes what fails. Open source, your own keys, runs on your machine.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/agents",
  },
  keywords: [
    "agent-first app",
    "AI agent workflow builder",
    "visual AI agent builder",
    "no-code AI agents",
    "plan-act agents",
    "agents that build workflows",
    "agents that build apps",
    "supervised agent runs",
    "MCP creative tools",
    "creative AI agents",
    "art director agent",
    "brief to asset",
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
            "NodeTool is agent-first: every editor in the app is exposed to agents as tools. Give an agent a goal and it plans the steps, builds the workflow on the canvas, runs it across image, video, music, and voice models — Flux, Seedance, Veo, Kling, Suno, ElevenLabs — and repairs what fails. The same tools are exposed over MCP for outside agents. Open source, your own keys, runs on your machine.",
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
