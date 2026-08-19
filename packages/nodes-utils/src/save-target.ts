/**
 * Destination resolution shared by every node that writes a file to disk
 * (`nodetool.image.SaveImageFile`, `SaveAudioFile`, `SaveTextFile`,
 * `SaveVideoFile`, `SaveDocumentFile`, `SaveModel3DFile`).
 *
 * Two things every one of them needs and each used to solve on its own:
 *
 *  - **Where to write.** Without a folder they fell back to `.` — the server
 *    process working directory, which is almost never where a user wants
 *    output. The `save_to_workspace` toggle points them at the run's workspace
 *    folder instead.
 *  - **What to call it.** Filenames carry second-granularity date tokens, so
 *    two saves in the same second collided and one silently overwrote the
 *    other. `uniqueFilePath` numbers them `name_1.ext`, `name_2.ext`, …
 */
import { loadNodeFsPromises, loadNodePath } from "./node-only-modules.js";

/** Title every save node shows on the workspace toggle. */
export const SAVE_TO_WORKSPACE_TITLE = "Save to workspace";

/** Description every save node shows on the workspace toggle. */
export const SAVE_TO_WORKSPACE_DESCRIPTION =
  "Write the file into this workflow's workspace folder and number it (name_1, name_2, …) instead of overwriting. Turn this off to choose a folder yourself.";

/**
 * `json_schema_extra` for a folder property that only applies while the
 * workspace toggle is off. The editor hides the field rather than showing a
 * path that has no effect.
 */
export const VISIBLE_WHEN_NOT_SAVING_TO_WORKSPACE = {
  visible_when: { property: "save_to_workspace", equals: false }
} as const;

/** Turn a `file://` URI into a plain path; leave a plain path alone. */
function toPath(value: string): string {
  if (!value.startsWith("file://")) return value;
  const rest = value.slice("file://".length);
  try {
    return decodeURIComponent(rest);
  } catch {
    return rest;
  }
}

/** A folder ref — what a `folder`-typed property carries. */
interface FolderRefValue {
  uri?: string;
}

/** Every shape a node's `folder` property arrives in. */
export type FolderValue = string | FolderRefValue | null | undefined;

function isPathString(value: FolderValue): value is string {
  return typeof value === "string";
}

function isFolderRef(value: FolderValue): value is FolderRefValue {
  return typeof value === "object" && value !== null;
}

function isSetString(value: string | undefined): value is string {
  return value !== undefined && value.trim() !== "";
}

/**
 * Read a folder property, which may be a plain path, a `file://` URI or a
 * folder ref object. Returns "" when nothing usable is set.
 */
export function folderPathOf(raw: FolderValue): string {
  if (isPathString(raw)) return toPath(raw.trim());
  if (isFolderRef(raw) && isSetString(raw.uri)) return toPath(raw.uri.trim());
  return "";
}

export interface SaveFolderOptions {
  /** The node's `folder` property, whatever shape it arrived in. */
  folder: FolderValue;
  /** The node's `save_to_workspace` property. */
  saveToWorkspace: boolean | undefined;
  /** `context.workspaceDir` — null when the run has no workspace. */
  workspaceDir?: string | null;
}

/**
 * Pick the destination folder.
 *
 * With the toggle on, the workspace folder wins over the `folder` property —
 * the editor hides that field while the toggle is on, so a value left there is
 * a leftover, not a choice. A run with no workspace assigned has nowhere to put
 * the file, so it falls back to the folder and finally to the working
 * directory rather than failing the run.
 */
export function resolveSaveFolder(opts: SaveFolderOptions): string {
  const folder = folderPathOf(opts.folder);
  if (opts.saveToWorkspace === true && opts.workspaceDir) {
    return opts.workspaceDir;
  }
  return folder || opts.workspaceDir || ".";
}

/**
 * Return a path nothing occupies: `target` itself when free, otherwise
 * `name_1.ext`, `name_2.ext`, … in the same directory.
 */
export async function uniqueFilePath(target: string): Promise<string> {
  const fs = await loadNodeFsPromises();
  const path = await loadNodePath();
  const exists = async (p: string): Promise<boolean> => {
    try {
      await fs.access(p);
      return true;
    } catch {
      return false;
    }
  };
  if (!(await exists(target))) return target;
  const dir = path.dirname(target);
  const ext = path.extname(target);
  const base = path.basename(target, ext);
  for (let i = 1; ; i++) {
    const candidate = path.join(dir, `${base}_${i}${ext}`);
    if (!(await exists(candidate))) return candidate;
  }
}

export interface SaveTargetOptions extends SaveFolderOptions {
  /** The node's filename property, with date tokens already expanded. */
  filename: string;
  /** Skip the numbered suffix and write over an existing file. */
  overwrite?: boolean;
}

/**
 * Resolve folder + filename into an absolute path ready to write to: the
 * directory exists when this returns, and the name does not collide unless the
 * caller asked to overwrite.
 */
export async function resolveSaveTarget(
  opts: SaveTargetOptions
): Promise<string> {
  const fs = await loadNodeFsPromises();
  const path = await loadNodePath();
  const folder = resolveSaveFolder(opts);
  const target = path.resolve(folder, opts.filename);
  await fs.mkdir(path.dirname(target), { recursive: true });
  return opts.overwrite === true ? target : uniqueFilePath(target);
}
