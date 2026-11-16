// The run's workspace (context.workspace) on the `files` host capability:
// the Workspace interface of @nodetool-ai/runtime-core, implemented as
// StorageWorkspace over a FileStorageAdapter implements it for a local
// folder. Paths are workspace-relative (`notes.md`, `/workspace/notes.md`
// and `workspace/notes.md` are one file), and the host refuses any real
// location outside the workspace, so a symlink cannot lead out of it.
// The workspace can be a project folder, whose `.nodetool/` holds NodeTool's
// own files: a path with a segment of that name, in any case, is refused
// here with a readable error, and by the host (src/host/paths.cpp) for every
// other caller. Listings leave it out. As isReservedWorkspaceKey in
// packages/runtime-core/src/workspace.ts.
import * as fs from "./fs.mjs";
import { pathToFileURL } from "./url.mjs";

class WorkspacePathError extends Error {
  constructor(path) {
    super(`Path '${path}' is outside the workspace`);
    this.name = "WorkspacePathError";
  }
}

class WorkspaceReservedPathError extends Error {
  constructor(path) {
    super(`Path '${path}' is inside .nodetool/, which NodeTool reserves for its own files. Choose another folder.`);
    this.name = "WorkspaceReservedPathError";
  }
}

const isReservedName = (name) => name.toLowerCase() === ".nodetool";
const isReservedKey = (key) => key.split("/").some(isReservedName);

