import JsonLd from "../../../components/JsonLd";
import { breadcrumbSchema, howToSchema } from "../../../lib/jsonld";
import { productVideoUseCase } from "../../../data/useCaseEntries";
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
  const useCase = productVideoUseCase;
  const breadcrumb = breadcrumbSchema([
    { name: "Use cases", url: "/#use-cases" },
    { name: "AI Product Video Generator", url: useCase.route },
  ]);
  // The steps below are the ones the page renders under "How it works".
  const howTo = howToSchema({
    name: useCase.howToName,
    description: useCase.howToDescription,
    url: useCase.route,
    tools: useCase.tools,
    steps: useCase.steps.map((step) => ({ name: step.title, text: step.body })),
  });

  return (
    <>
      <JsonLd data={breadcrumb} />
      <JsonLd data={howTo} />
      {children}
    </>
  );
}
