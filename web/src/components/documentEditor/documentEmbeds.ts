/**
 * What the document editor writes for an embed: the `src` of an asset, a
 * project file or an uploaded file, and its default caption. See
 * `document-embeds.ts` in protocol for what each `src` displays.
 */
import { joinDirectory, parentDirectory, type Shot } from "@nodetool-ai/protocol";

import type { Asset } from "../../stores/ApiTypes";
import { useAssetStore } from "../../stores/AssetStore";
import { uploadFileToFolder } from "../workspaces/workspaceTreeActions";
import type { DocumentLocation } from "./documentEditorContext";

/** One embed to insert: `![alt](src)`. */
export interface DocumentEmbedInsert {
  src: string;
  alt: string;
}

/** The folder, beside the document, that uploaded embeds are saved to (PRD Q2). */
export const EMBED_UPLOAD_FOLDER = "assets";

/** A path written into a link: spaces and parentheses would end it. */
const encodeLinkPath = (path: string): string =>
  encodeURI(path).replace(/\(/g, "%28").replace(/\)/g, "%29");

/**
 * The link from the document at `documentPath` to the project file
 * `targetPath`, relative to the document's directory. A document that is not
 * a file of the folder links from the project root, with a leading `/`.
 */
export function relativeDocumentPath(
  documentPath: string | null,
  targetPath: string
): string {
  if (documentPath === null) {
    return encodeLinkPath(`/${targetPath}`);
  }
  const from = parentDirectory(documentPath).split("/").filter(Boolean);
  const to = targetPath.split("/").filter(Boolean);
  let shared = 0;
  while (
    shared < from.length &&
    shared < to.length - 1 &&
    from[shared] === to[shared]
  ) {
    shared++;
  }
  const up = from.slice(shared).map(() => "..");
  return encodeLinkPath([...up, ...to.slice(shared)].join("/"));
}

/** A shot as the storyboard numbers it: `SH 03 · Rooftop chase`. */
export const shotLabel = (shot: Pick<Shot, "index" | "slug" | "action">): string => {
  const name = shot.slug || shot.action.slice(0, 60);
  return `SH ${String(shot.index + 1).padStart(2, "0")}${name ? ` · ${name}` : ""}`;
};

/** Whether a shot's keyframe or clip points at rendered media. */
export const hasMedia = <T extends { uri?: string | null; asset_id?: string | null }>(
  ref: T | null | undefined
): ref is T => Boolean(ref && (ref.uri || ref.asset_id));

/** A file name without its extension, as a default caption. */
export const captionFromName = (name: string): string => {
  const base = name.slice(name.lastIndexOf("/") + 1);
  const dot = base.lastIndexOf(".");
  return dot > 0 ? base.slice(0, dot) : base;
};

/**
 * The embed for an asset. A file of the document's own project is linked by
 * its relative path, so the Markdown stays readable elsewhere. Any other
 * asset is linked by its `asset://` locator.
 */
export function embedForAsset(
  asset: Pick<Asset, "id" | "name" | "project_id" | "workspace_path">,
  location: DocumentLocation
): DocumentEmbedInsert {
  const alt = captionFromName(asset.name);
  if (
    asset.workspace_path &&
    location.projectId !== null &&
    asset.project_id === location.projectId
  ) {
    return { src: relativeDocumentPath(location.path, asset.workspace_path), alt };
  }
  return { src: `asset://${asset.id}`, alt };
}

/** Whether a dropped or pasted file is media a document can show. */
export const isEmbeddableFile = (file: File): boolean =>
  /^(image|video|audio|model)\//.test(file.type) ||
  /\.(glb|gltf)$/i.test(file.name);

/**
 * Save a dropped or pasted file and return its embed. In a project the file
 * goes to `assets/` beside the document. A document outside any project
 * stores it as a plain asset.
 */
export async function uploadEmbedFile(
  file: File,
  location: DocumentLocation
): Promise<DocumentEmbedInsert> {
  if (location.projectId === null) {
    const asset = await useAssetStore.getState().createAsset(file);
    return embedForAsset(asset, location);
  }
  const folder = joinDirectory(
    location.path === null ? "" : parentDirectory(location.path),
    EMBED_UPLOAD_FOLDER
  );
  const asset = await uploadFileToFolder(location.projectId, folder, file);
  return embedForAsset(asset, location);
}
