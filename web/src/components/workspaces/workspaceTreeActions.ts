/**
 * The changes the Files panel makes to a project folder: new folder, rename,
 * delete and move. Inside a project a directory is a folder of the asset
 * API, named by `projectDirectoryId`, and a file is the asset whose
 * `workspace_path` it is. A file that no asset owns cannot be changed here.
 */
import {
  isWithinDirectory,
  parentDirectory,
  projectDirectoryId
} from "@nodetool-ai/protocol";
import { trpcClient } from "../../trpc/client";
import { useAssetStore } from "../../stores/AssetStore";

/** File names of the documents that open in their own editor from Files. */
const DOCUMENT_FILE_SUFFIXES = [
  ".workflow.json",
  ".timeline.json",
  ".storyboard.json",
  ".script.json",
  ".app.json",
  ".jsscript.json",
  ".sketch.json"
] as const;

export const isDocumentFile = (path: string): boolean => {
  const lower = path.toLowerCase();
  return DOCUMENT_FILE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
};

/** A tree path as the asset API spells it: the root is "", never ".". */
export const assetDirectoryPath = (treePath: string): string =>
  treePath === "." ? "" : treePath;

/** Thrown when a file of the tree has no asset to change. */
export class NotAnAssetError extends Error {
  constructor(path: string) {
    super(`No asset owns ${path}`);
    this.name = "NotAnAssetError";
  }
}

type ListedAsset = Awaited<
  ReturnType<typeof trpcClient.assets.list.query>
>["assets"][number];

/** The asset whose file is `path`, or null when no asset owns it. */
export const assetOfFile = async (
  projectId: string,
  path: string
): Promise<ListedAsset | null> => {
  const { assets } = await trpcClient.assets.list.query({
    project_id: projectId,
    parent_id: projectDirectoryId(projectId, parentDirectory(path))
  });
  return assets.find((entry) => entry.workspace_path === path) ?? null;
};

/** The id of the asset whose file is `path`. */
export const assetIdOfFile = async (
  projectId: string,
  path: string
): Promise<string> => {
  const asset = await assetOfFile(projectId, path);
  if (!asset) {
    throw new NotAnAssetError(path);
  }
  return asset.id;
};

/** The id the asset API uses for a tree entry. */
const entryId = (
  projectId: string,
  path: string,
  isDirectory: boolean
): Promise<string> =>
  isDirectory
    ? Promise.resolve(projectDirectoryId(projectId, path))
    : assetIdOfFile(projectId, path);

export const createFolder = async (
  projectId: string,
  parentPath: string,
  name: string
): Promise<void> => {
  await useAssetStore
    .getState()
    .createFolder(
      projectDirectoryId(projectId, assetDirectoryPath(parentPath)),
      name,
      projectId
    );
};

export const renameEntry = async (
  projectId: string,
  path: string,
  isDirectory: boolean,
  name: string
): Promise<void> => {
  const id = await entryId(projectId, path, isDirectory);
  await trpcClient.assets.update.mutate({ id, name });
};

export const deleteEntry = async (
  projectId: string,
  path: string,
  isDirectory: boolean
): Promise<void> => {
  const id = await entryId(projectId, path, isDirectory);
  await trpcClient.assets.delete.mutate({ id });
};

/** How many files a directory delete removes: the assets under it. */
export const countFilesUnder = async (
  projectId: string,
  path: string
): Promise<number> => {
  const { assets } = await trpcClient.assets.recursive.query({
    id: projectDirectoryId(projectId, path),
    project_id: projectId
  });
  return assets.filter((asset) => asset.content_type !== "folder").length;
};

/** Whether `source` may move into the directory `target`. */
export const canMoveInto = (
  source: string,
  isDirectory: boolean,
  target: string
): boolean => {
  const to = assetDirectoryPath(target);
  if (parentDirectory(source) === to) {
    return false;
  }
  return !(isDirectory && isWithinDirectory(to, source));
};

export const moveEntry = async (
  projectId: string,
  source: string,
  isDirectory: boolean,
  target: string
): Promise<void> => {
  const id = await entryId(projectId, source, isDirectory);
  await trpcClient.assets.update.mutate({
    id,
    parent_id: projectDirectoryId(projectId, assetDirectoryPath(target))
  });
};
