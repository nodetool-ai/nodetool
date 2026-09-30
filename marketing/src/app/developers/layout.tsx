import type { Metadata, Viewport } from "next";
import JsonLd from "../../components/JsonLd";

export const metadata: Metadata = {
  title: "NodeTool for Developers | Images, Video, and Workflows for Your Coding Agent",
  description:
    "Connect NodeTool to Claude Code, Codex, OpenCode, or Cursor with one command. Your coding agent makes images, video, speech, and repeatable media workflows on your own provider keys. Open source under AGPL-3.0.",
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/developers",
  },
  keywords: [
    "MCP server",
    "Claude Code MCP",
    "Cursor MCP",
    "Codex MCP",
    "AI image generation for developers",
    "AI video generation API",
    "vibe coding",
    "coding agent tools",
    "AI workflow API",
    "open-source AI",
    "self-hosted AI platform",
    "bring your own keys",
  ],
  openGraph: {
    title: "NodeTool for Developers | Your Coding Agent Makes the Media Too",
    description:
      "One command connects NodeTool to your coding agent. Ask for images, video, speech, or a whole workflow in plain words.",
    url: "https://nodetool.ai/developers",
    siteName: "NodeTool",
    images: [
      {
        url: "/preview.png",
        alt: "NodeTool for developers",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "NodeTool for Developers",
    description:
      "Give Claude Code, Codex, or Cursor images, video, speech, and repeatable workflows over MCP. Open source under AGPL-3.0.",
    images: ["/preview.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#050510",
  colorScheme: "dark",
};

export default function DevelopersLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareSourceCode",
          name: "NodeTool",
          description:
            "Open-source creative workspace that runs as an MCP server for coding agents such as Claude Code, Codex, OpenCode, and Cursor, with image, video, speech, and workflow tools.",
          codeRepository: "https://github.com/nodetool-ai/nodetool",
          programmingLanguage: ["TypeScript", "Python"],
          license: "https://github.com/nodetool-ai/nodetool/blob/main/LICENSE",
          url: "https://nodetool.ai/developers",
        }}
      />
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://nodetool.ai" },
            { "@type": "ListItem", position: 2, name: "Developers", item: "https://nodetool.ai/developers" },
          ],
        }}
      />
      {children}
    </>
  );
}
