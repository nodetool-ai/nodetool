import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Agents for creative work | NodeTool",
  description:
    "An art director that never sleeps. Drop an agent on the canvas, give it a brief, and watch it plan the shot, pick the model, generate variants, and hand the cut to the next node. Wire image, video, music, and voice models — Flux, Seedance, Veo, Kling, Suno, ElevenLabs — into agents that ship your work. Open source, BYOK, runs on your machine.",
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
};

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
