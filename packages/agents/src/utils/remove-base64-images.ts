/**
 * removeBase64Images — T-AG-7.
 *
 * Strips image content blocks where the data is base64-encoded.
 */
import type { MessageContent, MessageImageContent } from "@nodetool/runtime";

function isBase64Image(content: MessageImageContent): boolean {
  const { uri, data } = content.image;
  if (uri && uri.startsWith("data:image/")) return true;
  if (data != null) return true;
  return false;
}

/**
 * Remove base64 image content blocks from a message content array.
 * Preserves text content, audio content, and images with real URLs.
 */
export function removeBase64Images(
  content: MessageContent[]
): MessageContent[] {
  return content.filter((item) => {
    if (item.type !== "image") return true;
    return !isBase64Image(item as MessageImageContent);
  });
}
