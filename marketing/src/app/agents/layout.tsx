import JsonLd from "../../components/JsonLd";
import type { Metadata } from "next";

const TITLE = "Open-Source Creative Harness for AI Agents | NodeTool";
const DESCRIPTION =
  "NodeTool is the open-source creative harness for AI agents. Your agent gets generation tools and eight editors, runs on your keys, and leaves editable work.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/agents",
  },
  keywords: [
    "open-source creative harness",
    "creative harness",
    "AI agent harness",
    "agent harness for creative work",
    "agent-first app",
    "AI agent workflow builder",
    "visual AI agent builder",
    "no-code AI agents",
    "plan-act agents",
    "agents that build workflows",
    "agents that build apps",
    "supervised agent runs",
    "MCP creative tools",
    "Claude Code MCP server",
    "Codex MCP server",
    "MCP server for image and video generation",
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
          name: "NodeTool",
          description:
            "NodeTool is an open-source creative harness for AI agents. Its built-in agent and external coding agents operate editable workflows, apps, and projects through the same tools available in its editors. Runs expose tool calls, results, errors, and interventions for inspection.",
          applicationCategory: "MultimediaApplication",
          operatingSystem: "macOS, Windows, Linux",
          url: "https://nodetool.ai/agents",
          license: "https://github.com/nodetool-ai/nodetool/blob/main/LICENSE.txt",
          author: { "@type": "Organization", name: "NodeTool", url: "https://nodetool.ai" },
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://nodetool.ai" },
            { "@type": "ListItem", position: 2, name: "Creative harness", item: "https://nodetool.ai/agents" },
          ],
        }}
      />
      {children}
    </>
  );
}
