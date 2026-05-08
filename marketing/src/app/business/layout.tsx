import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NodeTool for studios and creative teams | The open creative AI workspace",
  description:
    "The open creative AI workspace, made for small studios and brand teams. Every major model, your keys, one node-based canvas — so your team uses creative AI without each person becoming a ComfyUI expert. Open source, AGPL-3.0.",
  keywords: [
    "creative AI for teams",
    "creative AI workspace",
    "BYOK creative AI",
    "studio AI tools",
    "AI for design teams",
    "AI for post-production",
    "open source creative AI",
    "vendor neutral AI workspace",
  ],
  openGraph: {
    title: "NodeTool for studios and creative teams",
    description:
      "Every model. Your keys. Your canvas. The open-source creative AI workspace for small studios and brand teams.",
    type: "website",
  },
};

export default function BusinessLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
