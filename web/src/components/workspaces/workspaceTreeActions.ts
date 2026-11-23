/**
 * The changes the Files panel makes to a project folder: new document, new
 * folder, copy/paste, rename, delete and move. Inside a project a directory is
 * a folder of the asset API, named by `projectDirectoryId`, and a file is the
 * asset whose `workspace_path` it is. A file that no asset owns cannot be
 * changed here.
 */
import {
  directoryName,
  isWithinDirectory,
  joinDirectory,
  parentDirectory,
  parseProjectDirectoryId,
  projectDirectoryId
} from "@nodetool-ai/protocol";
import { trpcClient } from "../../trpc/client";
import type { Asset } from "../../stores/ApiTypes";
import { useAssetStore } from "../../stores/AssetStore";

/** File names of the documents that open in their own editor from Files. */
const DOCUMENT_FILE_SUFFIXES = [
  ".workflow.json",
  ".timeline.json",
  ".storyboard.json",
  ".script.json",
  ".app.json",
  ".jsscript.json",
  ".sketch.ora"
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

/** Maximum single-page size accepted by `assets.list` (`listInput.page_size`). */
const ASSETS_LIST_MAX_PAGE_SIZE = 10_000;

const isDirectChildOfDirectory = (
  entry: ListedAsset,
  dirPath: string,
  parentId: string
): boolean => {
  if (entry.content_type === "folder") {
    const folderPath =
      parseProjectDirectoryId(entry.id)?.path ?? entry.workspace_path ?? null;
    if (folderPath !== null) {
      return folderPath !== dirPath && parentDirectory(folderPath) === dirPath;
    }
    return entry.parent_id === parentId;
  }
  if (entry.workspace_path) {
    return parentDirectory(entry.workspace_path) === dirPath;
  }
  return entry.parent_id === parentId;
};

/**
 * List every direct child of a project directory.
 *
 * `assets.list` takes no cursor input (`listInput` only has `page_size`, max
 * and default 10,000) and slices non-folder results to `page_size` (returning
 * `next: null` for project directories, or a non-null `next` in legacy paths).
 * When the single-page response signals more items (`next != null`) or hits
 * the 10,000-file cap, fall back to the unbounded `assets.recursive` query and
 * keep only direct children so lookups and collision checks see every entry.
 */
export const listAllFolderAssets = async (
  projectId: string,
  parentId: string
): Promise<ListedAsset[]> => {
  const { assets, next } = await trpcClient.assets.list.query({
    project_id: projectId,
    parent_id: parentId
  });
  const nonFolderCount = assets.reduce(
    (count, entry) => count + (entry.content_type === "folder" ? 0 : 1),
    0
  );
  if (!next && nonFolderCount < ASSETS_LIST_MAX_PAGE_SIZE) {
    return assets;
  }

  const { assets: recursiveAssets } = await trpcClient.assets.recursive.query({
    id: parentId,
    project_id: projectId
  });
  const parsed = parseProjectDirectoryId(parentId);
  const directFromRecursive = parsed
    ? recursiveAssets.filter((entry) =>
        isDirectChildOfDirectory(entry, parsed.path, parentId)
      )
    : recursiveAssets.filter((entry) => entry.parent_id === parentId);

  const byId = new Map<string, ListedAsset>();
  for (const entry of assets) {
    byId.set(entry.id, entry);
  }
  for (const entry of directFromRecursive) {
    byId.set(entry.id, entry);
  }
  return Array.from(byId.values());
};

/** The asset whose file is `path`, or null when no asset owns it. */
export const assetOfFile = async (
  projectId: string,
  path: string
): Promise<ListedAsset | null> => {
  const assets = await listAllFolderAssets(
    projectId,
    projectDirectoryId(projectId, parentDirectory(path))
  );
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

const collectExistingNames = (
  assets: ReadonlyArray<{ name?: string | null; workspace_path?: string | null }>
): Set<string> => {
  const names = new Set<string>();
  for (const entry of assets) {
    if (entry.name) {
      names.add(entry.name.toLowerCase());
    }
    if (entry.workspace_path) {
      names.add(directoryName(entry.workspace_path).toLowerCase());
    }
  }
  return names;
};

const hasNameCollision = (
  existing: ReadonlySet<string>,
  candidate: string
): boolean => {
  const lower = candidate.toLowerCase();
  if (existing.has(lower)) {
    return true;
  }
  return existing.has(lower.replace(/\s+/g, "-"));
};

const splitFileName = (name: string): { stem: string; ext: string } => {
  const lower = name.toLowerCase();
  const docSuffix = DOCUMENT_FILE_SUFFIXES.find((suffix) =>
    lower.endsWith(suffix)
  );
  if (docSuffix && name.length > docSuffix.length) {
    return {
      stem: name.slice(0, name.length - docSuffix.length),
      ext: name.slice(name.length - docSuffix.length)
    };
  }
  const dot = name.lastIndexOf(".");
  if (dot <= 0) {
    return { stem: name, ext: "" };
  }
  return { stem: name.slice(0, dot), ext: name.slice(dot) };
};

const nextUntitledDocumentName = (existing: ReadonlySet<string>): string => {
  const base = "Untitled.md";
  if (!hasNameCollision(existing, base)) {
    return base;
  }
  let index = 2;
  while (hasNameCollision(existing, `Untitled ${index}.md`)) {
    index += 1;
  }
  return `Untitled ${index}.md`;
};

/** Compute a non-colliding copy name (`foo copy.md`, `foo copy 2.md`, ...). */
export const nextAvailableCopyName = (
  name: string,
  existing: ReadonlySet<string>,
  isDirectory: boolean
): string => {
  if (!hasNameCollision(existing, name)) {
    return name;
  }
  const { stem, ext } = isDirectory
    ? { stem: name, ext: "" }
    : splitFileName(name);
  const firstCopy = `${stem} copy${ext}`;
  if (!hasNameCollision(existing, firstCopy)) {
    return firstCopy;
  }
  let index = 2;
  while (hasNameCollision(existing, `${stem} copy ${index}${ext}`)) {
    index += 1;
  }
  return `${stem} copy ${index}${ext}`;
};

/** Create a blank Markdown document inside `folderPath` with a unique name. */
export const createDocumentInFolder = async (
  projectId: string,
  folderPath: string
): Promise<Asset> => {
  const dirPath = assetDirectoryPath(folderPath);
  const parentId = projectDirectoryId(projectId, dirPath);
  const assets = await listAllFolderAssets(projectId, parentId);
  const filename = nextUntitledDocumentName(collectExistingNames(assets));
  const file = new File([""], filename, { type: "text/markdown" });
  return useAssetStore.getState().createAsset(
    file,
    undefined,
    parentId,
    undefined,
    "file",
    projectId,
    dirPath || "."
  );
};

/**
 * Upload `file` into `folderPath`, creating the folder when it is missing.
 * A name that exists gets a numbered copy, so nothing is overwritten.
 */
export const uploadFileToFolder = async (
  projectId: string,
  folderPath: string,
  file: File
): Promise<Asset> => {
  const dirPath = assetDirectoryPath(folderPath);
  if (dirPath !== "") {
    const parentPath = parentDirectory(dirPath);
    const siblings = await listAllFolderAssets(
      projectId,
      projectDirectoryId(projectId, parentPath)
    );
    const exists = siblings.some(
      (entry) =>
        entry.content_type === "folder" &&
        (parseProjectDirectoryId(entry.id)?.path ?? entry.workspace_path) ===
          dirPath
    );
    if (!exists) {
      await createFolder(projectId, parentPath, directoryName(dirPath));
    }
  }
  const parentId = projectDirectoryId(projectId, dirPath);
  const existing = collectExistingNames(
    await listAllFolderAssets(projectId, parentId)
  );
  const name = nextAvailableCopyName(file.name, existing, false);
  const upload =
    name === file.name ? file : new File([file], name, { type: file.type });
  return useAssetStore
    .getState()
    .createAsset(upload, undefined, parentId, undefined, "file", projectId, dirPath || ".");
};

/** Whether `source` may be copied into the directory `target`. */
export const canCopyInto = (
  source: string,
  isDirectory: boolean,
  target: string
): boolean => {
  if (!isDirectory) {
    return true;
  }
  return !isWithinDirectory(
    assetDirectoryPath(target),
    assetDirectoryPath(source)
  );
};

const relativePathUnder = (
  entryPath: string,
  rootDir: string
): string | null => {
  if (!rootDir) {
    return entryPath;
  }
  const prefix = `${rootDir}/`;
  if (entryPath.startsWith(prefix)) {
    return entryPath.slice(prefix.length);
  }
  return null;
};

const downloadAssetFile = async (
  assetId: string,
  targetName: string,
  fallbackContentType?: string | null
): Promise<File> => {
  const full = await useAssetStore.getState().get(assetId);
  if (!full.get_url) {
    throw new Error(`Asset ${full.name || targetName} has no downloadable URL`);
  }
  const response = await fetch(full.get_url);
  if (!response.ok) {
    throw new Error(
      `Failed to download ${full.name || targetName} (${response.status})`
    );
  }
  const blob = await response.blob();
  const contentType =
    full.content_type ||
    fallbackContentType ||
    blob.type ||
    "application/octet-stream";
  return new File([blob], targetName, { type: contentType });
};

const copySingleFile = async (
  projectId: string,
  sourcePath: string,
  targetDirectory: string
): Promise<void> => {
  const sourceAsset = await assetOfFile(projectId, sourcePath);
  if (!sourceAsset) {
    throw new NotAnAssetError(sourcePath);
  }
  const targetDirPath = assetDirectoryPath(targetDirectory);
  const targetParentId = projectDirectoryId(projectId, targetDirPath);
  const targetEntries = await listAllFolderAssets(projectId, targetParentId);
  const sourceName = directoryName(sourcePath) || sourceAsset.name;
  const targetName = nextAvailableCopyName(
    sourceName,
    collectExistingNames(targetEntries),
    false
  );
  const file = await downloadAssetFile(
    sourceAsset.id,
    targetName,
    sourceAsset.content_type
  );
  await useAssetStore.getState().createAsset(
    file,
    undefined,
    targetParentId,
    undefined,
    "file",
    projectId,
    targetDirPath || "."
  );
};

const copyDirectory = async (
  projectId: string,
  sourcePath: string,
  targetDirectory: string
): Promise<void> => {
  if (!canCopyInto(sourcePath, true, targetDirectory)) {
    throw new Error(
      "A folder cannot be pasted into itself or a folder inside it."
    );
  }
  const normalizedSource = assetDirectoryPath(sourcePath);
  const targetDirPath = assetDirectoryPath(targetDirectory);
  const targetParentId = projectDirectoryId(projectId, targetDirPath);
  const targetEntries = await listAllFolderAssets(projectId, targetParentId);
  const sourceFolderName = directoryName(normalizedSource);
  const destFolderName = nextAvailableCopyName(
    sourceFolderName,
    collectExistingNames(targetEntries),
    true
  );
  await createFolder(projectId, targetDirectory, destFolderName);
  const destRootPath = joinDirectory(targetDirPath, destFolderName);
  const copiedRelPaths: string[] = [];
  const filesToCopy: Array<{
    id: string;
    name: string;
    contentType: string;
    relDir: string;
  }> = [];

  try {
    const { assets: recursiveAssets } = await trpcClient.assets.recursive.query({
      id: projectDirectoryId(projectId, normalizedSource),
      project_id: projectId
    });

    const subfolderRelPaths = new Set<string>();

    for (const entry of recursiveAssets) {
      if (entry.content_type === "folder") {
        const entryPath =
          parseProjectDirectoryId(entry.id)?.path ?? entry.workspace_path ?? null;
        if (!entryPath) {
          continue;
        }
        const rel = relativePathUnder(entryPath, normalizedSource);
        if (rel) {
          subfolderRelPaths.add(rel);
        }
        continue;
      }

      let relDir = "";
      let fileName = entry.name;
      if (entry.workspace_path) {
        const rel = relativePathUnder(entry.workspace_path, normalizedSource);
        if (rel === null) {
          continue;
        }
        relDir = parentDirectory(rel);
        fileName = directoryName(rel) || entry.name;
      } else {
        const parentPath = parseProjectDirectoryId(entry.parent_id)?.path;
        if (parentPath && parentPath !== normalizedSource) {
          relDir = relativePathUnder(parentPath, normalizedSource) ?? "";
        }
      }
      if (relDir) {
        const parts = relDir.split("/");
        for (let i = 1; i <= parts.length; i += 1) {
          subfolderRelPaths.add(parts.slice(0, i).join("/"));
        }
      }
      filesToCopy.push({
        id: entry.id,
        name: fileName,
        contentType: entry.content_type,
        relDir
      });
    }

    const sortedSubfolders = Array.from(subfolderRelPaths).sort((a, b) => {
      const depthDiff = a.split("/").length - b.split("/").length;
      return depthDiff !== 0 ? depthDiff : a.localeCompare(b);
    });

    for (const relFolder of sortedSubfolders) {
      const relParent = parentDirectory(relFolder);
      const folderName = directoryName(relFolder);
      const parentPath = relParent
        ? joinDirectory(destRootPath, relParent)
        : destRootPath;
      await createFolder(projectId, parentPath || ".", folderName);
    }

    for (const fileEntry of filesToCopy) {
      const destDir = fileEntry.relDir
        ? joinDirectory(destRootPath, fileEntry.relDir)
        : destRootPath;
      const destParentId = projectDirectoryId(projectId, destDir);
      const file = await downloadAssetFile(
        fileEntry.id,
        fileEntry.name,
        fileEntry.contentType
      );
      await useAssetStore.getState().createAsset(
        file,
        undefined,
        destParentId,
        undefined,
        "file",
        projectId,
        destDir || "."
      );
      copiedRelPaths.push(
        fileEntry.relDir
          ? joinDirectory(fileEntry.relDir, fileEntry.name)
          : fileEntry.name
      );
    }
  } catch (copyError) {
    const detail =
      copyError instanceof Error ? copyError.message : String(copyError);
    let rollbackSucceeded = false;
    try {
      await trpcClient.assets.delete.mutate({
        id: projectDirectoryId(projectId, destRootPath)
      });
      rollbackSucceeded = true;
    } catch {
      rollbackSucceeded = false;
    }
    if (rollbackSucceeded) {
      throw new Error(
        `Failed to copy folder "${sourceFolderName}" (${detail}). Partial copy was cleaned up.`
      );
    }
    throw new Error(
      `Failed to copy folder "${sourceFolderName}" (${detail}). Partial folder "${destRootPath}" remains with ${copiedRelPaths.length}/${filesToCopy.length} files copied${copiedRelPaths.length > 0 ? `: ${copiedRelPaths.join(", ")}` : ""}.`
    );
  }
};

/** Copy a file or folder recursively into `targetDirectory`. */
export const copyEntry = async (
  projectId: string,
  sourcePath: string,
  isDirectory: boolean,
  targetDirectory: string
): Promise<void> => {
  if (isDirectory) {
    await copyDirectory(projectId, sourcePath, targetDirectory);
    return;
  }
  await copySingleFile(projectId, sourcePath, targetDirectory);
};
