import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Workflow Marketplace | NodeTool",
  description:
    "Production-ready NodeTool workflows you can fork in one click — brand asset packs, long-form video to shorts, AI product photography, multilingual voice-over, RAG support bots, and AI music videos. Open the canvas, swap in your own keys, ship in minutes.",
  alternates: {
    canonical: "/workflows",
  },
  keywords: [
    "AI workflow marketplace",
    "NodeTool workflows",
    "AI workflow templates",
    "ComfyUI workflow alternative",
    "Flux workflow templates",
    "Veo workflow templates",
    "ElevenLabs workflow templates",
    "Suno workflow templates",
    "RAG workflow templates",
    "AI agent workflow examples",
    "video to shorts workflow",
    "AI product photography workflow",
    "multilingual voiceover workflow",
    "open source AI workflows",
    "BYOK AI workflow templates",
  ],
  openGraph: {
    title: "Workflow Marketplace | NodeTool",
    description:
      "Fork production-ready AI workflows — image, video, audio, agents, and RAG — and run them on your own keys.",
    url: "https://nodetool.ai/workflows",
    siteName: "NodeTool",
    images: [{ url: "/preview.png", alt: "NodeTool Workflow Marketplace" }],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Workflow Marketplace | NodeTool",
    description:
      "Fork production-ready AI workflows and run them on your own keys. Image, video, audio, agents, RAG.",
    images: ["/preview.png"],
  },
};

export default function WorkflowsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
