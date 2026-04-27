import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "NodeTool for Business - Enterprise AI Automation Platform",
  description:
    "Transform your business with AI automation. Build and deploy custom AI workflows without vendor lock-in. Reduce costs, enhance productivity, and maintain complete control over your data.",
  keywords: [
    "AI automation",
    "enterprise AI",
    "business automation",
    "self-hosted AI",
    "AI workflows",
    "process automation",
    "document intelligence",
    "AI platform",
  ],
  openGraph: {
    title: "NodeTool for Business - Enterprise AI Automation",
    description:
      "Build and deploy custom AI workflows without vendor lock-in. Reduce costs by up to 80% while maintaining complete control over your data.",
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
