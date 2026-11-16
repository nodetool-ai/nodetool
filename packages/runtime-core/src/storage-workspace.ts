/**
 * The one {@link Workspace} implementation, over any {@link StorageAdapter}.
 *
 * There is deliberately no second implementation for local folders: a local
 * workspace is this class over a `FileStorageAdapter`, which is what keeps the
 * two deployments on the same code path instead of on two that drift.
 */

import { getNodeBuiltinSync } from "@nodetool-ai/config";

import { FileStorageAdapter } from "@nodetool-ai/storage";
import type { StorageAdapter } from "@nodetool-ai/storage";
import { PrefixedStorageAdapter } from "./prefixed-storage-adapter.js";
import { withTaskSpan } from "./tracing.js";
import {
  NestedFolders,
  RESERVED_WORKSPACE_DIR,
  WorkspaceFolderCheckError,
  WorkspacePathError,
  WorkspaceReservedPathError,
  isReservedWorkspaceKey,
  isReservedWorkspaceName,
  type Workspace,
  type WorkspaceEntry,
  type WorkspaceStat,
  type WriteNewOptions
} from "./workspace.js";

// Loaded lazily so this module still imports in browser / Edge runtimes, the
// same way the storage adapters above it do. Only `materialize`, `absorb`,
// `scratchDir` and the local branches of `mkdir`/`deleteAll` need them, and
// each says so when they are missing.
const nodeFsP =
  getNodeBuiltinSync<typeof import("node:fs/promises")>("node:fs/promises");
const nodePath = getNodeBuiltinSync<typeof import("node:path")>("node:path");
const nodeOs = getNodeBuiltinSync<typeof import("node:os")>("node:os");

function requireNode(): {
  fs: typeof import("node:fs/promises");
  path: typeof import("node:path");
  os: typeof import("node:os");
} {
  if (!nodeFsP || !nodePath || !nodeOs) {
    throw new Error(
      "Local workspace file access requires a Node.js runtime; this workspace " +
        "operation is not available here"
    );
  }
  return { fs: nodeFsP, path: nodePath, os: nodeOs };
}

/** `path.resolve`, but only where Node is available. */
function resolvePath(...parts: string[]): string {
  return requireNode().path.resolve(...parts);
}

/**
 * Strip the prefixes a caller may write a workspace path with.
 *
 * `/workspace/notes.md`, `workspace/notes.md` and `notes.md` are the same
 * file: agents and generated code write all three, and the sandbox has always
 * treated `/workspace` as the root. An absolute path is read as
 * workspace-relative rather than rejected, because that is what a model writes
 * when it thinks it is on a normal filesystem.
 */
function stripWorkspacePrefix(path: string): string {
  let p = path.replaceAll("\\", "/").trim();
  if (p.startsWith("/workspace/")) return p.slice("/workspace/".length);
  if (p === "/workspace" || p === "workspace") return "";
  if (p.startsWith("workspace/")) return p.slice("workspace/".length);
  // A Windows drive letter or a POSIX absolute path: keep the tail.
  p = p.replace(/^[A-Za-z]:\//, "");
  return p.startsWith("/") ? p.slice(1) : p;
}

/** Normalize to a key: no `.`/`..` segments, no leading or trailing slash. */
function normalize(path: string): string {
  return normalizeKey(stripWorkspacePrefix(path), path);
}

/**
 * {@link normalize} for a string that is a key already: the prefixes a caller
 * may write a path with are not stripped, so a directory named `workspace`
 * stays one. `shown` is the path an error names.
 */
function normalizeKey(key: string, shown = key): string {
  const segments: string[] = [];
  for (const segment of key.replaceAll("\\", "/").split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) throw new WorkspacePathError(shown);
      segments.pop();
      continue;
    }
    segments.push(segment);
  }
  return segments.join("/");
}

/**
 * The real directory an adapter reads and writes, when it has one.
 *
 * Detected by shape rather than by `instanceof`: a host may pass any adapter
 * that fronts a real directory, including one of its own. An `instanceof`
 * check against `FileStorageAdapter` silently reports such a workspace as
 * virtual, which would send every local run through the staging path.
 */
function localRootOf(storage: StorageAdapter): string | null {
  const candidate = (storage as { rootDir?: unknown }).rootDir;
  return typeof candidate === "string" && candidate !== "" ? candidate : null;
}

