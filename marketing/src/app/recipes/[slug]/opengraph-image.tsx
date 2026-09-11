import { ogImage, ogSize, ogContentType } from "@/lib/og";
import { recipeEntries } from "@/data/recipes";

export const alt = "NodeTool guided AI recipe";
export const size = ogSize;
export const contentType = ogContentType;

export const dynamicParams = false;

export function generateStaticParams() {
  return recipeEntries.map((r) => ({ slug: r.slug }));
}

export default async function Image({
  params
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = recipeEntries.find((r) => r.slug === slug);
  const name = entry?.name ?? "Guided AI recipe";
  // Prefer the recipe's own run over the step's template illustration; og
  // reads from public/, so strip the leading slash.
  const art =
    entry?.productionRun?.ogImage ??
    entry?.sample?.image ??
    entry?.heroThumbnail;
  const image = art ? art.replace(/^\//, "") : "screen_storyboard.png";
  return ogImage(
    name,
    entry
      ? `${entry.guide.entry}: ${entry.guide.stages.join(" → ")}`
      : "NodeTool guided recipe",
    { image, accent: "amber", eyebrow: "Recipe" }
  );
}
