/**
 * The one {@link Workspace} implementation, over any {@link StorageAdapter}.
 *
 * There is deliberately no second implementation for local folders: a local
 * workspace is this class over a `FileStorageAdapter`, which is what keeps the
 * two deployments on the same code path instead of on two that drift.
 */

import { getNodeBuiltinSync } from "@nodetool-ai/config";

import {
  FileStorageAdapter,
  setWorkspaceFactory,
  type StorageAdapter
} from "./context.js";
import { PrefixedStorageAdapter } from "./prefixed-storage-adapter.js";
import {
  WorkspacePathError,
  type Workspace,
  type WorkspaceEntry,
  type WorkspaceStat
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
  const segments: string[] = [];
  for (const segment of stripWorkspacePrefix(path).split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (segments.length === 0) throw new WorkspacePathError(path);
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
 * Detected by shape rather than by `instanceof`: two `FileStorageAdapter`
 * classes exist — this package's and `@nodetool-ai/storage`'s fs-safe one —
 * and hosts pass either. An `instanceof` check against one of them silently
 * reports a local workspace as virtual, which would send every local run
 * through the staging path.
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
  const within = (real: string): boolean => {
    const rel = path.relative(root, real);
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
      const next = path.dirname(parent);
      if (next === parent) return false;
      parent = next;
    }
  }
}

const textDecoder = new TextDecoder();
const textEncoder = new TextEncoder();

export class StorageWorkspace implements Workspace {
  readonly storage: StorageAdapter;
  readonly localDir: string | null;
  private scratch: string | null = null;

  constructor(storage: StorageAdapter, opts: { localDir?: string | null } = {}) {
    this.storage = storage;
    this.localDir = opts.localDir ?? localRootOf(storage);
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
    return key;
  }

  /**
   * Refuse a path whose real location leaves the workspace.
   *
   * Called on every operation that touches a local workspace. `key()` already
   * refuses a `..` that climbs out lexically; this is the half a symlink
   * defeats.
   */
  private async assertContained(path: string): Promise<void> {
    if (!this.localDir) return;
    // The root may not exist yet (a workspace folder created on first use).
    // Without this the walk below climbs past it to an ancestor that does
    // exist, finds that outside the root, and refuses every path in a
    // perfectly good workspace.
    await this.ensureRoot();
    const target = resolvePath(this.localDir, this.key(path));
    if (!(await realPathWithinRoot(this.localDir, target))) {
      throw new WorkspacePathError(path);
    }
  }

  uri(path: string): string {
    return this.storage.uriForKey(this.key(path));
  }

  async read(path: string): Promise<Uint8Array | null> {
    await this.assertContained(path);
    const bytes = await this.storage.retrieve(this.uri(path));
    // The file backend answers with a Buffer, the object stores with a plain
    // Uint8Array. A caller comparing or structured-cloning the result must not
    // be able to tell which backend it got, so narrow to the common type.
    if (bytes === null) return null;
    return bytes instanceof Uint8Array && bytes.constructor === Uint8Array
      ? bytes
      : new Uint8Array(bytes);
  }

  async readText(path: string): Promise<string | null> {
    const bytes = await this.read(path);
    return bytes === null ? null : textDecoder.decode(bytes);
  }

  async write(
    path: string,
    data: Uint8Array | string,
    contentType?: string
  ): Promise<void> {
    await this.assertContained(path);
    const bytes = typeof data === "string" ? textEncoder.encode(data) : data;
    await this.storage.store(this.key(path), bytes, contentType);
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.assertContained(path);
    } catch {
      return false;
    }
    return this.storage.exists(this.uri(path));
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

  async list(
    path = "",
    opts: { recursive?: boolean } = {}
  ): Promise<WorkspaceEntry[]> {
    const key = normalize(path);
    if (key) await this.assertContained(key);
    const prefix = key ? `${key}/` : "";
    const listing = await this.storage.list(
      prefix,
      opts.recursive === true ? {} : { delimiter: "/" }
    );
    const files: WorkspaceEntry[] = listing.entries.map((entry) => ({
      path: entry.key,
      name: entry.key.slice(entry.key.lastIndexOf("/") + 1),
      size: entry.size,
      modifiedAt: entry.modifiedAt,
      isDirectory: false
    }));
    const dirs: WorkspaceEntry[] = listing.commonPrefixes.map((p) => {
      const trimmed = p.endsWith("/") ? p.slice(0, -1) : p;
      return {
        path: trimmed,
        name: trimmed.slice(trimmed.lastIndexOf("/") + 1),
        size: 0,
        modifiedAt: 0,
        isDirectory: true
      };
    });
    return [...dirs, ...files].sort((a, b) => a.path.localeCompare(b.path));
  }

  async delete(path: string): Promise<boolean> {
    await this.assertContained(path);
    return this.storage.delete(this.uri(path));
  }

  async deleteAll(path: string): Promise<number> {
    const key = normalize(path);
    const listing = await this.storage.list(key ? `${key}/` : "");
    let deleted = 0;
    for (const entry of listing.entries) {
      if (await this.storage.delete(entry.uri)) deleted++;
    }
    // On an object store the prefix is gone once its keys are. A real
    // directory would linger and keep showing up in `list`, so remove it —
    // otherwise the same call leaves two different workspaces behind.
    if (this.localDir && key) {
      await requireNode().fs.rm(resolvePath(this.localDir, key), {
        recursive: true,
        force: true
      });
    }
    return deleted;
  }

  async mkdir(path: string): Promise<void> {
    // An object store has no directories — a key's prefix is its directory, so
    // there is nothing to create and nothing to fail. A local workspace makes
    // the real directory so an empty one survives and a host binary can cd
    // into it.
    if (this.localDir) {
      const key = normalize(path);
      if (key) await requireNode().fs.mkdir(resolvePath(this.localDir, key), {
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

  async move(from: string, to: string): Promise<void> {
    await this.copy(from, to);
    await this.delete(from);
  }

  async materialize(path: string): Promise<string> {
    await this.assertContained(path);
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

  async absorb(localPath: string, path: string): Promise<void> {
    const node = requireNode();
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
    this.scratch ??= await node.fs.mkdtemp(
      node.path.join(node.os.tmpdir(), "nodetool-ws-")
    );
    return this.scratch;
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
  opts: { prefix?: string | null } = {}
): Workspace {
  if (!opts.prefix) return new StorageWorkspace(storage);
  return new StorageWorkspace(new PrefixedStorageAdapter(storage, opts.prefix), {
    // A prefixed view of a local folder still has a real directory: the
    // subfolder the prefix names.
    localDir: (() => {
      const root = localRootOf(storage);
      return root ? resolvePath(root, opts.prefix) : null;
    })()
  });
}

/** A workspace over a real directory. */
export function createLocalWorkspace(dir: string): Workspace {
  return new StorageWorkspace(new FileStorageAdapter(dir));
}

/**
 * Teach {@link ProcessingContext} how to build a workspace from the older
 * `workspaceDir` / `workspaceStorage` options.
 *
 * The context cannot import this module — it must stay loadable off Node —
 * so the direction is inverted: importing this file (which every host does,
 * via the package index) installs the factory.
 */
setWorkspaceFactory((opts) => {
  if (opts.workspace) return opts.workspace;
  if (opts.workspaceStorage) return new StorageWorkspace(opts.workspaceStorage);
  if (opts.workspaceDir) return createLocalWorkspace(opts.workspaceDir);
  return null;
});