/**
 * Whether a path's real (symlink-resolved) location stays inside the root.
 *
 * A local workspace's containment cannot be decided lexically: a symlink
 * inside it can point anywhere on the host, and following one is how an agent
 * reads `~/.ssh/id_rsa` through a file called `notes`. A virtual workspace
 * needs none of this — an object store has no symlinks — which is why the
 * check runs only when there is a real directory.
 *
 * A path that is not there is not an escape — a write target legitimately does
 * not exist yet, and a read of a missing file must answer "missing" rather
 * than "outside" — so the nearest existing ancestor is checked instead.
 * `lstat`, not `access`: a DANGLING symlink pointing outside the root looks
 * absent to `access`, and the create would then follow it out.
 */
async function realPathWithinRoot(
  root: string,
  candidate: string
): Promise<boolean> {
  const { fs, path } = requireNode();
  const realRoot = await fs.realpath(root);
  const within = (real: string): boolean => {
    const rel = path.relative(realRoot, real);
    return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
  };
  try {
    return within(await fs.realpath(candidate));
  } catch {
    // Not resolvable — either absent, or a link with no target.
  }
  try {
    // Exists as a link whose target does not — never follow it.
    await fs.lstat(candidate);
    return false;
  } catch {
    // Genuinely absent: the parent decides.
  }
  // Walk up to the nearest ancestor that exists — writing `out/deep/x.txt`
  // into a workspace that has neither directory yet is ordinary, and only the
  // first real ancestor can be resolved.
  let parent = path.dirname(candidate);
  while (true) {
    try {
      return within(await fs.realpath(parent));
    } catch {
      // realpath failed — either this ancestor is genuinely absent, or it is
      // itself a dangling symlink. lstat, not the loop's next iteration,
      // tells them apart: a dangling symlink exists at this exact path and
      // must never be walked past, or a symlink one level up pointing
      // straight at the root would resolve "within" by accident.
      try {
        await fs.lstat(parent);
        return false;
      } catch {
        // Genuinely absent: keep climbing.
      }
      const next = path.dirname(parent);
      if (next === parent) return false;
      parent = next;
    }
  }
}

/**
 * How long a workspace keeps what it learned about a directory being another
 * folder, in ms. Long enough that a run or a scan asks once per directory,
 * short enough that a workspace held for a long time, such as the one of a
 * chat thread, soon sees a project folder created inside it.
 */
export const NESTED_FOLDER_MEMORY_MS = 10_000;

/** A value read at a time, kept until {@link NESTED_FOLDER_MEMORY_MS} passed. */
interface Remembered<T> {
  at: number;
  value: Promise<T>;
}

function isFresh<T>(remembered: Remembered<T> | null | undefined): remembered is Remembered<T> {
  return (
    remembered != null && Date.now() - remembered.at < NESTED_FOLDER_MEMORY_MS
  );
}

const nodeFs = getNodeBuiltinSync<typeof import("node:fs")>("node:fs");

/**
 * Refuse the real path `target` when it is the folder of another project
 * inside `workspace`, or lies in one. `root` is the real directory the
 * workspace's keys are relative to: its folder, or the scratch directory its
 * files are staged in. `shown` is the path the refusal names.
 *
 * For code that opens a real path itself instead of calling the workspace: a
 * host binary, libav, `node:fs`. The rule is the workspace's own, asked
 * through {@link NestedFolders}, so a folder known by its `.nodetool/`
 * directory and one the host names are refused alike. Containment in `root`
 * is the caller's check: a path outside it is not judged here.
 */
export async function assertLocalPathIsOwn(
  workspace: Pick<Workspace, "isNestedFolder">,
  root: string,
  target: string,
  shown = target
): Promise<void> {
  const { path } = requireNode();
  const inside = path.relative(path.resolve(root), path.resolve(target));
  // The root is the folder itself, which is never another project's.
  if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) return;
  const key = inside.split(path.sep).join("/");
  if (await new NestedFolders(workspace).covers(key)) {
    throw new WorkspaceReservedPathError(shown, "nested");
  }
}

