/**
 * Destination resolution shared by every save node
 * (`nodetool.image.SaveImage`, `SaveAudio`, `SaveText`, `SaveVideo`,
 * `SaveDocument`, `SaveModel3D`).
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
import {
  assertLocalPathIsOwn,
  createLocalWorkspace,
  saveRunFileAsset,
  type RunFileAssetContext,
  type Workspace
} from "@nodetool-ai/runtime";
import {
  loadNodeFsPromises,
  loadNodeFsSync,
  loadNodePath
} from "./node-only-modules.js";

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
  visible_when: { property: "save_to_workspace", equals: false },
  // A host folder has no meaning in the managed cloud, which hides the field
  // (PRD R28). A run there with the toggle off is refused by writeSavedFile.
  host_path: true
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

/**
 * A folder ref — what the `folder` property of a save node saved before the
 * save nodes merged (document editor PRD R26, R27) still carries.
 */
interface FolderRefValue {
  uri?: string;
  asset_id?: string | null;
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

/** The slice of a run that resolves an asset folder to its project path. */
export interface SaveFolderLookup {
  getAssetInfo?: (
    assetId: string
  ) => Promise<{ content_type: string; workspace_path?: string | null } | null>;
}

/**
 * The project-relative folder a saved folder reference names, or "" when the
 * value is a path or names no asset folder. An old `SaveImage` saved an asset
 * folder as its target; the merged node writes into that folder's path in the
 * project, so the file lands where it did before (PRD R27).
 */
export async function workspaceFolderOf(
  raw: FolderValue,
  run: SaveFolderLookup | null | undefined
): Promise<string> {
  if (!isFolderRef(raw) || !isSetString(raw.asset_id ?? undefined)) return "";
  const info = await run?.getAssetInfo?.(String(raw.asset_id));
  if (!info || info.content_type !== "folder") return "";
  return (info.workspace_path ?? "").replace(/^\/+|\/+$/g, "");
}

/**
 * The slice of the run's workspace a save node needs.
 *
 * Structural rather than imported: `@nodetool-ai/nodes-utils` sits below
 * `@nodetool-ai/runtime` in the dependency order, and a `ProcessingContext`'s
 * `workspace` satisfies this shape.
 */
export interface SaveWorkspace extends Partial<Pick<Workspace, "isNestedFolder">> {
  localDir: string | null;
  key(path: string): string;
  write(path: string, data: Uint8Array | string, contentType?: string): Promise<void>;
  /** Create a file only when nothing is at `path`. False when something is. */
  writeNew(
    path: string,
    data: Uint8Array | string,
    contentType?: string
  ): Promise<boolean>;
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
 * `name_1.ext`, `name_2.ext`, … in the same directory. A dangling link
 * occupies its name: a write there would follow it and create its target.
 */
export async function uniqueFilePath(target: string): Promise<string> {
  const fs = await loadNodeFsPromises();
  const path = await loadNodePath();
  const exists = async (p: string): Promise<boolean> => {
    try {
      await fs.lstat(p);
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

/**
 * With the workspace toggle off the node names a host folder and writes with
 * `node:fs`, past the workspace. A path outside the run's own folder is the
 * user's choice. A path inside it, by any spelling, is held to the
 * workspace's rule: the reserved `.nodetool/` directory and the folder of
 * another project are refused, as the workspace refuses them
 * (`WorkspaceReservedPathError`). A link inside the folder that leads out of
 * it, or dangles, is refused too (`WorkspacePathError`): a copied folder can
 * carry one, and the write would follow it.
 *
 * Write the file with {@link writeSaveTargetFile}, which opens it without
 * following a link and checks it again where it really is.
 */
export async function assertSaveTargetIsOwn(
  run: Pick<SaveFolderOptions, "workspace" | "workspaceDir"> | null | undefined,
  target: string
): Promise<void> {
  const root = run?.workspace?.localDir ?? run?.workspaceDir ?? null;
  if (!root) return;
  // Nothing can be nested in a folder that does not exist yet, and the check
  // must not create it.
  const fs = await loadNodeFsPromises();
  try {
    await fs.stat(root);
  } catch {
    return;
  }
  // A run with only a directory still learns of a folder by its mark.
  const workspace = run?.workspace?.isNestedFolder
    ? { isNestedFolder: run.workspace.isNestedFolder.bind(run.workspace) }
    : createLocalWorkspace(root);
  await assertLocalPathIsOwn(workspace, root, target, target, { write: true });
}

/** Whether `error` is a Node system error with `code`. */
function hasCode(error: Error, code: string): boolean {
  return "code" in error && error.code === code;
}

export interface SaveTargetFileOptions {
  /**
   * Create the file only when nothing is at the name, a link included.
   * The write then answers false instead of writing.
   */
  exclusive?: boolean;
}

type FsPromises = Awaited<ReturnType<typeof loadNodeFsPromises>>;
type FileHandle = Awaited<ReturnType<FsPromises["open"]>>;

/**
 * Remove `opened`, a file this call created through `handle` and then
 * refused. Node has no `unlinkat`, so the directory is opened and the name is
 * unlinked through `/proc/self/fd/<dir>/<name>`, which names that directory
 * rather than resolving its path again. The name must still hold the file
 * the handle created, by device and inode: a file someone else put there is
 * left alone.
 */
async function removeCreatedFile(
  fs: FsPromises,
  handle: FileHandle,
  opened: string
): Promise<void> {
  const { constants } = await loadNodeFsSync();
  const path = await loadNodePath();
  const dir = await fs
    .open(path.dirname(opened), constants.O_RDONLY | constants.O_DIRECTORY)
    .catch(() => null);
  if (dir === null) return;
  try {
    const entry = `/proc/self/fd/${dir.fd}/${path.basename(opened)}`;
    const [made, found] = await Promise.all([handle.stat(), fs.lstat(entry)]);
    if (made.dev === found.dev && made.ino === found.ino) {
      await fs.unlink(entry);
    }
  } catch {
    // The file is gone or was replaced, and either way is not removed.
  } finally {
    await dir.close();
  }
}

/** How often a name that keeps appearing and vanishing is tried. */
const SAVE_OPEN_ATTEMPTS = 3;

/**
 * Write `bytes` to `target`, a path {@link assertSaveTargetIsOwn} accepted.
 *
 * The check and the write are two steps, and a link swapped in between them
 * would redirect a plain `writeFile`. So the name is opened with
 * `O_NOFOLLOW`, and, where the host can say which file a descriptor is
 * (`/proc/self/fd` on Linux), the opened file is checked again where it
 * really is, before a byte is written. A name found absent is created with
 * `O_EXCL`, so a file that appears there before the open, as one does when a
 * directory above it is swapped for a link, is never taken for this call's
 * own. Only a file this call created is removed when it is refused. A link at
 * the name that the check accepted, one to a file of the folder's own, is
 * written through by its resolved path.
 *
 * Returns false when `exclusive` is set and the name is taken.
 */
export async function writeSaveTargetFile(
  run: Pick<SaveFolderOptions, "workspace" | "workspaceDir"> | null | undefined,
  target: string,
  bytes: Uint8Array | string,
  options: SaveTargetFileOptions = {}
): Promise<boolean> {
  const fs = await loadNodeFsPromises();
  const { constants } = await loadNodeFsSync();
  const exclusive = options.exclusive === true;
  for (let attempt = 1; ; attempt++) {
    let opening = target;
    let existed = await fs.lstat(target).then(
      (info) => (info.isSymbolicLink() ? "link" : "file"),
      () => "none"
    );
    if (existed === "link" && !exclusive) {
      // Resolved and checked again: the link may have changed since the check.
      try {
        opening = await fs.realpath(target);
      } catch {
        throw new Error(
          `'${target}' is a link to a file that does not exist. A save does ` +
            `not create a file through a link. Choose another name.`
        );
      }
      await assertSaveTargetIsOwn(run, opening);
      existed = "file";
    }
    const creates = exclusive || existed === "none";
    const flags =
      constants.O_WRONLY |
      constants.O_CREAT |
      (constants.O_NOFOLLOW ?? 0) |
      (creates ? constants.O_EXCL : 0);
    let handle: FileHandle;
    try {
      handle = await fs.open(opening, flags, 0o666);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      if (hasCode(error, "EEXIST")) {
        if (exclusive) return false;
        if (attempt < SAVE_OPEN_ATTEMPTS) {
          // A file appeared at the name since it was found absent. The path
          // may lead somewhere else now, so it is checked again.
          await assertSaveTargetIsOwn(run, target);
          continue;
        }
        throw new Error(
          `'${target}' kept changing while it was saved. The save was stopped.`,
          { cause: error }
        );
      }
      if (hasCode(error, "ELOOP")) {
        throw new Error(
          `'${target}' became a link while it was saved. The save was ` +
            `stopped rather than written through it.`,
          { cause: error }
        );
      }
      throw error;
    }
    try {
      const opened = await fs
        .readlink(`/proc/self/fd/${handle.fd}`)
        .catch(() => null);
      if (opened !== null && opened !== opening) {
        try {
          await assertSaveTargetIsOwn(run, opened);
        } catch (refusal) {
          if (creates) await removeCreatedFile(fs, handle, opened);
          throw refusal;
        }
      }
      if (!exclusive) await handle.truncate(0);
      await handle.writeFile(bytes);
    } finally {
      await handle.close();
    }
    return true;
  }
}

export interface SaveTargetOptions extends SaveFolderOptions {
  /** The node's filename property, with date tokens already expanded. */
  filename: string;
  /**
   * A folder in the project, from {@link workspaceFolderOf}, that a save to
   * the workspace writes into. Ignored for a host folder.
   */
  workspaceFolder?: string;
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
  await assertSaveTargetIsOwn(opts, target);
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
 * first output. Given the run's `context`, the file is also an asset: it is
 * written once, in the project folder, and a row points at it.
 *
 * With the toggle off the node is naming a host folder, which only exists on a
 * local install; a cloud run has no such folder and says so rather than writing
 * somewhere the user will never find.
 */
export async function writeSavedFile(opts: WriteSavedFileOptions): Promise<string> {
  return (await writeSavedFileAsset(opts)).path;
}

export type WriteSavedFileOptions = SaveTargetOptions & {
  bytes: Uint8Array | string;
  /**
   * The run, when the saved file should be an asset. Without it the file
   * is written and no row is created.
   */
  context?: RunFileAssetContext | null;
  /** The file's MIME type. Unset, the asset host infers it from the name. */
  contentType?: string;
};

/**
 * `writeSavedFile`, also reporting the asset the save created: its id, or
 * null when the save wrote a host folder or the host keeps no asset rows.
 */
export async function writeSavedFileAsset(
  opts: WriteSavedFileOptions
): Promise<{ path: string; asset_id: string | null }> {
  const workspace = opts.workspace ?? null;
  const isVirtual = workspace !== null && workspace.localDir === null;

  if (opts.saveToWorkspace === true && workspace) {
    const name = requireFilename(opts.filename);
    const filename = opts.workspaceFolder ? `${opts.workspaceFolder}/${name}` : name;
    const bytes =
      opts.bytes instanceof Uint8Array
        ? opts.bytes
        : new TextEncoder().encode(opts.bytes);
    // A numbered name is claimed with an exclusive create, so two saves of
    // one name, in this process or another, never write over each other.
    const target =
      opts.overwrite === true
        ? workspace.key(filename)
        : await claimWorkspacePath(
            workspace,
            workspace.key(filename),
            bytes,
            opts.contentType
          );
    let assetId: string | null = null;
    if (opts.context) {
      // The asset takes the claimed file: its row points at that path, and
      // the host writes the same bytes there again.
      const saved = await saveRunFileAsset(opts.context, bytes, {
        path: target,
        name: target.slice(target.lastIndexOf("/") + 1),
        contentType: opts.contentType ?? "application/octet-stream"
      });
      assetId = saved.asset_id;
    } else if (opts.overwrite === true) {
      await workspace.write(target, bytes, opts.contentType);
    }
    // A local workspace reports the real path, which is what a user browsing
    // their workspace on disk expects.
    if (workspace.localDir) {
      const path = await loadNodePath();
      return { path: path.join(workspace.localDir, target), asset_id: assetId };
    }
    return { path: target, asset_id: assetId };
  } else if (isVirtual) {
    throw new Error(
      "This node writes to a folder on the machine running the workflow, and " +
        "this run's workspace is cloud storage with no such folder. Turn on " +
        '"Save to workspace" to write into the workspace instead.'
    );
  }

  const target = await resolveSaveTarget(opts);
  if (opts.overwrite === true) {
    await writeSaveTargetFile(opts, target, opts.bytes);
    return { path: target, asset_id: null };
  }
  // The free name is claimed with an exclusive create. One taken since it
  // was found is passed over for the next.
  let candidate = target;
  while (!(await writeSaveTargetFile(opts, candidate, opts.bytes, { exclusive: true }))) {
    candidate = await uniqueFilePath(target);
  }
  return { path: candidate, asset_id: null };
}

/**
 * Write `bytes` to `name.ext`, or to `name_1.ext`, `name_2.ext`, … when the
 * name is taken, and return the path written. Each candidate is created with
 * `writeNew`, so an existing file is never replaced.
 */
async function claimWorkspacePath(
  workspace: SaveWorkspace,
  filename: string,
  bytes: Uint8Array,
  contentType: string | undefined
): Promise<string> {
  const slash = filename.lastIndexOf("/");
  const dot = filename.lastIndexOf(".");
  const base = dot > slash + 1 ? filename.slice(0, dot) : filename;
  const ext = dot > slash + 1 ? filename.slice(dot) : "";
  for (let i = 0; ; i++) {
    const candidate = i === 0 ? filename : `${base}_${i}${ext}`;
    if (await workspace.writeNew(candidate, bytes, contentType)) return candidate;
  }
}

/**
 * A save node's output ref. When the save created an asset, the ref names
 * it, so downstream nodes and the editor read the asset rather than a path
 * on the machine that ran the workflow.
 */
export function savedMediaRef<T extends object>(
  ref: T,
  assetId: string | null
): T | (T & { uri: string; asset_id: string }) {
  return assetId ? { ...ref, uri: `asset://${assetId}`, asset_id: assetId } : ref;
}
