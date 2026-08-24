import { ogImage, ogSize, ogContentType } from "@/lib/og";
import { recipeEntries } from "@/data/recipes";

export const alt = "NodeTool AI workflow recipe";
export const size = ogSize;
export const contentType = ogContentType;

export const dynamicParams = false;

export function generateStaticParams() {
  return recipeEntries.map((r) => ({ slug: r.slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = recipeEntries.find((r) => r.slug === slug);
  const name = entry?.name ?? "AI Workflow Recipe";
  // The hero art lives at public/templates/<step>.jpg; og reads from public/.
  const image = entry?.heroThumbnail
    ? entry.heroThumbnail.replace(/^\//, "")
    : "screen_canvas.png";
  return ogImage(
    name,
    entry ? `${entry.workflowCount} workflows, in order` : "NodeTool recipe",
    { image, accent: "amber", eyebrow: "Recipe" },
  );
}