/**
 * Whether the real path `root`/`key` is, or lies in, a directory that holds
 * a reserved directory: the folder of another project inside the workspace
 * rooted at `root`. The root itself never counts.
 *
 * A floor under {@link assertLocalPathIsOwn} for a path that is resolved
 * synchronously, or by a run that has a directory and no workspace. It reads
 * the mark on disk only. A folder the host names without that mark, such as
 * a game's workspace, is known to the workspace alone, so whatever opens the
 * resolved path calls {@link assertLocalPathIsOwn} as well.
 */
export function localPathIsInNestedFolder(root: string, key: string): boolean {
  if (!nodeFs || !nodePath) return false;
  let directory = root;
  for (const segment of key.split("/")) {
    if (!segment) continue;
    directory = nodePath.join(directory, segment);
    const mark = nodeFs.statSync(nodePath.join(directory, RESERVED_WORKSPACE_DIR), {
      throwIfNoEntry: false
    });
    if (mark?.isDirectory()) return true;
  }
  return false;
}

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

/**
 * The directories of a workspace that the host records as folders of their
 * own, as workspace keys. See {@link Workspace.isNestedFolder}.
 */
export type NestedFolderSource = () =>
  | Iterable<string>
  | Promise<Iterable<string>>;

export interface StorageWorkspaceOptions {
  localDir?: string | null;
  /**
   * Called the first time the workspace is asked about a nested folder, and
   * again once {@link NESTED_FOLDER_MEMORY_MS} has passed. A host passes the
   * folders its database records inside this one, so that a folder with no
   * {@link RESERVED_WORKSPACE_DIR} directory, such as a game's workspace, is
   * still known as another folder. The root is never one of them.
   */
  nestedFolders?: NestedFolderSource;
}

export class StorageWorkspace implements Workspace {
  readonly storage: StorageAdapter;
  readonly localDir: string | null;
  private scratch: Promise<string> | null = null;
  private readonly nestedFolderSource: NestedFolderSource | null;
  private declaredNestedFolders: Remembered<ReadonlySet<string>> | null = null;
  /** Per directory key: whether it holds a reserved directory. */
  private readonly reservedMarks = new Map<string, Remembered<boolean>>();
  /**
   * The one rule for the folders of other projects in this workspace. It
   * asks by key, where {@link isNestedFolder} takes a caller's path.
   */
  private readonly nested = new NestedFolders({
    isNestedFolder: (key) => this.isNestedKey(key)
  });

  constructor(storage: StorageAdapter, opts: StorageWorkspaceOptions = {}) {
    this.storage = storage;
    this.localDir = opts.localDir ?? localRootOf(storage);
    this.nestedFolderSource = opts.nestedFolders ?? null;
  }

  /** The nested folders the host named, as lower-cased workspace keys. */
  private declaredNested(): Promise<ReadonlySet<string>> {
    const source = this.nestedFolderSource;
    if (!source) return Promise.resolve(new Set());
    if (isFresh(this.declaredNestedFolders)) {
      return this.declaredNestedFolders.value;
    }
    const value = Promise.resolve()
      .then(source)
      .then((paths) => {
        const keys = new Set<string>();
        for (const path of paths) {
          try {
            // An empty key is the root, which is this folder itself.
            const key = normalizeKey(path);
            if (key) keys.add(key.toLowerCase());
          } catch {
            // A path outside the workspace names no directory in it.
          }
        }
        return keys;
      });
    const remembered = { at: Date.now(), value };
    this.declaredNestedFolders = remembered;
    // An answer that failed is asked for again.
    value.catch(() => {
      if (this.declaredNestedFolders === remembered) {
        this.declaredNestedFolders = null;
      }
    });
    return value;
  }

  /**
   * Whether the directory at `key` holds a reserved directory, remembered
   * for {@link NESTED_FOLDER_MEMORY_MS}.
   */
  private hasReservedDirectory(key: string): Promise<boolean> {
    const known = this.reservedMarks.get(key);
    if (isFresh(known)) return known.value;
    const value = this.readReservedDirectory(key);
    const remembered = { at: Date.now(), value };
    this.reservedMarks.set(key, remembered);
    value.catch(() => {
      if (this.reservedMarks.get(key) === remembered) {
        this.reservedMarks.delete(key);
      }
    });
    return value;
  }

