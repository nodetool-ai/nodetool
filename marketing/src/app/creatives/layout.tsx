import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "NodeTool for Creative Professionals | AI-Powered Creative Workflows",
  description:
    "Build powerful creative pipelines with drag-and-drop simplicity. Generate images, process video, create audio—all in one visual workspace. Perfect for video creators, graphic designers, music producers, and photographers.",
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/creatives",
  },
  keywords: [
    "AI for creatives",
    "creative workflow automation",
    "AI image generation",
    "video processing",
    "audio generation",
    "visual workflow builder",
    "creative professionals",
    "AI tools for designers",
    "AI video editing",
    "AI music production",
  ],
  openGraph: {
    title: "NodeTool for Creative Professionals | AI-Powered Creative Workflows",
    description:
      "Build powerful creative pipelines with drag-and-drop simplicity. Generate images, process video, create audio—all in one visual workspace.",
    url: "https://nodetool.ai/creatives",
    siteName: "NodeTool",
    images: [
      {
        url: "/preview.png",
        alt: "NodeTool Creative Workflow Canvas",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NodeTool for Creative Professionals",
    description:
      "Build powerful creative pipelines with drag-and-drop simplicity. Generate images, process video, create audio—all in one visual workspace.",
    images: ["/preview.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#050510",
  colorScheme: "dark",
};

export default function CreativesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
