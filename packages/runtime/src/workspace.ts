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
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<WorkspaceStat | null>;
  /** Direct children of `path`, or every descendant when `recursive`. */
  list(
    path?: string,
    opts?: { recursive?: boolean }
  ): Promise<WorkspaceEntry[]>;
  /** Delete one file. Returns false when it was not there. */
  delete(path: string): Promise<boolean>;
  /** Delete a directory and everything under it. Returns how many files went. */
  deleteAll(path: string): Promise<number>;
  /** No-op on an object store; creates the directory on a local one. */
  mkdir(path: string): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  move(from: string, to: string): Promise<void>;

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
}

/** Thrown when a path would resolve outside the workspace root. */
export class WorkspacePathError extends Error {
  constructor(path: string) {
    super(`Path '${path}' is outside the workspace`);
    this.name = "WorkspacePathError";
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
