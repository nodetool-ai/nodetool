import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NodeTool for Studios & Teams — The open creative AI workspace",
  description:
    "An open creative AI workspace for small studios, post-production shops, and agency teams. Every major model, your own keys, your workflows — no credit markup, no vendor lock-in, no acquisition risk.",
  keywords: [
    "creative AI workspace",
    "studio AI tools",
    "BYOK AI canvas",
    "open source creative AI",
    "ComfyUI alternative",
    "Weavy alternative",
    "vendor-neutral AI",
    "agency AI workflows",
    "post-production AI",
  ],
  openGraph: {
    title: "NodeTool for Studios & Teams — The open creative AI workspace",
    description:
      "Every major model, your own keys, your workflows — wired into one node-based canvas. No credit markup, no vendor lock-in, no acquisition risk.",
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
