import JsonLd from "../../components/JsonLd";
import type { Metadata } from "next";

const TITLE = "NodeTool Agents | Agents that work in real editors";
const DESCRIPTION =
  "Build creative automation that produces editable workflows, apps, and projects. Inspect tool calls, results, errors, and interventions, then revise and reuse the workflow.";

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
            "NodeTool agents operate editable workflows, apps, and projects through the same tools available in its editors. Runs expose tool calls, results, errors, and interventions for inspection.",
          applicationCategory: "MultimediaApplication",
          operatingSystem: "macOS, Windows, Linux",
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