  private async readReservedDirectory(key: string): Promise<boolean> {
    if (this.localDir) {
      await this.ensureRoot();
      const directory = resolvePath(this.localDir, key);
      // A directory reached through a link out of the root is refused by
      // every operation anyway, and nothing outside the root is looked at.
      if (!(await realPathWithinRoot(this.localDir, directory))) return false;
      try {
        const info = await requireNode().fs.stat(
          resolvePath(directory, RESERVED_WORKSPACE_DIR)
        );
        return info.isDirectory();
      } catch {
        return false;
      }
    }
    const listing = await this.storage.list(
      `${key}/${RESERVED_WORKSPACE_DIR}/`,
      { delimiter: "/" }
    );
    return listing.entries.length > 0 || listing.commonPrefixes.length > 0;
  }

  /**
   * On an object store a flat listing names every key below `under`, the
   * reserved ones among them. It therefore says which directories there
   * hold a reserved directory, and none of them is asked about again.
   */
  private rememberReservedMarks(
    entries: readonly { key: string }[],
    under: string
  ): void {
    const marked = new Set<string>();
    const seen = new Set<string>();
    for (const { key } of entries) {
      const segments = key.split("/");
      let directory = "";
      for (const segment of segments.slice(0, -1)) {
        if (isReservedWorkspaceName(segment)) {
          if (directory && segment === RESERVED_WORKSPACE_DIR) {
            marked.add(directory);
          }
          break;
        }
        directory = directory ? `${directory}/${segment}` : segment;
        seen.add(directory);
      }
    }
    const at = Date.now();
    for (const directory of seen) {
      // The listing is complete only for directories at or below `under`.
      if (under && directory !== under && !directory.startsWith(`${under}/`)) {
        continue;
      }
      this.reservedMarks.set(directory, {
        at,
        value: Promise.resolve(marked.has(directory))
      });
    }
  }

  async isNestedFolder(path: string): Promise<boolean> {
    let key: string;
    try {
      key = normalizeKey(path);
    } catch (error) {
      if (error instanceof WorkspacePathError) return false;
      throw error;
    }
    return this.isNestedKey(key);
  }

  /**
   * {@link isNestedFolder} for a normalized key. The root is never one.
   *
   * When the host cannot name its folders, or the storage cannot be asked,
   * the answer is unknown and could be yes. That is a
   * {@link WorkspaceFolderCheckError}, never "no".
   */
  private async isNestedKey(key: string): Promise<boolean> {
    if (!key || isReservedWorkspaceKey(key)) return false;
    try {
      // Compared without case, as the reserved directory is.
      if ((await this.declaredNested()).has(key.toLowerCase())) return true;
      return await this.hasReservedDirectory(key);
    } catch (error) {
      throw new WorkspaceFolderCheckError(key, error);
    }
  }

  /**
   * The entries of a flat listing below the key `under` that are this
   * folder's own: in no reserved directory and in no nested folder.
   */
  private async ownEntries<T extends { key: string }>(
    entries: readonly T[],
    under: string
  ): Promise<T[]> {
    if (!this.localDir) this.rememberReservedMarks(entries, under);
    /** Per directory: whether it is a nested folder or lies in one. */
    const others = new Map<string, boolean>();
    const own: T[] = [];
    for (const entry of entries) {
      if (isReservedWorkspaceKey(entry.key)) continue;
      const slash = entry.key.lastIndexOf("/");
      const directory = slash < 0 ? "" : entry.key.slice(0, slash);
      let other = others.get(directory);
      if (other === undefined) {
        other = directory !== "" && (await this.nested.covers(directory));
        others.set(directory, other);
      }
      if (!other) own.push(entry);
    }
    return own;
  }

  /**
   * Whether the real directory at `key` holds a reserved directory or a
   * nested folder at any depth. Symbolic links are not followed.
   */
  private async holdsOtherFolder(key: string): Promise<boolean> {
    if (!this.localDir) return false;
    const { fs } = requireNode();
    const pending = [key];
    for (let next = pending.pop(); next !== undefined; next = pending.pop()) {
      let children: import("node:fs").Dirent[];
      try {
        children = await fs.readdir(resolvePath(this.localDir, next), {
          withFileTypes: true
        });
      } catch {
        // Not a directory, or gone: it holds nothing.
        continue;
      }
      for (const child of children) {
        if (!child.isDirectory()) continue;
        const childKey = `${next}/${child.name}`;
        if (
          isReservedWorkspaceName(child.name) ||
          (await this.nested.isFolder(childKey))
        ) {
          return true;
        }
        pending.push(childKey);
      }
    }
    return false;
  }

