import JsonLd from "../../../components/JsonLd";
import type { Metadata, Viewport } from "next";

const TITLE =
  "AI Product Video Generator | NodeTool use case";
const DESCRIPTION =
  "Turn a campaign brief and a single product photo into a cinematic 16:9 product video. A prompt node combines your inputs, an agent directs the shot, and a text-to-video model renders it, all on one open canvas with your own keys.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/use-cases/product-video",
  },
  keywords: [
    "AI product video",
    "text to video workflow",
    "AI marketing video generator",
    "Veo workflow",
    "image to video",
    "AI video pipeline",
    "product video automation",
    "NodeTool use case",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://nodetool.ai/use-cases/product-video",
    siteName: "NodeTool",
    locale: "en_US",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Product Video Generator",
    description:
      "From a campaign brief and a product photo to a cinematic product video, on one open canvas.",
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
              name: "AI Product Video Generator",
              item: "https://nodetool.ai/use-cases/product-video",
            },
          ],
        }}
      />
      {children}
    </>
  );
}
