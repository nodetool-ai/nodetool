import JsonLd from "../../../components/JsonLd";
import { breadcrumbSchema, howToSchema } from "../../../lib/jsonld";
import { documentaryTeaserUseCase } from "../../../data/useCaseEntries";
import type { Metadata, Viewport } from "next";

const TITLE = "AI Documentary Teaser Generator | NodeTool use case";
const DESCRIPTION =
  "Describe the film in a sentence and get a storyboard back: a card per shot with a still on it. Approve the stills, animate them into clips, and cut the teaser on the built-in timeline — all in NodeTool, on your own provider keys.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  metadataBase: new URL("https://nodetool.ai"),
  alternates: {
    canonical: "/use-cases/documentary-teaser",
  },
  keywords: [
    "AI documentary teaser",
    "AI storyboard",
    "text to video workflow",
    "image to video",
    "AI nature documentary",
    "AI film teaser",
    "AI video editing timeline",
    "NodeTool use case",
  ],
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: "https://nodetool.ai/use-cases/documentary-teaser",
    siteName: "NodeTool",
    locale: "en_US",
    type: "article",
  },
  twitter: {
    card: "summary_large_image",
    title: "AI Documentary Teaser Generator",
    description:
      "From one sentence to a six-shot deep-sea teaser: a storyboard, a still per shot, and a cut on the timeline.",
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
  const useCase = documentaryTeaserUseCase;
  const breadcrumb = breadcrumbSchema([
    { name: "Use cases", url: "/#use-cases" },
    { name: "AI Documentary Teaser Generator", url: useCase.route },
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