  /**
   * Remove the real directory at `key` with everything in it but the
   * reserved directories and the nested folders. A directory on the way to
   * one stays, emptied of the rest. Returns whether the directory at `key`
   * itself was removed.
   */
  private async removeOwnDirectory(key: string): Promise<boolean> {
    if (!this.localDir) return true;
    const { fs, path } = requireNode();
    const dir = resolvePath(this.localDir, key);
    let children: import("node:fs").Dirent[];
    try {
      children = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      // Not a directory, or already gone.
      await fs.rm(dir, { recursive: true, force: true });
      return true;
    }
    let kept = false;
    for (const child of children) {
      const childKey = `${key}/${child.name}`;
      if (!child.isDirectory()) {
        await fs.rm(path.join(dir, child.name), { force: true });
      } else if (
        isReservedWorkspaceName(child.name) ||
        (await this.nested.isFolder(childKey)) ||
        !(await this.removeOwnDirectory(childKey))
      ) {
        kept = true;
      }
    }
    if (!kept) await fs.rmdir(dir);
    return !kept;
  }

  private rootReady: Promise<void> | null = null;

  /** Create the workspace directory once, on first use. */
  private ensureRoot(): Promise<void> {
    if (!this.localDir) return Promise.resolve();
    const dir = this.localDir;
    this.rootReady ??= requireNode()
      .fs.mkdir(dir, { recursive: true })
      .then(() => undefined);
    return this.rootReady;
  }

  key(path: string): string {
    const key = normalize(path);
    if (!key) throw new WorkspacePathError(path);
    if (isReservedWorkspaceKey(key)) throw new WorkspaceReservedPathError(path);
    return key;
  }

  /**
   * Refuse a path this workspace does not reach: one whose real location
   * leaves the workspace, and one in the folder of another project inside it.
   *
   * Called on every operation. `key()` refuses a `..` that climbs out
   * lexically and the reserved directory. A symlink defeats that, which only
   * a local workspace has. A path in a nested folder is refused on every
   * backend: its files belong to the other project.
   *
   * `asDirectory` is set by the operations that take a directory. They also
   * refuse the nested folder itself, which a path to a file cannot be.
   */
  private async assertContained(
    path: string,
    asDirectory = false
  ): Promise<void> {
    // The lexical rules, the reserved directory among them, hold on every
    // backend. Only the symlink half below needs a real directory.
    const key = this.key(path);
    if (this.localDir) {
      // The root may not exist yet (a workspace folder created on first use).
      // Without this the walk below climbs past it to an ancestor that does
      // exist, finds that outside the root, and refuses every path in a
      // perfectly good workspace.
      await this.ensureRoot();
      const target = resolvePath(this.localDir, key);
      if (!(await realPathWithinRoot(this.localDir, target))) {
        throw new WorkspacePathError(path);
      }
    }
    const other = asDirectory
      ? await this.nested.covers(key)
      : await this.nested.holds(key);
    if (other) throw new WorkspaceReservedPathError(path, "nested");
  }

  uri(path: string): string {
    return this.storage.uriForKey(this.key(path));
  }

  read(path: string): Promise<Uint8Array | null> {
    return withTaskSpan("io", "workspace.read", {}, async (span) => {
      await this.assertContained(path);
      const bytes = await this.storage.retrieve(this.uri(path));
      span?.setAttribute("nodetool.workspace.bytes", bytes?.byteLength ?? 0);
      // The file backend answers with a Buffer, the object stores with a plain
      // Uint8Array. A caller comparing or structured-cloning the result must
      // not be able to tell which backend it got, so narrow to the common type.
      if (bytes === null) return null;
      return bytes instanceof Uint8Array && bytes.constructor === Uint8Array
        ? bytes
        : new Uint8Array(bytes);
    });
  }

  async readText(path: string): Promise<string | null> {
    const bytes = await this.read(path);
    return bytes === null ? null : textDecoder.decode(bytes);
  }

