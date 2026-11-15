import type { FileManagerKind } from "../../utils/platform";

/** NodeTool's own directory in a project folder. The Files tree never shows it. */
export const PROJECT_METADATA_DIR = ".nodetool";

/** True for the reserved directory at the root of a project folder. */
export const isReservedProjectEntry = (file: { path: string }): boolean =>
  file.path === PROJECT_METADATA_DIR;

/**
 * The host path of a folder entry, in the separator style of the folder's own
 * path so the OS file manager accepts it on Windows too.
 */
export const folderEntryPath = (
  folderPath: string,
  relativePath: string
): string => {
  const separator =
    folderPath.includes("\\") && !folderPath.includes("/") ? "\\" : "/";
  const root = folderPath.replace(/[\\/]+$/, "");
  const entry = relativePath
    .split("/")
    .filter((segment) => segment !== "" && segment !== ".")
    .join(separator);
  return entry === "" ? root : `${root}${separator}${entry}`;
};

const REVEAL_LABEL_KEYS: Readonly<Record<FileManagerKind, string>> = {
  finder: "projectFolder.tree.revealInFinder",
  explorer: "projectFolder.tree.revealInExplorer",
  files: "projectFolder.tree.revealInFileManager"
};

export const revealLabelKey = (kind: FileManagerKind): string =>
  REVEAL_LABEL_KEYS[kind];
