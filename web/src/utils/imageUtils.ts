/**
 * Image utility functions for converting various image data formats to displayable URLs.
 */

import { BASE_URL } from "../stores/BASE_URL";

export type ImageData = string | Uint8Array | number[];

export interface ImageSource {
  uri?: string;
  data?: ImageData;
}

/**
 * Resolve a URI string to a fetchable URL.
 * - `asset://{id}` → `${BASE_URL}/api/storage/{id}`.
 * - `/api/...` → prefixed with `BASE_URL`.
 * - Other absolute URIs (`data:`, `blob:`, `http:`, `https:`) returned as-is.
 */
const resolveUri = (uri: string): string => {
  if (uri.startsWith("asset://")) {
    const assetId = uri.slice("asset://".length);
    return `${BASE_URL}/api/storage/${assetId}`;
  }
  if (uri.startsWith("/api/")) {
    return `${BASE_URL}${uri}`;
  }
  return uri;
};

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
    uri = source.uri;
    data = source.data;
  } else {
    data = source;
  }

  // Case 1: URI is provided
  if (uri) {
    return { url: resolveUri(uri), blobUrl: null };
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
      data.startsWith("asset://")
    ) {
      return { url: resolveUri(data), blobUrl: null };
    }
    if (data.startsWith("/")) {
      const resolved = data.startsWith("/api/") ? `${BASE_URL}${data}` : data;
      return { url: resolved, blobUrl: null };
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

