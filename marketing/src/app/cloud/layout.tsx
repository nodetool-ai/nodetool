import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NodeTool Cloud (Alpha) — The open creative AI workspace, in the browser",
  description:
    "NodeTool Cloud is the hosted edition of the open creative AI workspace, currently in alpha. Every major model from every major provider on one node-based canvas — call them with your own keys at provider prices. No install, no GPU, no credit markup. AGPL-3.0.",
  keywords: [
    "NodeTool Cloud",
    "creative AI workspace",
    "BYOK AI canvas",
    "ComfyUI alternative browser",
    "Weavy alternative",
    "open source creative AI",
    "node-based AI canvas",
    "Flux workflow",
    "Seedance workflow",
    "Veo workflow",
  ],
};

export default function CloudLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
