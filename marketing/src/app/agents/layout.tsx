import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agents in NodeTool | A capability inside the open creative AI workspace",
  description:
    "Agents are a node in NodeTool — not the product. Wire planning, tool-use, and reasoning models into your canvas alongside Flux, Seedance, ElevenLabs, and the rest. Bring your own keys, swap providers any time. Open source, AGPL-3.0.",
  keywords: [
    "AI agents",
    "creative AI agents",
    "agent node",
    "BYOK agents",
    "open source agents",
    "Claude agent",
    "OpenAI agent",
    "tool-use canvas",
    "creative AI workspace",
    "node-based agent",
  ],
};

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
