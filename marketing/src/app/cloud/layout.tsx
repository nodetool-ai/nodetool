import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NodeTool Cloud — Visual AI Workflows in Your Browser",
  description:
    "NodeTool Cloud is the hosted version of the open-source NodeTool platform. Build AI workflows in any browser, no install, no GPU. Bring your own API keys for OpenAI, Anthropic, Gemini, Replicate, and more. AGPL-3.0.",
  keywords: [
    "NodeTool Cloud",
    "hosted AI workflows",
    "browser AI workflow builder",
    "BYOK AI",
    "no GPU AI",
    "team AI workflows",
    "managed AI platform",
    "open source SaaS",
    "OpenAI workflow",
    "Anthropic Claude workflow",
  ],
};

export default function CloudLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
