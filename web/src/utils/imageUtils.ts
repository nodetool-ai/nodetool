/**
 * Image utility functions for converting various image data formats to displayable URLs.
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
 * Accepts either:
 * - An ImageSource object with `uri` and/or `data` properties
 * - A raw value (string, Uint8Array, or number[])
 *
 * @param source - The image source (object or raw value)
 * @param previousBlobUrl - Previous blob URL to revoke (prevents memory leaks)
 * @returns Object containing the URL and the new blob URL (if created)
 */
export const createImageUrl = (
  source: ImageSource | ImageData | null | undefined,
  previousBlobUrl: string | null
): { url: string; blobUrl: string | null } => {
  // Revoke previous blob URL if it exists
  if (previousBlobUrl) {
    URL.revokeObjectURL(previousBlobUrl);
  }

  if (!source) {
    return { url: "", blobUrl: null };
  }

  // Normalize: if source is an object with uri/data, extract; otherwise treat as raw data
  let uri: string | undefined;
  let data: ImageData | undefined;

  if (
    typeof source === "object" &&
    !Array.isArray(source) &&
    !(source instanceof Uint8Array)
  ) {
    // It's an ImageSource object
    uri = (source as ImageSource).uri;
    data = (source as ImageSource).data;
  } else {
    // It's a raw value (string, Uint8Array, or number[])
    data = source as ImageData;
  }

  // Case 1: URI is provided
  if (uri) {
    return { url: uri, blobUrl: null };
  }

  if (!data) {
    return { url: "", blobUrl: null };
  }

  // Case 2: Data is a string
  if (typeof data === "string") {
    if (
      data.startsWith("data:") ||
      data.startsWith("blob:") ||
      data.startsWith("http") ||
      data.startsWith("/")
    ) {
      return { url: data, blobUrl: null };
    }
    // Assume base64 encoded
    return { url: `data:image/png;base64,${data}`, blobUrl: null };
  }

  // Case 3: Data is Uint8Array or number array - create blob URL
  let bytes: Uint8Array;
  if (data instanceof Uint8Array) {
    bytes = data;
  } else if (Array.isArray(data)) {
    bytes = new Uint8Array(data);
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

