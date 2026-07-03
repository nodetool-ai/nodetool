import { ogImage, ogSize, ogContentType } from "../../../lib/og";
import { competitors, getCompetitor } from "../../../data/competitorEntries";

export const size = ogSize;
export const contentType = ogContentType;

export function generateStaticParams() {
  return competitors.map((c) => ({ slug: c.slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const c = getCompetitor(slug);
  const name = c?.name ?? "your tools";
  return ogImage(
    `${name} alternatives`,
    "The open source, BYOK canvas for image, video, audio, and text.",
    {
      image: c?.og.image ?? "screen_canvas.png",
      accent: c?.og.accent ?? "blue",
      eyebrow: "Alternatives",
    }
  );
}
