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

/**
 * The slice of the run's workspace a save node needs.
 *
 * Structural rather than imported: `@nodetool-ai/nodes-utils` sits below
 * `@nodetool-ai/runtime` in the dependency order, and a `ProcessingContext`'s
 * `workspace` satisfies this shape.
 */
export interface SaveWorkspace {
  localDir: string | null;
  exists(path: string): Promise<boolean>;
  write(path: string, data: Uint8Array | string, contentType?: string): Promise<void>;
}

export interface SaveFolderOptions {
  /** The node's `folder` property, whatever shape it arrived in. */
  folder: FolderValue;
  /** The node's `save_to_workspace` property. */
  saveToWorkspace: boolean | undefined;
  /** `context.workspace` — null when the run has no workspace. */
  workspace?: SaveWorkspace | null;
  /**
   * `context.workspaceDir`. Only meaningful for a workspace that is a real
   * folder; a cloud run has none and saves through `workspace` instead.
   */
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
  const workspaceDir = opts.workspace?.localDir ?? opts.workspaceDir ?? null;
  if (opts.saveToWorkspace === true && workspaceDir) {
    return workspaceDir;
  }
  return folder || workspaceDir || ".";
}

/** What a save node calls its file when the user leaves the name empty. */
export interface SaveFilenameOptions {
  /** The node's filename property, with date tokens already expanded. */
  filename: string;
  /** The name to use when `filename` is blank. Carries its own extension. */
  fallback: string;
  /** Extension (with the dot) to append when the name carries none. */
  extension?: string;
}

/**
 * The name a save node writes under.
 *
 * A blank name used to reach `path.resolve(folder, "")`, which is the folder
 * itself: the file landed *beside* the workspace, named after it, with no
 * extension. And a name typed without one ("render") produced a file no image
 * viewer would open. Both are answered here rather than in each node.
 */
export function saveFilename(opts: SaveFilenameOptions): string {
  const name = opts.filename.trim() || opts.fallback.trim();
  const ext = opts.extension;
  if (!ext) return name;
  const dot = name.lastIndexOf(".");
  const hasExtension = dot > 0 && dot < name.length - 1;
  return hasExtension ? name : `${name}${ext}`;
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

/**
 * Refuse a blank name instead of resolving it to the destination folder.
 *
 * Every save node supplies a fallback via {@link saveFilename}; one that
 * forgets must fail loudly rather than write a file over the folder's own
 * name, one level up from where the user asked for it.
 */
function requireFilename(filename: string): string {
  const name = filename.trim();
  if (!name) {
    throw new Error(
      "This save node resolved to an empty filename. Set a filename on the " +
        "node."
    );
  }
  return name;
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
  const target = path.resolve(folder, requireFilename(opts.filename));
  await fs.mkdir(path.dirname(target), { recursive: true });
  return opts.overwrite === true ? target : uniqueFilePath(target);
}

/**
 * Write a saved file where the node's properties say it goes, and report the
 * path it landed on.
 *
 * With the workspace toggle on this writes through the workspace, so the same
 * node produces a file in the user's folder locally and an object in their
 * workspace prefix in the cloud. The name is deduplicated the same way in both
 * cases — a run that saves twice in one second must not silently overwrite its
 * first output.
 *
 * With the toggle off the node is naming a host folder, which only exists on a
 * local install; a cloud run has no such folder and says so rather than writing
 * somewhere the user will never find.
 */
export async function writeSavedFile(
  opts: SaveTargetOptions & { bytes: Uint8Array | string }
): Promise<string> {
  const workspace = opts.workspace ?? null;
  const isVirtual = workspace !== null && workspace.localDir === null;

  if (opts.saveToWorkspace === true && workspace) {
    if (isVirtual) {
      const filename = requireFilename(opts.filename);
      const target =
        opts.overwrite === true
          ? filename
          : await uniqueWorkspacePath(workspace, filename);
      await workspace.write(target, opts.bytes);
      return target;
    }
    // A local workspace is a real folder, so the file goes there by path —
    // which is what a user browsing their workspace on disk expects.
  } else if (isVirtual) {
    throw new Error(
      "This node writes to a folder on the machine running the workflow, and " +
        "this run's workspace is cloud storage with no such folder. Turn on " +
        '"Save to workspace" to write into the workspace instead.'
    );
  }

  const fs = await loadNodeFsPromises();
  const target = await resolveSaveTarget(opts);
  await fs.writeFile(target, opts.bytes);
  return target;
}

/** `name.ext`, `name_1.ext`, … — the first one the workspace does not hold. */
async function uniqueWorkspacePath(
  workspace: SaveWorkspace,
  filename: string
): Promise<string> {
  if (!(await workspace.exists(filename))) return filename;
  const dot = filename.lastIndexOf(".");
  const base = dot > 0 ? filename.slice(0, dot) : filename;
  const ext = dot > 0 ? filename.slice(dot) : "";
  for (let i = 1; ; i++) {
    const candidate = `${base}_${i}${ext}`;
    if (!(await workspace.exists(candidate))) return candidate;
  }
}
