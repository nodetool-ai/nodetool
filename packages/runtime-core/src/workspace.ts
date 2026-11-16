/**
 * The workspace a run reads and writes files in, as an interface rather than a
 * directory.
 *
 * Everything that touched the workspace used to take `workspaceDir: string` and
 * call `node:fs`, which is why a cloud deployment had no workspace worth the
 * name: there is no directory to hand out. A `Workspace` is backed by any
 * `StorageAdapter`, so the local install passes a `FileStorageAdapter` over a
 * real folder and the cloud passes its S3/Supabase adapter scoped to a per-user
 * prefix. Callers cannot tell the difference and must not try — the interface
 * exposes no adapter for that reason.
 *
 * Paths are workspace-relative and normalized: `notes.md`, `out/report.pdf`,
 * `/workspace/notes.md` and `workspace/notes.md` all name the same file, and a
 * path that would climb out of the root is rejected rather than clamped.
 *
 * Object stores have no directories. `mkdir` is therefore a no-op that
 * succeeds, `list` synthesizes directory entries from key prefixes, and an
 * empty directory does not survive a round trip. Code that needs a real
 * directory — a host binary, an mmap'd database — goes through
 * {@link Workspace.materialize} and {@link Workspace.absorb}, or reads
 * {@link Workspace.localDir} and says plainly that it needs a local workspace.
 */

export interface WorkspaceEntry {
  /** Workspace-relative path. */
  path: string;
  /** Last path segment. */
  name: string;
  /** Byte size; 0 for a directory. */
  size: number;
  /** Last-modified time in ms since epoch; 0 for a synthesized directory. */
  modifiedAt: number;
  isDirectory: boolean;
}

export interface WorkspaceStat {
  path: string;
  size: number;
  modifiedAt: number;
  contentType?: string;
  isDirectory: boolean;
}

export interface WriteNewOptions {
  /**
   * A file name in the directory of the path that belongs to the caller
   * alone. A folder on disk writes the bytes under this name first and gives
   * them to the path in one step. A file under the name when the call starts
   * is what a writer that died left, and is removed. The name is gone again
   * when the call returns. An object store creates an object in one step
   * already and ignores the name.
   */
  stagingName?: string;
}

export interface Workspace {
  /**
   * The real directory backing this workspace, or null when it is virtual.
   *
   * Read it only to decide whether a host binary can run in place. Anything
   * that merely moves bytes must use the methods below, which work either way.
   */
  readonly localDir: string | null;

  /** Normalize a caller-supplied path to a workspace key. Throws if it escapes. */
  key(path: string): string;

  /** Opaque URI for a workspace path — what `retrieve`/`delete` round-trip. */
  uri(path: string): string;

