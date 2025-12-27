/**
 * Image utility functions for node outputs
 */

export type ImageData = string | Uint8Array | number[];

export interface ImageSource {
  uri?: string;
  data?: ImageData;
}

/**
 * Converts image data to a displayable URL.
 * Handles: URI strings, data URIs, base64 strings, Uint8Array, and number arrays.
 *
 * @param image - The image source object with uri or data
 * @param previousBlobUrl - Previous blob URL to revoke (prevents memory leaks)
 * @returns Object containing the URL and the new blob URL (if created)
 */
export const createImageUrl = (
  image: ImageSource | null | undefined,
  previousBlobUrl: string | null
): { url: string; blobUrl: string | null } => {
  // Revoke previous blob URL if it exists
  if (previousBlobUrl) {
    URL.revokeObjectURL(previousBlobUrl);
  }

  if (!image) {
    return { url: "", blobUrl: null };
  }

  // Case 1: URI is provided
  if (image.uri) {
    return { url: image.uri, blobUrl: null };
  }

  if (!image.data) {
    return { url: "", blobUrl: null };
  }

  // Case 2: Data is a string
  if (typeof image.data === "string") {
    if (
      image.data.startsWith("data:") ||
      image.data.startsWith("blob:") ||
      image.data.startsWith("http")
    ) {
      return { url: image.data, blobUrl: null };
    }
    // Assume base64 encoded
    return { url: `data:image/png;base64,${image.data}`, blobUrl: null };
  }

  // Case 3: Data is Uint8Array or number array - create blob URL
  let bytes: Uint8Array;
  if (image.data instanceof Uint8Array) {
    bytes = image.data;
  } else if (Array.isArray(image.data)) {
    bytes = new Uint8Array(image.data);
  } else {
    return { url: "", blobUrl: null };
  }

  // Convert to ArrayBuffer for Blob constructor compatibility
  const buffer = (bytes.buffer as ArrayBuffer).slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength
  );
  const blob = new Blob([buffer], { type: "image/png" });
  const blobUrl = URL.createObjectURL(blob);
  return { url: blobUrl, blobUrl };
};

