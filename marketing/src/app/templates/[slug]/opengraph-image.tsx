import { ogImage, ogSize, ogContentType } from "@/lib/og";
import { templateEntries } from "@/data/templates";

export const alt = "NodeTool AI workflow template";
export const size = ogSize;
export const contentType = ogContentType;

export const dynamicParams = false;

export function generateStaticParams() {
  return templateEntries.map((t) => ({ slug: t.slug }));
}

const ACCENTS = ["blue", "violet", "emerald", "rose", "amber", "cyan"] as const;

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = templateEntries.find((t) => t.slug === slug);
  const name = entry?.name ?? "AI Workflow Template";
  // The thumbnail lives at public/templates/<slug>.jpg; og reads from public/.
  const image = entry?.thumbnail
    ? entry.thumbnail.replace(/^\//, "")
    : "screen_canvas.png";
  // Deterministic accent from the slug so each card has stable color.
  const accent =
    ACCENTS[
      slug.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % ACCENTS.length
    ];
  return ogImage(name, entry?.category ?? "NodeTool workflow template", {
    image,
    accent,
    eyebrow: "Template",
  });
}