  read(path: string): Promise<Uint8Array | null>;
  readText(path: string): Promise<string | null>;
  write(
    path: string,
    data: Uint8Array | string,
    contentType?: string
  ): Promise<void>;
  /**
   * Write a file only when nothing is at `path`. Returns false when a file is
   * there, and that file is left as it was.
   *
   * The check and the write are one step in the backend, so of two writers
   * racing for one path, in this process or another, exactly one succeeds.
   * `write` replaces whatever is there. Throws when the backend cannot make
   * that guarantee, rather than fall back to a write that can overwrite.
   *
   * With `options.stagingName`, `path` also holds the whole file or nothing
   * when the process dies during the write. See {@link WriteNewOptions}.
   */
  writeNew(
    path: string,
    data: Uint8Array | string,
    contentType?: string,
    options?: WriteNewOptions
  ): Promise<boolean>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<WorkspaceStat | null>;
  /**
   * Direct children of `path`, or every descendant when `recursive`.
   * {@link RESERVED_WORKSPACE_DIR} and nested folders are left out.
   */
  list(
    path?: string,
    opts?: { recursive?: boolean }
  ): Promise<WorkspaceEntry[]>;
  /** Delete one file. Returns false when it was not there. */
  delete(path: string): Promise<boolean>;
  /**
   * Delete a directory and everything under it. Returns how many files went.
   * A {@link RESERVED_WORKSPACE_DIR} directory and a nested folder below it
   * stay as they are, with the directories that lead to them.
   */
  deleteAll(path: string): Promise<number>;
  /** No-op on an object store; creates the directory on a local one. */
  mkdir(path: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  /**
   * Move a file, or a directory with everything under it. A directory is
   * never moved into itself or onto an existing entry. A directory that holds
   * a {@link RESERVED_WORKSPACE_DIR} directory or a nested folder at any
   * depth is refused.
   */
  move(from: string, to: string): Promise<void>;

  /**
   * Whether the directory at `path` is a NodeTool folder of its own inside
   * this one: the folder of another project, or of a game. It is one when it
   * holds a {@link RESERVED_WORKSPACE_DIR} directory, or when the host that
   * built this workspace named it. False for the root, which is this folder
   * itself, and for a path outside the workspace.
   *
   * The files of a nested folder belong to the other project. Every other
   * method refuses a path that is such a folder or lies in one, as it
   * refuses {@link RESERVED_WORKSPACE_DIR}: with a
   * {@link WorkspaceReservedPathError}. `list` leaves nested folders out, and
   * `deleteAll` leaves them as they are. See {@link NestedFolders}.
   */
  isNestedFolder(path: string): Promise<boolean>;

  /**
   * A real local path holding this file's current bytes, for handing to a host
   * binary. On a local workspace that is the file itself, so a binary writing
   * in place works. On a virtual one the bytes are staged into a scratch
   * directory and the caller must {@link absorb} anything it changed.
   */
  materialize(path: string): Promise<string>;

  /** Copy a real local file into the workspace. The inverse of materialize. */
  absorb(localPath: string, path: string): Promise<void>;

  /**
   * A real directory a host binary may use for its inputs and outputs. The
   * workspace root on a local workspace; a per-run scratch directory on a
   * virtual one, whose contents reach storage only through `absorb`.
   */
  scratchDir(): Promise<string>;

  /** Remove scratch files staged for this workspace after its run ends. */
  cleanupScratch?(): Promise<void>;
}

/** Thrown when a path would resolve outside the workspace root. */
export class WorkspacePathError extends Error {
  constructor(path: string) {
    super(`Path '${path}' is outside the workspace`);
    this.name = "WorkspacePathError";
  }
}

/**
 * The directory NodeTool owns inside every workspace (PRD D11). It holds the
 * project manifest and, later, caches. No workspace method reaches it: run
 * code (agent tools, Code nodes, save nodes) gets a {@link Workspace}, and
 * NodeTool writes here through a separate workspace rooted at this directory.
 *
 * The name is reserved at every depth. A workspace can hold the folder of
 * another project, such as `projects/<id>` in a managed folder, and that
 * folder's `.nodetool/` is no more reachable than the workspace's own.
 */
export const RESERVED_WORKSPACE_DIR = ".nodetool";

/** True when `name` is the name of {@link RESERVED_WORKSPACE_DIR}. */
export function isReservedWorkspaceName(name: string): boolean {
  return name.toLowerCase() === RESERVED_WORKSPACE_DIR;
}

/**
 * True when a normalized workspace key names {@link RESERVED_WORKSPACE_DIR}
 * or lies in one, at any depth: `.nodetool/x` and `projects/a/.nodetool/x`.
 * Only a segment that is exactly the name counts, so `.nodetool.md`,
 * `fox.nodetool` and `.nodetool-old/x` are ordinary paths.
 *
 * Compared without case, because macOS and Windows folders ignore case and
 * `.NodeTool/x` names the same file there.
 */
export function isReservedWorkspaceKey(key: string): boolean {
  return key.split("/").some(isReservedWorkspaceName);
}

/**
 * Why a workspace refuses a path:
 * - `reserved`: it names {@link RESERVED_WORKSPACE_DIR} or lies in one.
 * - `nested`: it is the folder of another project inside this workspace, or
 *   lies in one.
 * - `holds`: it is a directory with a reserved directory or the folder of
 *   another project somewhere below it, and the operation would take that
 *   along.
 */
export type WorkspaceReservedReason = "reserved" | "nested" | "holds";

/**
 * Thrown when a path names the directory NodeTool reserves for itself, or
 * the folder of another project inside the workspace.
 */
export class WorkspaceReservedPathError extends Error {
  readonly reason: WorkspaceReservedReason;

  constructor(path: string, reason: WorkspaceReservedReason = "reserved") {
    super(
      reason === "nested"
        ? `Path '${path}' is in the folder of another project inside this ` +
            `one. Its files belong to that project. Open that project to ` +
            `use them.`
        : reason === "holds"
          ? `Path '${path}' holds the folder of another project, or a ` +
              `${RESERVED_WORKSPACE_DIR}/ directory NodeTool reserves for its ` +
              `own files. It cannot be moved from here.`
          : `Path '${path}' is inside ${RESERVED_WORKSPACE_DIR}/, which NodeTool ` +
              `reserves for its own files. Choose another folder.`
    );
    this.name = "WorkspaceReservedPathError";
    this.reason = reason;
  }
}

/**
 * The NodeTool folders inside a workspace: the directories for which
 * {@link Workspace.isNestedFolder} answers true.
 *
 * A project folder can hold the folder of another project. Personal's managed
 * folder holds `projects/<id>`, where cloud projects, imported projects and
 * games keep theirs. Those files belong to the other project. One rule
 * decides for everything that touches a folder, and this is where it is
 * asked:
 *
 * - The workspace refuses every operation on a path in a nested folder and
 *   leaves nested folders out of its listings.
 * - Whatever compares a folder with rows (the scan, the watcher, the hash
 *   job, the manifest writer, the document file sync) and whatever follows a
 *   row to its file asks before it looks, so that a row naming such a path
 *   counts as a row whose file is gone.
 *
 * It keeps no answers of its own. The workspace remembers what it learned
 * about a directory for a short time, so asking again costs nothing.
 */
export class NestedFolders {
  constructor(
    private readonly workspace: Pick<Workspace, "isNestedFolder">
  ) {}

  /** Whether the directory at the workspace key `path` is a nested folder. */
  isFolder(path: string): Promise<boolean> {
    return this.workspace.isNestedFolder(path);
  }

