import type { FileManagerKind } from "../../utils/platform";

/** NodeTool's own directory in a project folder. The Files tree never shows it. */
export const PROJECT_METADATA_DIR = ".nodetool";

/** True for the reserved directory at the root of a project folder. */
export const isReservedProjectEntry = (file: { path: string }): boolean =>
  file.path === PROJECT_METADATA_DIR;

/**
 * True for the folder `<name>.sketch/` that holds the layer images of the
 * sketch file `<name>.sketch.json` among `siblings`. The images are part of
 * the sketch, so Files shows the sketch file alone.
 */
export const isSketchAssetFolder = (
  file: { name: string; is_dir: boolean },
  siblings: ReadonlyArray<{ name: string; is_dir: boolean }>
): boolean => {
  if (!file.is_dir || !file.name.toLowerCase().endsWith(".sketch")) {
    return false;
  }
  const json = `${file.name}.json`.toLowerCase();
  return siblings.some(
    (sibling) => !sibling.is_dir && sibling.name.toLowerCase() === json
  );
};

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
