import { ogImage, ogSize, ogContentType } from "@/lib/og";
import { taskEntries, getTask, templatesForTask } from "@/data/taskEntries";

export const alt = "NodeTool AI task";
export const size = ogSize;
export const contentType = ogContentType;

export const dynamicParams = false;

export function generateStaticParams() {
  return taskEntries.map((t) => ({ slug: t.slug }));
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const entry = getTask(slug);
  const template = entry ? templatesForTask(entry, 1)[0] : undefined;
  const image = template?.thumbnail
    ? template.thumbnail.replace(/^\//, "")
    : "screen_canvas.png";
  return ogImage(entry?.headline ?? "NodeTool", entry?.description ?? "The open creative AI workspace.", {
    image,
    accent: entry?.accent ?? "blue",
    eyebrow: "AI Task",
  });
}
