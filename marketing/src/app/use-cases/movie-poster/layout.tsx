import JsonLd from "../../../components/JsonLd";
import { breadcrumbSchema, howToSchema } from "../../../lib/jsonld";
import { moviePosterUseCase } from "../../../data/useCaseEntries";
import type { Metadata, Viewport } from "next";

const TITLE = "AI Movie Poster Generator with Billing Block | NodeTool";
const DESCRIPTION =
  "Make AI movie posters from a title, genre, and audience: plot concepts, key art, tagline, and billing block, on an open-source canvas with your own keys.";

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
  const useCase = moviePosterUseCase;
  const breadcrumb = breadcrumbSchema([
    { name: "Use cases", url: "/#use-cases" },
    { name: "AI Movie Poster Generator", url: useCase.route },
  ]);
  // The steps below are the ones the page renders under "How it works".
  const howTo = howToSchema({
    name: useCase.howToName,
    description: useCase.howToDescription,
    url: useCase.route,
    image: "/poster-singularity-1.png",
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
