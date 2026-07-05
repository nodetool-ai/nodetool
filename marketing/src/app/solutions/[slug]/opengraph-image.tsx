import { ogImage, ogSize, ogContentType } from "@/lib/og";
import { landingEntries, getLanding, featuredTemplateFor } from "@/data/landingEntries";

export const alt = "NodeTool AI workflow solution";
export const size = ogSize;
export const contentType = ogContentType;

export const dynamicParams = false;

export function generateStaticParams() {
  return landingEntries.map((e) => ({ slug: e.slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getLanding(slug);
  const template = entry ? featuredTemplateFor(entry) : undefined;
  // The template thumbnail lives at public/templates/<slug>.jpg; og reads public/.
  const image = template?.thumbnail
    ? template.thumbnail.replace(/^\//, "")
    : "screen_canvas.png";
  return ogImage(entry?.headline ?? "NodeTool", entry?.description ?? "The open creative AI workspace.", {
    image,
    accent: entry?.accent ?? "blue",
    eyebrow: entry?.eyebrow ?? "Solution",
  });
}
