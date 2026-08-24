import JsonLd from "../../../components/JsonLd";
import { breadcrumbSchema, howToSchema } from "../../../lib/jsonld";
import { movieTrailerUseCase } from "../../../data/useCaseEntries";
import type { Metadata, Viewport } from "next";

const TITLE = "AI Movie Trailer Generator | NodeTool use case";
const DESCRIPTION =
  "Write one logline and get a storyboard back: a card per shot with a still on it. Approve the stills you like, animate those into clips, and cut the trailer on the built-in timeline — all in NodeTool, on your own provider keys.";

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
    "AI storyboard",
    "AI video editing timeline",
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
      "From one logline to a cinematic teaser: a storyboard, a still per shot, and a cut trailer on the timeline.",
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
  const useCase = movieTrailerUseCase;
  const breadcrumb = breadcrumbSchema([
    { name: "Use cases", url: "/#use-cases" },
    { name: "AI Movie Trailer Generator", url: useCase.route },
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
