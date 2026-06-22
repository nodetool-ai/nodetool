import JsonLd from "../../../components/JsonLd";
import type { Metadata, Viewport } from "next";

const TITLE = "AI Movie Poster Generator | NodeTool use case";
const DESCRIPTION =
  "Type a title, genre, and audience and the canvas writes a creative strategy, spins up plot concepts, and renders a batch of cinematic movie posters. Prompt nodes shape every step, on one open canvas with your own keys.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/use-cases/movie-poster",
  },
  keywords: [
    "AI movie poster generator",
    "AI poster design",
    "text to image workflow",
    "GPT Image poster",
    "Flux poster",
    "AI key art",
    "cinematic poster AI",
    "NodeTool use case",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://nodetool.ai/use-cases/movie-poster",
    siteName: "NodeTool",
    locale: "en_US",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Movie Poster Generator",
    description:
      "From a title, genre, and audience to a batch of cinematic poster concepts, on one open canvas.",
  },
};

export const viewport: Viewport = {
  themeColor: "#050510",
  colorScheme: "dark",
};

export default function UseCaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: "Home", item: "https://nodetool.ai" },
            { "@type": "ListItem", position: 2, name: "Use cases", item: "https://nodetool.ai/#use-cases" },
            {
              "@type": "ListItem",
              position: 3,
              name: "AI Movie Poster Generator",
              item: "https://nodetool.ai/use-cases/movie-poster",
            },
          ],
        }}
      />
      {children}
    </>
  );
}