  write(
    path: string,
    data: Uint8Array | string,
    contentType?: string
  ): Promise<void> {
    const bytes = typeof data === "string" ? textEncoder.encode(data) : data;
    return withTaskSpan(
      "io",
      "workspace.write",
      { "nodetool.workspace.bytes": bytes.byteLength },
      async () => {
        await this.assertContained(path);
        await this.storage.store(this.key(path), bytes, contentType);
      }
    );
  }

  writeNew(
    path: string,
    data: Uint8Array | string,
    contentType?: string,
    options: WriteNewOptions = {}
  ): Promise<boolean> {
    const bytes = typeof data === "string" ? textEncoder.encode(data) : data;
    return withTaskSpan(
      "io",
      "workspace.write_new",
      { "nodetool.workspace.bytes": bytes.byteLength },
      async () => {
        await this.assertContained(path);
        if (!this.storage.storeIfAbsent) {
          // Never a check followed by `store`: that is the overwrite this
          // method exists to rule out.
          throw new Error(
            "This workspace's storage cannot create a file without replacing one"
          );
        }
        const key = this.key(path);
        const { stagingName } = options;
        if (stagingName !== undefined) {
          // The staging file sits beside the target, so it is held to the
          // same rules: inside the workspace and outside the reserved directory.
          const slash = key.lastIndexOf("/");
          const beside = `${key.slice(0, slash + 1)}${stagingName}`;
          if (stagingName.includes("/") || this.key(beside) !== beside) {
            throw new WorkspacePathError(stagingName);
          }
        }
        const uri = await this.storage.storeIfAbsent(key, bytes, contentType, {
          stagingName
        });
        return uri !== null;
      }
    );
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.assertContained(path);
    } catch (error) {
      // A path the workspace refuses holds nothing a caller can use. A check
      // that could not be made says nothing about the file, so it is not
      // answered with "absent".
      if (
        error instanceof WorkspacePathError ||
        error instanceof WorkspaceReservedPathError
      ) {
        return false;
      }
      throw error;
    }
    if (!(await this.storage.exists(this.uri(path)))) return false;
    // A real directory answers as existing, and can be another folder.
    return !(this.localDir && (await this.nested.isFolder(this.key(path))));
  }

  async stat(path: string): Promise<WorkspaceStat | null> {
    await this.assertContained(path);
    const key = this.key(path);
    const st = await this.storage.stat(this.storage.uriForKey(key));
    if (st) {
      return {
        path: key,
        size: st.size,
        modifiedAt: st.modifiedAt,
        contentType: st.contentType,
        isDirectory: false
      };
    }
    // No object at that key: it may still be a directory. On an object store a
    // directory exists only as a shared prefix of other keys, so an empty one
    // is indistinguishable from an absent one — but on a local workspace it is
    // a real directory, and reporting an existing empty folder as missing is a
    // difference a caller can see.
    const listing = await this.storage.list(`${key}/`, { delimiter: "/" });
    if (!this.localDir) {
      // The listing shows whether `key` holds a reserved directory, so an
      // object store is not asked about it a second time.
      const reserved = `${key}/${RESERVED_WORKSPACE_DIR}`;
      const marked = listing.commonPrefixes.some(
        (prefix) => prefix === reserved || prefix === `${reserved}/`
      );
      this.reservedMarks.set(key, {
        at: Date.now(),
        value: Promise.resolve(marked)
      });
    }
    if (await this.nested.isFolder(key)) {
      throw new WorkspaceReservedPathError(path, "nested");
    }
    if (listing.entries.length > 0 || listing.commonPrefixes.length > 0) {
      return { path: key, size: 0, modifiedAt: 0, isDirectory: true };
    }
    if (this.localDir) {
      const { fs } = requireNode();
      try {
        const info = await fs.stat(resolvePath(this.localDir, key));
        if (info.isDirectory()) {
          return {
            path: key,
            size: 0,
            modifiedAt: info.mtimeMs,
            isDirectory: true
          };
        }
      } catch {
        // Absent — fall through.
      }
    }
    return null;
  }

  list(
    path = "",
    opts: { recursive?: boolean } = {}
  ): Promise<WorkspaceEntry[]> {
    return withTaskSpan(
      "io",
      "workspace.list",
      { "nodetool.workspace.recursive": opts.recursive === true },
      () => this.listEntries(path, opts)
    );
  }

  private async listEntries(
    path: string,
    opts: { recursive?: boolean }
  ): Promise<WorkspaceEntry[]> {
    const key = normalize(path);
    if (key) await this.assertContained(key, true);
    const prefix = key ? `${key}/` : "";
    const listing = await this.storage.list(
      prefix,
      opts.recursive === true ? {} : { delimiter: "/" }
    );
    // `assertContained` above refuses a listing that starts in a reserved
    // directory or a nested folder. One that starts above them leaves them
    // out, at every depth.
    const entries =
      opts.recursive === true
        ? await this.ownEntries(listing.entries, key)
        : listing.entries.filter((entry) => !isReservedWorkspaceKey(entry.key));
    const files: WorkspaceEntry[] = entries.map((entry) => ({
      path: entry.key,
      name: entry.key.slice(entry.key.lastIndexOf("/") + 1),
      size: entry.size,
      modifiedAt: entry.modifiedAt,
      isDirectory: false
    }));
    const dirs: WorkspaceEntry[] = [];
    for (const p of listing.commonPrefixes) {
      const trimmed = p.endsWith("/") ? p.slice(0, -1) : p;
      if (isReservedWorkspaceKey(trimmed)) continue;
      if (await this.nested.isFolder(trimmed)) continue;
      dirs.push({
        path: trimmed,
        name: trimmed.slice(trimmed.lastIndexOf("/") + 1),
        size: 0,
        modifiedAt: 0,
        isDirectory: true
      });
    }
    return [...dirs, ...files].sort((a, b) => a.path.localeCompare(b.path));
  }

  async delete(path: string): Promise<boolean> {
    await this.assertContained(path);
    return this.storage.delete(this.uri(path));
  }

  async deleteAll(path: string): Promise<number> {
    const key = normalize(path);
    // Same containment rule as every other mutating operation: without it a
    // symlinked directory inside the workspace (`out -> ~/Documents`) makes
    // this delete the link's target. `list` reads through the symlink and
    // hands back keys that are lexically inside the root, so the adapter's own
    // lexical check passes and `unlink` follows the link out.
    if (key) await this.assertContained(key, true);
    const listing = await this.storage.list(key ? `${key}/` : "");
    let deleted = 0;
    // NodeTool's own directory is left alone, and so is the folder of another
    // project inside the directory being cleared, with every file in it.
    for (const entry of await this.ownEntries(listing.entries, key)) {
      if (await this.storage.delete(entry.uri)) deleted++;
    }
    // On an object store the prefix is gone once its keys are. A real
    // directory would linger and keep showing up in `list`, so remove it —
    // otherwise the same call leaves two different workspaces behind. A
    // reserved directory and a nested folder below it stay, with the
    // directories that lead to them.
    if (this.localDir && key) await this.removeOwnDirectory(key);
    return deleted;
  }

  async mkdir(path: string): Promise<void> {
    // An object store has no directories — a key's prefix is its directory, so
    // there is nothing to create and nothing to fail. A local workspace makes
    // the real directory so an empty one survives and a host binary can cd
    // into it.
    const key = normalize(path);
    if (!key) return;
    await this.assertContained(key, true);
    if (this.localDir) {
      await requireNode().fs.mkdir(resolvePath(this.localDir, key), {
        recursive: true
      });
    }
  }

  async copy(from: string, to: string): Promise<void> {
    const bytes = await this.read(from);
    if (bytes === null) {
      throw new Error(`Cannot copy '${from}': it does not exist`);
    }
    const st = await this.stat(from);
    await this.write(to, bytes, st?.contentType);
  }

  /**
   * Move a file, or a directory with everything under it. A directory is
   * never moved into itself or onto anything that exists, except onto a name
   * that differs from its own only in case. A local directory is renamed in
   * one step, so the files keep their bytes and modification times. On an
   * object store each file is copied to its new key, then removed.
   *
   * A directory that holds a reserved directory or a nested folder at any
   * depth is refused before anything moves, and so is a target in a nested
   * folder.
   */
  async move(from: string, to: string): Promise<void> {
    await this.assertContained(from);
    const fromKey = this.key(from);
    if (await this.storage.stat(this.storage.uriForKey(fromKey))) {
      await this.copy(from, to);
      await this.delete(from);
      return;
    }
    const source = await this.stat(fromKey);
    if (!source?.isDirectory) {
      throw new Error(`Cannot move '${from}': it does not exist`);
    }
    await this.assertContained(to, true);
    const toKey = this.key(to);
    if (toKey === fromKey || toKey.startsWith(`${fromKey}/`)) {
      throw new Error(`Cannot move '${from}' into itself`);
    }
    const caseOnly = toKey.toLowerCase() === fromKey.toLowerCase();
    if (!caseOnly && (await this.stat(toKey))) {
      throw new Error(`Cannot move '${from}' to '${to}': it already exists`);
    }
    if (this.localDir) {
      const { fs, path } = requireNode();
      if (await this.holdsOtherFolder(fromKey)) {
        throw new WorkspaceReservedPathError(from, "holds");
      }
      const target = resolvePath(this.localDir, toKey);
      await fs.mkdir(path.dirname(target), { recursive: true });
      await fs.rename(resolvePath(this.localDir, fromKey), target);
      return;
    }
    const listing = await this.storage.list(`${fromKey}/`);
    const own = await this.ownEntries(listing.entries, fromKey);
    if (own.length !== listing.entries.length) {
      throw new WorkspaceReservedPathError(from, "holds");
    }
    for (const entry of listing.entries) {
      const moved = `${toKey}/${entry.key.slice(fromKey.length + 1)}`;
      await this.copy(entry.key, moved);
      await this.storage.delete(entry.uri);
    }
  }

  materialize(path: string): Promise<string> {
    return withTaskSpan("io", "workspace.materialize", {}, () =>
      this.stage(path)
    );
  }

  private async stage(path: string): Promise<string> {
    // As a directory: on a local workspace the answer is a real path, and
    // the real directory of a nested folder is not handed out either.
    await this.assertContained(path, true);
    const key = this.key(path);
    if (this.localDir) return resolvePath(this.localDir, key);
    const bytes = await this.read(key);
    if (bytes === null) {
      throw new Error(`Cannot stage '${path}': it does not exist`);
    }
    const node = requireNode();
    const target = node.path.join(await this.scratchDir(), key);
    await node.fs.mkdir(node.path.dirname(target), { recursive: true });
    await node.fs.writeFile(target, bytes);
    return target;
  }

  absorb(localPath: string, path: string): Promise<void> {
    return withTaskSpan("io", "workspace.absorb", {}, () =>
      this.absorbFile(localPath, path)
    );
  }

  private async absorbFile(localPath: string, path: string): Promise<void> {
    const node = requireNode();
    await this.assertContained(path);
    if (
      this.localDir &&
      node.path.resolve(localPath) ===
        node.path.resolve(this.localDir, this.key(path))
    ) {
      // The binary already wrote in place — the workspace *is* that file.
      return;
    }
    await this.write(path, new Uint8Array(await node.fs.readFile(localPath)));
  }

  async scratchDir(): Promise<string> {
    if (this.localDir) return this.localDir;
    const node = requireNode();
    this.scratch ??= node.fs.mkdtemp(
      node.path.join(node.os.tmpdir(), "nodetool-ws-")
    );
    return this.scratch;
  }

  async cleanupScratch(): Promise<void> {
    const scratch = this.scratch;
    this.scratch = null;
    if (scratch) {
      await requireNode().fs.rm(await scratch, { recursive: true, force: true });
    }
  }
}

/**
 * Build a workspace over a storage backend.
 *
 * `prefix` carves a namespace out of a shared bucket — how a cloud deployment
 * gives each user their own workspace inside the one bucket it has.
 */
export function createWorkspace(
  storage: StorageAdapter,
  opts: { prefix?: string | null; nestedFolders?: NestedFolderSource } = {}
): Workspace {
  const { nestedFolders } = opts;
  if (!opts.prefix) return new StorageWorkspace(storage, { nestedFolders });
  return new StorageWorkspace(new PrefixedStorageAdapter(storage, opts.prefix), {
    // A prefixed view of a local folder still has a real directory: the
    // subfolder the prefix names.
    localDir: (() => {
      const root = localRootOf(storage);
      return root ? resolvePath(root, opts.prefix) : null;
    })(),
    nestedFolders
  });
}

/** A workspace over a real directory. */
export function createLocalWorkspace(
  dir: string,
  opts: { nestedFolders?: NestedFolderSource } = {}
): Workspace {
  return new StorageWorkspace(new FileStorageAdapter(dir), opts);
}
