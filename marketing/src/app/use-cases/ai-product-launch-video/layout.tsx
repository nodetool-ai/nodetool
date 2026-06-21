import JsonLd from "../../../components/JsonLd";
import type { Metadata, Viewport } from "next";

const TITLE =
  "AI Product Launch Video Generator | NodeTool use case";
const DESCRIPTION =
  "Turn a campaign brief and a single product photo into a cinematic 16:9 launch video. A prompt node combines your inputs, an agent directs the shot, and a text-to-video model renders it, all on one open canvas with your own keys.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/use-cases/ai-product-launch-video",
  },
  keywords: [
    "AI product launch video",
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
    url: "https://nodetool.ai/use-cases/ai-product-launch-video",
    siteName: "NodeTool",
    images: [{ url: "/smartwatch.png", alt: "AI-generated product launch video" }],
    locale: "en_US",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Product Launch Video Generator",
    description:
      "From a campaign brief and a product photo to a cinematic launch video, on one open canvas.",
    images: ["/smartwatch.png"],
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
              name: "AI Product Launch Video Generator",
              item: "https://nodetool.ai/use-cases/ai-product-launch-video",
            },
          ],
        }}
      />
      {children}
    </>
  );
}