  /**
   * Whether the file or directory at the workspace key `path` lies in a
   * nested folder: one of the directories above it is one.
   */
  async holds(path: string): Promise<boolean> {
    for (let slash = path.indexOf("/"); slash > 0; slash = path.indexOf("/", slash + 1)) {
      if (await this.isFolder(path.slice(0, slash))) return true;
    }
    return false;
  }

  /** Whether `path` is a nested folder or lies in one. */
  async covers(path: string): Promise<boolean> {
    return (await this.holds(path)) || (await this.isFolder(path));
  }
}

/** Thrown when an operation needs a real directory and the workspace is virtual. */
export class WorkspaceNotLocalError extends Error {
  constructor(what: string) {
    super(
      `${what} needs a local workspace directory, and this run has a virtual ` +
        `one (cloud storage). Run it on a local install, or use a node that ` +
        `reads and writes through the workspace instead.`
    );
    this.name = "WorkspaceNotLocalError";
  }
}

/** What a mutation did, for a host that wants to react to it. */
export interface WorkspaceChange {
  kind: "write" | "delete" | "mkdir" | "copy" | "move";
  /** The path written, created or removed. Workspace-relative. */
  path: string;
}

/**
 * A workspace that reports its own mutations.
 *
 * The Workspace Explorer lists files over tRPC and has no way to learn that a
 * chat turn just wrote one — workspace files are not database rows, so the
 * `resource_change` broadcast that keeps every other panel live never fires for
 * them. Wrapping the workspace a run resolves is the one place every writer
 * passes through: the file capabilities, the save nodes, and anything else that
 * goes through the interface rather than `node:fs`.
 *
 * `onChange` fires only after the underlying call resolves, so a rejected write
 * never announces a file that is not there. It is called synchronously and must
 * not throw — a notifier is a side channel, and a run must not fail because a
 * listener did.
 */
export function observeWorkspace(
  inner: Workspace,
  onChange: (change: WorkspaceChange) => void
): Workspace {
  const notify = (kind: WorkspaceChange["kind"], path: string): void => {
    try {
      onChange({ kind, path });
    } catch {
      // A listener must never break the write it is reporting.
    }
  };

  return {
    get localDir() {
      return inner.localDir;
    },
    key: (path) => inner.key(path),
    uri: (path) => inner.uri(path),
    read: (path) => inner.read(path),
    readText: (path) => inner.readText(path),
    exists: (path) => inner.exists(path),
    stat: (path) => inner.stat(path),
    list: (path, opts) => inner.list(path, opts),
    isNestedFolder: (path) => inner.isNestedFolder(path),
    materialize: (path) => inner.materialize(path),
    scratchDir: () => inner.scratchDir(),
    cleanupScratch: () => inner.cleanupScratch?.() ?? Promise.resolve(),

    async write(path, data, contentType) {
      await inner.write(path, data, contentType);
      notify("write", path);
    },
    async writeNew(path, data, contentType, options) {
      const written = await inner.writeNew(path, data, contentType, options);
      if (written) notify("write", path);
      return written;
    },
    async delete(path) {
      const removed = await inner.delete(path);
      if (removed) notify("delete", path);
      return removed;
    },
    async deleteAll(path) {
      const count = await inner.deleteAll(path);
      if (count > 0) notify("delete", path);
      return count;
    },
    async mkdir(path) {
      await inner.mkdir(path);
      notify("mkdir", path);
    },
    async copy(from, to) {
      await inner.copy(from, to);
      notify("copy", to);
    },
    async move(from, to) {
      await inner.move(from, to);
      notify("move", to);
    },
    async absorb(localPath, path) {
      await inner.absorb(localPath, path);
      notify("write", path);
    }
  };
}

/** A project's folder, or why it cannot be reached. */
export type ProjectFolderResolution =
  | {
      ok: true;
      projectId: string;
      workspace: Workspace;
      /**
       * The folder's {@link RESERVED_WORKSPACE_DIR}, as a workspace rooted
       * there. NodeTool writes its own files through it, such as the asset
       * manifest. It is never handed to run code.
       */
      nodetoolDir?: Workspace | null;
    }
  | { ok: false; projectId: string | null; reason: string };

/**
 * Resolves a project to the {@link Workspace} that is its folder. A missing
 * or loose project id names the user's Personal project.
 */
export type ProjectFolderResolver = (
  projectId: string | null | undefined,
  userId: string
) => Promise<ProjectFolderResolution>;

let projectFolderResolver: ProjectFolderResolver | null = null;

/**
 * Install the resolver every package below the host reaches project folders
 * through. Project folders live in `@nodetool-ai/execution`, which installs
 * `resolveProjectWorkspace` when it loads. Asset services sit below that
 * package and read and write asset files through this resolver, so a folder
 * is resolved by one set of rules on every path.
 */
export function setProjectFolderResolver(
  resolver: ProjectFolderResolver | null
): void {
  projectFolderResolver = resolver;
}

/** The installed resolver, or null on a host that loads no project folders. */
export function getProjectFolderResolver(): ProjectFolderResolver | null {
  return projectFolderResolver;
}