function stripWorkspacePrefix(path) {
  let p = path.replaceAll("\\", "/").trim();
  if (p.startsWith("/workspace/")) return p.slice("/workspace/".length);
  if (p === "/workspace" || p === "workspace") return "";
  if (p.startsWith("workspace/")) return p.slice("workspace/".length);
  p = p.replace(/^[A-Za-z]:\//, "");
  return p.startsWith("/") ? p.slice(1) : p;
}

function normalize(path) {
  const segments = [];
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

const missing = (err) => err && (err.code === "ENOENT" || err.code === "ENOTDIR");
const encoder = new TextEncoder();
const decoder = new TextDecoder();

export class LocalWorkspace {
  constructor(dir) {
    this.localDir = dir;
  }

  key(path) {
    const key = this.dirKey(path);
    if (!key) throw new WorkspacePathError(path);
    return key;
  }

  /** As key(), where the workspace itself ("") is allowed. */
  dirKey(path) {
    const local=String(path).replaceAll("\\", "/");
    const key = normalize(local.startsWith(`${this.localDir}/`) ? local.slice(this.localDir.length+1) : local);
    if (isReservedKey(key)) throw new WorkspaceReservedPathError(path);
    return key;
  }

  /**
   * Files (and, unless recursive, directories) below the directory key `key`,
   * pushed to `walk.entries`. Never descends into a reserved directory:
   * `walk.reserved` says one was passed, `walk.dirs` lists the directories
   * descended into, parents first.
   */
  collect(key, rel, recursive, walk) {
    const base = key ? `${this.localDir}/${key}` : this.localDir;
    const dir = rel ? `${base}/${rel}` : base;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (isReservedName(entry.name)) {
        walk.reserved = true;
        continue;
      }
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      const full = key ? `${key}/${childRel}` : childRel;
      if (entry.isDirectory()) {
        if (!recursive) {
          walk.entries.push({ path: full, name: entry.name, size: 0, modifiedAt: 0, isDirectory: true });
        } else {
          walk.dirs.push(childRel);
          this.collect(key, childRel, true, walk);
        }
      } else if (entry.isFile()) {
        const st = fs.statSync(`${base}/${childRel}`);
        walk.entries.push({ path: full, name: entry.name, size: st.size, modifiedAt: st.mtimeMs, isDirectory: false });
      }
    }
  }

  /** Absolute path of a workspace key. The host still checks it. */
  file(path) {
    return `${this.localDir}/${this.key(path)}`;
  }

  uri(path) {
    return pathToFileURL(this.file(path)).href;
  }

  async read(path) {
    try {
      // On the I/O lane during a run.
      const bytes = await fs.promises.readFile(this.file(path));
      return bytes.constructor === Uint8Array ? bytes : new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    } catch (err) {
      if (missing(err)) return null;
      throw err;
    }
  }

  async readText(path) {
    const bytes = await this.read(path);
    return bytes === null ? null : decoder.decode(bytes);
  }

  async write(path, data) {
    const file = this.file(path);
    const slash = file.lastIndexOf("/");
    if (slash > this.localDir.length) await fs.promises.mkdir(file.slice(0, slash), { recursive: true });
    await fs.promises.writeFile(file, typeof data === "string" ? encoder.encode(data) : data);
  }

  async exists(path) {
    try {
      return fs.statSync(this.file(path)).isFile();
    } catch {
      return false;
    }
  }

  async stat(path) {
    const key = this.key(path);
    try {
      const st = fs.statSync(this.file(key));
      return st.isDirectory()
        ? { path: key, size: 0, modifiedAt: st.mtimeMs, isDirectory: true }
        : { path: key, size: st.size, modifiedAt: st.mtimeMs, isDirectory: false };
    } catch (err) {
      if (missing(err)) return null;
      throw err;
    }
  }

  async list(path = "", opts = {}) {
    const key = this.dirKey(path);
    // A recursive listing names files only, as a storage listing does.
    const walk = { entries: [], dirs: [], reserved: false };
    try {
      this.collect(key, "", opts.recursive === true, walk);
    } catch (err) {
      if (missing(err)) return [];
      throw err;
    }
    return walk.entries.sort((a, b) => a.path.localeCompare(b.path));
  }

  async delete(path) {
    try {
      fs.unlinkSync(this.file(path));
      return true;
    } catch (err) {
      if (missing(err)) return false;
      throw err;
    }
  }

  async deleteAll(path) {
    const key = this.dirKey(path);
    const walk = { entries: [], dirs: [], reserved: false };
    try {
      this.collect(key, "", true, walk);
    } catch (err) {
      if (!missing(err)) throw err;
    }
    let deleted = 0;
    for (const f of walk.entries) {
      if (await this.delete(f.path)) deleted++;
    }
    if (!key) return deleted;
    const base = `${this.localDir}/${key}`;
    if (!walk.reserved) {
      fs.rmSync(base, { recursive: true, force: true });
      return deleted;
    }
    // A reserved directory below stays, with the directories that lead to it.
    for (const rel of walk.dirs.reverse()) {
      try {
        fs.rmdirSync(`${base}/${rel}`);
      } catch {
        // Not empty: it leads to the reserved directory.
      }
    }
    return deleted;
  }

  async mkdir(path) {
    const key = this.dirKey(path);
    if (key) fs.mkdirSync(`${this.localDir}/${key}`, { recursive: true });
  }

  async copy(from, to) {
    const bytes = await this.read(from);
    if (bytes === null) throw new Error(`Cannot copy '${from}': it does not exist`);
    await this.write(to, bytes);
  }

  async move(from, to) {
    await this.copy(from, to);
    await this.delete(from);
  }

  async materialize(path) {
    return this.file(path);
  }

  async absorb(localPath, path) {
    if (localPath === this.file(path)) return;
    await this.write(path, await fs.promises.readFile(localPath));
  }

  async scratchDir() {
    return this.localDir;
  }

  async cleanupScratch() {}

  // The folder of another project is known by its `.nodetool/` directory, as
  // in the TypeScript local workspace. The runner keeps no project folders of
  // its own, so this reads the mark on disk and nothing else.
  async isNestedFolder(path) {
    let key;
    try {
      key = normalize(path);
    } catch {
      return false;
    }
    if (!key) return false;
    try {
      return fs.statSync(`${this.localDir}/${key}/.nodetool`).isDirectory();
    } catch (err) {
      if (missing(err)) return false;
      throw err;
    }
  }
}

/** The workspace the embedder granted (HostOptions::workspaceDir), or null. */
export function hostWorkspace() {
  const dir = globalThis.__host?.files?.cwd?.();
  return dir ? new LocalWorkspace(dir) : null;
}
