import JsonLd from "../../components/JsonLd";
import type { Metadata } from "next";

const TITLE = "Agents for creative work | NodeTool";
const DESCRIPTION =
  "An art director that never sleeps. Drop an agent on the canvas, give it a brief, and watch it plan the shot, pick the model, generate variants, and hand the cut to the next node. Wire image, video, music, and voice models — Flux, Seedance, Veo, Kling, Suno, ElevenLabs — into agents that ship your work. Open source, BYOK, runs on your machine.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/agents",
  },
  keywords: [
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
