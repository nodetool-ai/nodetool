/**
 * Media embedded in a Markdown document. Every embed is written in image
 * syntax, `![caption](src)`, so the file stays readable in any Markdown
 * editor. What the editor shows depends on `src`:
 *
 * - A path or URL with a media extension shows that media: an image, video,
 *   audio clip or 3D model.
 * - An `asset://<id>` locator shows the asset by its content type.
 * - A resource URI (`resource-uri.ts`) shows a project document:
 *   `storyboard://<id>#shot=<shot id>` the shot's current clip, or its
 *   keyframe while it has no clip, `timeline://<id>` a player for the
 *   timeline, and `script://<id>` the script with its voiced takes.
 */
import { mimeTypeForPath } from "./mime-types.js";
import { formatResourceUri, parseResourceUri } from "./resource-uri.js";

export type DocumentEmbedKind = "image" | "video" | "audio" | "model3d";

/** A project document a document embeds by its resource URI. */
export type DocumentResourceEmbed =
  | { kind: "shot"; storyboardId: string; shotId: string }
  | { kind: "timeline"; timelineId: string }
  | { kind: "script"; scriptId: string };

/** The `src` that embeds a storyboard shot, a timeline or a script. */
export function resourceEmbedSrc(target: DocumentResourceEmbed): string {
  switch (target.kind) {
    case "shot":
      return formatResourceUri({
        kind: "storyboard",
        id: target.storyboardId,
        subTarget: { key: "shot", value: target.shotId }
      });
    case "timeline":
      return formatResourceUri({ kind: "timeline", id: target.timelineId });
    case "script":
      return formatResourceUri({ kind: "script", id: target.scriptId });
  }
}

/** The document an embed's `src` names, or null for media and other links. */
export function parseResourceEmbedSrc(src: string): DocumentResourceEmbed | null {
  const ref = parseResourceUri(src.trim());
  if (ref === null) {
    return null;
  }
  if (ref.kind === "storyboard" && ref.subTarget?.key === "shot") {
    return { kind: "shot", storyboardId: ref.id, shotId: ref.subTarget.value };
  }
  if (ref.kind === "timeline" && !ref.subTarget) {
    return { kind: "timeline", timelineId: ref.id };
  }
  if (ref.kind === "script" && !ref.subTarget) {
    return { kind: "script", scriptId: ref.id };
  }
  return null;
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
