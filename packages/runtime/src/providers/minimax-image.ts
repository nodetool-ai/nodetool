import { isNonEmptyString, isRecord } from "@nodetool-ai/protocol";

export const MINIMAX_H3_IMAGE_MODELS: readonly string[] = [
  "MiniMax-H3-Image",
  "MiniMax-H3-Image-Highspeed"
];

/** Read both image-01's object and H3's per-image results, including partial success. */
export function minimaxImageData(data: unknown): { imageBase64: string[]; imageUrls: string[] } {
  if (Array.isArray(data)) {
    const items = data.filter(isRecord);
    const imageBase64 = items.map((item) => item.b64_json).filter(isNonEmptyString);
    const imageUrls = items.map((item) => item.url).filter(isNonEmptyString);
    if (!imageBase64.length && !imageUrls.length) {
      const message = items.map((item) => item.error).filter(isRecord)
        .map((error) => error.message).find(isNonEmptyString);
      throw new Error(message ?? "MiniMax H3 returned no images");
    }
    return { imageBase64, imageUrls };
  }
  return {
    imageBase64: isRecord(data) && Array.isArray(data.image_base64)
      ? data.image_base64.filter(isNonEmptyString) : [],
    imageUrls: isRecord(data) && Array.isArray(data.image_urls)
      ? data.image_urls.filter(isNonEmptyString) : []
  };
}
