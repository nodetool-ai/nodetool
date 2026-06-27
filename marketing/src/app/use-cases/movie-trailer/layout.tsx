import JsonLd from "../../../components/JsonLd";
import type { Metadata, Viewport } from "next";

const TITLE = "AI Movie Trailer Generator | NodeTool use case";
const DESCRIPTION =
  "Type one logline and the canvas builds a cinematic teaser. A showrunner agent writes the treatment, a list generator breaks it into shots, a text-to-image model renders the key art, and a video model animates and cuts it into a finished trailer, all on one open canvas with your own keys.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/use-cases/movie-trailer",
  },
  keywords: [
    "AI movie trailer",
    "AI trailer generator",
    "text to video workflow",
    "image to video",
    "AI film teaser",
    "storyboard automation",
    "AI video pipeline",
    "NodeTool use case",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://nodetool.ai/use-cases/movie-trailer",
    siteName: "NodeTool",
    locale: "en_US",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Movie Trailer Generator",
    description:
      "From one logline to a cinematic teaser: treatment, shot list, key art, and a cut trailer, on one open canvas.",
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
              name: "AI Movie Trailer Generator",
              item: "https://nodetool.ai/use-cases/movie-trailer",
            },
          ],
        }}
      />
      {children}
    </>
  );
}
