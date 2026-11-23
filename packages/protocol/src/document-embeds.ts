/**
 * Media embedded in a Markdown document. Every embed is written in image
 * syntax, `![caption](src)`, so the file stays readable in any Markdown
 * editor. What the editor shows depends on `src`:
 *
 * - A path or URL with a media extension shows that media: an image, video,
 *   audio clip or 3D model.
 * - An `asset://<id>` locator shows the asset by its content type.
 * - `storyboard://<storyboard id>/shots/<shot id>` shows the shot's current
 *   clip, or its keyframe while it has no clip, and follows re-renders.
 */
import { mimeTypeForPath } from "./mime-types.js";

export type DocumentEmbedKind = "image" | "video" | "audio" | "model3d";

const SHOT_EMBED = /^storyboard:\/\/([^/?#\s]+)\/shots\/([^/?#\s]+)$/;

export interface ShotEmbedTarget {
  storyboardId: string;
  shotId: string;
}

/** The `src` that embeds a storyboard shot. */
export function shotEmbedSrc(storyboardId: string, shotId: string): string {
  return `storyboard://${encodeURIComponent(storyboardId)}/shots/${encodeURIComponent(shotId)}`;
}

/** The shot a `storyboard://` embed names, or null for any other `src`. */
export function parseShotEmbedSrc(src: string): ShotEmbedTarget | null {
  const match = SHOT_EMBED.exec(src.trim());
  if (!match) {
    return null;
  }
  try {
    return {
      storyboardId: decodeURIComponent(match[1]),
      shotId: decodeURIComponent(match[2])
    };
  } catch {
    return null;
  }
}

/** The embed kind of a content type, or null when it is not media. */
export function embedKindFromContentType(
  contentType: string | null | undefined
): DocumentEmbedKind | null {
  const type = (contentType ?? "").toLowerCase().split(";")[0].trim();
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  if (type.startsWith("audio/")) return "audio";
  if (type.startsWith("model/")) return "model3d";
  return null;
}

/**
 * The embed kind a path or URL names by its extension, or null when it has
 * no media extension (an `asset://` locator, a `data:` URI without one).
 */
export function embedKindFromSrc(src: string): DocumentEmbedKind | null {
  const trimmed = src.trim();
  const dataType = /^data:([^;,]+)/i.exec(trimmed);
  if (dataType) {
    return embedKindFromContentType(dataType[1]);
  }
  const path = trimmed.split(/[?#]/)[0];
  return embedKindFromContentType(mimeTypeForPath(path));
}
