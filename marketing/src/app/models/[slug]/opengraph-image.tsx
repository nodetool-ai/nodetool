import { ogImage, ogSize, ogContentType, type OgAccent } from "@/lib/og";
import { modelBySlug, modelEntries } from "@/data/modelEntries";
import {
  comparisonBySlug,
  modelComparisonEntries,
} from "@/data/modelComparisonEntries";

export const alt = "NodeTool model";
export const size = ogSize;
export const contentType = ogContentType;

export function generateStaticParams() {
  return [
    ...modelEntries.map((m) => ({ slug: m.slug })),
    ...modelComparisonEntries.map((c) => ({ slug: c.slug })),
  ];
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const model = modelBySlug(slug);
  if (model) {
    return ogImage(`${model.name}`, model.tagline, {
      image: "screen_canvas.png",
      accent: model.accent as OgAccent,
      eyebrow: `${model.vendor} · in NodeTool`,
    });
  }
  const comparison = comparisonBySlug(slug);
  if (comparison) {
    return ogImage(
      `${comparison.aName} vs ${comparison.bName}`,
      comparison.description,
      {
        image: "screen_canvas.png",
        accent: comparison.accent as OgAccent,
        eyebrow: "Same prompt · side by side",
      }
    );
  }
  return ogImage("NodeTool models", "Run any model in a visual AI workflow.", {
    image: "screen_canvas.png",
    accent: "blue",
  });
}
