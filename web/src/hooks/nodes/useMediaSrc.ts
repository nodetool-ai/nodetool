/**
 * useMediaSrc
 *
 * Resolve a stable URL for a media value carrying either a stored asset URI
 * or in-memory bytes. Returns a signed URL when the value has a non-memory
 * URI, an object-URL when bytes are present, or "" while nothing is loaded.
 *
 * Shared by ContentCardBody (video / audio variants) and bespoke bodies
 * (e.g. ExtractVideoFrameBody) that drive their own `<video>` / `<audio>`
 * element instead of the generic OutputRenderer.
 */
import { useEffect, useState } from "react";
import {
  useSignedUrl,
  getMimeTypeFromUri,
  toUint8Array
} from "../../components/node/output";

export type MediaKind = "audio" | "video";

export const useMediaSrc = (
  value: unknown,
  kind: MediaKind,
  fallbackMime?: string
): string => {
  const v =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : null;
  // Accept either a direct URI string or an object with a `uri` field.
  const rawUri =
    typeof value === "string" && value && !value.startsWith("memory://")
      ? value
      : v && typeof v.uri === "string" && !v.uri.startsWith("memory://")
        ? (v.uri as string)
        : undefined;
  const signedUrl = useSignedUrl(rawUri);

  const data = v?.data;
  // Pick a content-type for the Blob so WaveSurfer / <video> can decode.
  // Order: explicit caller mime → MIME from URI → `<kind>/<metadata.format>`.
  // `format` is an extension ("mp4", "wav") so it must be combined with the
  // caller-supplied kind — never assume audio.
  const format = (v?.metadata as { format?: string } | undefined)?.format;
  const blobMime =
    fallbackMime ||
    (rawUri ? getMimeTypeFromUri(rawUri) : "") ||
    (format ? `${kind}/${format}` : "") ||
    "";

  const [blobUrl, setBlobUrl] = useState<string>("");
  useEffect(() => {
    // Shared helper handles Uint8Array, ArrayBuffer, ArrayBufferView, and
    // plain number[] — and returns a copy backed by a non-shared ArrayBuffer
    // suitable for Blob construction.
    const bytes = toUint8Array(data);
    if (bytes && bytes.byteLength > 0) {
      const blob = blobMime
        ? new Blob([bytes], { type: blobMime })
        : new Blob([bytes]);
      const url = URL.createObjectURL(blob);
      setBlobUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setBlobUrl("");
    return undefined;
  }, [data, blobMime]);

  return blobUrl || signedUrl || "";
};

export default useMediaSrc;
