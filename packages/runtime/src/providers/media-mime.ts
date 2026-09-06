/**
 * One sniffer across image, audio and video containers, for the callers that
 * receive an opaque blob and need to say what it is (ComfyUI outputs, sandbox
 * media, generic asset uploads).
 *
 * Image is tried first so that RIFF resolves correctly: "RIFF….WEBP" is an
 * image, "RIFF….WAVE" is audio, "RIFF….AVI " is video, and no branch claims
 * bare RIFF.
 */
import { sniffImageMime } from "./image-mime.js";
import { sniffAudioMimeOrNull } from "./audio-mime.js";
import { sniffVideoMimeOrNull } from "./video-mime.js";

export const MEDIA_KINDS = ["image", "audio", "video"] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

/** Kind and MIME type of a media blob; `null` when nothing matches. */
export function sniffMedia(
  bytes: Uint8Array
): { kind: MediaKind; mime: string } | null {
  const image = sniffImageMime(bytes);
  if (image) return { kind: "image", mime: image };
  const audio = sniffAudioMimeOrNull(bytes);
  if (audio) return { kind: "audio", mime: audio };
  const video = sniffVideoMimeOrNull(bytes);
  if (video) return { kind: "video", mime: video };
  return null;
}

/**
 * MIME type of a media blob, or `fallback` when nothing matches. Callers
 * disagree on the right default (`image/png`, `audio/mpeg`), so pass yours;
 * the built-in default states "unknown" rather than guessing a media type.
 */
export function sniffMediaMime(
  bytes: Uint8Array,
  fallback = "application/octet-stream"
): string {
  return sniffMedia(bytes)?.mime ?? fallback;
}
