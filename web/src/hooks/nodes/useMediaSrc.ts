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
import { useEffect, useMemo, useState } from "react";
import {
  useSignedUrl,
  getMimeTypeFromUri,
  toUint8Array
} from "../../components/node/output";

export type MediaKind = "audio" | "video";

/**
 * Cheap content signature for a media payload, so the object-URL effect only
 * re-runs when the *bytes* change — not on every render when an unmemoized
 * selector hands back a fresh typed-array/object identity for the same data.
 * Samples length + a few bytes rather than hashing the whole (possibly large)
 * buffer.
 */
const mediaDataSignature = (data: unknown): string | undefined => {
  if (!data) return undefined;
  let view: Uint8Array | undefined;
  if (data instanceof Uint8Array) {
    view = data;
  } else if (data instanceof ArrayBuffer) {
    view = new Uint8Array(data);
  } else if (ArrayBuffer.isView(data)) {
    view = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  } else if (Array.isArray(data)) {
    const n = data.length;
    if (n === 0) return undefined;
    return `arr:${n}:${data[0]}:${data[n >> 1]}:${data[n - 1]}`;
  } else if (typeof data === "string") {
    if (data.length === 0) return undefined;
    return `str:${data.length}:${data.slice(0, 16)}:${data.slice(-16)}`;
  }
  if (!view) return undefined;
  const n = view.byteLength;
  if (n === 0) return undefined;
  return `buf:${n}:${view[0]}:${view[n >> 1]}:${view[n - 1]}`;
};

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

  // Key the byte extraction on a stable content signature, not on `data`'s
  // identity — an unmemoized selector value would otherwise recreate the
  // object URL every render and briefly reference a just-revoked URL.
  const dataSignature = mediaDataSignature(data);
  const bytes = useMemo(() => {
    // Shared helper handles Uint8Array, ArrayBuffer, ArrayBufferView, and
    // plain number[] — and returns a copy backed by a non-shared ArrayBuffer
    // suitable for Blob construction.
    const b = toUint8Array(data);
    return b && b.byteLength > 0 ? b : undefined;
    // `data` is intentionally excluded: `dataSignature` is its content proxy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataSignature]);

  const [blobUrl, setBlobUrl] = useState<string>("");
  useEffect(() => {
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
  }, [bytes, blobMime]);

  return blobUrl || signedUrl || "";
};

export default useMediaSrc;
