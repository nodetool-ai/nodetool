import { z } from "zod";

const reference = z.object({
  asset_id: z.string().nullable().optional(),
  uri: z.string().nullable().optional(),
  url: z.string().optional()
});
const block = z.object({
  type: z.enum(["image", "image_url", "video", "audio", "document", "model3d"]),
  image: reference.optional(),
  image_url: z.union([reference, z.string()]).optional(),
  video: reference.optional(),
  audio: reference.optional(),
  document: reference.optional(),
  model3d: reference.optional()
});

/** Preserve generated media identifiers when a terminal cannot preview their pixels. */
export function attachmentLines(content: unknown): string[] {
  if (!Array.isArray(content)) {
    return [];
  }
  const lines: string[] = [];
  for (const value of content) {
    const parsed = block.safeParse(value);
    if (!parsed.success) {
      continue;
    }
    const item = parsed.data;
    const media =
      item.image ?? item.video ?? item.audio ?? item.document ?? item.model3d;
    const imageUrl = z.string().safeParse(item.image_url);
    const imageReference = reference.safeParse(item.image_url);
    const locator = media?.asset_id
      ? `asset://${media.asset_id}`
      : (media?.uri ??
        media?.url ??
        (imageUrl.success
          ? imageUrl.data
          : imageReference.success
            ? imageReference.data.url
            : undefined));
    lines.push(
      locator && !locator.startsWith("data:")
        ? `${item.type}: ${locator}`
        : `${item.type}: inline attachment`
    );
  }
  return lines;
}
