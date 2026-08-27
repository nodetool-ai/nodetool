// workspaceFileKind.ts
// -----------------------------------------------------------------
// Decides which viewer/editor a workspace file opens in, from its
// filename alone — the download endpoint's own content-type guess
// (packages/websocket/src/workspace-api.ts) works the same way.
// Pure, so the dispatch is testable without mounting the surface.
// -----------------------------------------------------------------

import { previewKind } from "../../utils/assetLanguage";

export type WorkspaceFileKind =
  | "image"
  | "audio"
  | "video"
  | "pdf"
  | "model3d"
  | "markdown"
  | "csv"
  | "code"
  | "text"
  | "binary";

const EXTENSION_KIND: Record<string, WorkspaceFileKind> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  bmp: "image",
  avif: "image",
  ico: "image",
  tif: "image",
  tiff: "image",
  svg: "image",

  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  oga: "audio",
  flac: "audio",
  m4a: "audio",
  aac: "audio",
  opus: "audio",

  mp4: "video",
  webm: "video",
  mov: "video",
  m4v: "video",
  mkv: "video",
  avi: "video",

  pdf: "pdf",

  glb: "model3d",
  gltf: "model3d",
  obj: "model3d",
  fbx: "model3d",
  stl: "model3d",
  ply: "model3d",
  usdz: "model3d"
};

const extensionOf = (filename: string): string => {
  const base = filename.split("/").pop() ?? filename;
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : "";
};

/** Whether the kind is rendered as text (Monaco / markdown / table). */
export const isTextKind = (kind: WorkspaceFileKind): boolean =>
  kind === "markdown" || kind === "csv" || kind === "code" || kind === "text";

/**
 * Classify a workspace file by name. Media and 3D formats go to their viewer,
 * every known text format to the text pane, and anything else is binary — a
 * file-info panel with a download link.
 */
export const workspaceFileKind = (filename: string): WorkspaceFileKind => {
  const media = EXTENSION_KIND[extensionOf(filename)];
  if (media) {
    return media;
  }
  // previewKind returns "text" for anything it cannot place, so ask it for a
  // language first: no language means the file is not text at all.
  const kind = previewKind({ name: filename });
  if (kind !== "text") {
    return kind;
  }
  const ext = extensionOf(filename);
  const base = filename.split("/").pop()?.toLowerCase() ?? "";
  // Plain text only when the name says so: ".txt"/".log", or a dotfile
  // (".gitignore", ".env") which carries no extension at all.
  return ext === "txt" || ext === "log" || base.startsWith(".")
    ? "text"
    : "binary";
};
