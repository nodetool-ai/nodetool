// The run's workspace (context.workspace) on the `files` host capability:
// the Workspace interface of @nodetool-ai/runtime-core, implemented as
// StorageWorkspace over a FileStorageAdapter implements it for a local
// folder. Paths are workspace-relative (`notes.md`, `/workspace/notes.md`
// and `workspace/notes.md` are one file), and the host refuses any real
// location outside the workspace, so a symlink cannot lead out of it.
import * as fs from "./fs.mjs";
import { pathToFileURL } from "./url.mjs";

class WorkspacePathError extends Error {
  constructor(path) {
    super(`Path '${path}' is outside the workspace`);
    this.name = "WorkspacePathError";
  }
}

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
    const local=String(path).replaceAll("\\", "/");
    const key = normalize(local.startsWith(`${this.localDir}/`) ? local.slice(this.localDir.length+1) : local);
    if (!key) throw new WorkspacePathError(path);
    return key;
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
    const key = normalize(path);
    const base = key ? `${this.localDir}/${key}` : this.localDir;
    let entries;
    try {
      entries = fs.readdirSync(base, { withFileTypes: true, recursive: opts.recursive === true });
    } catch (err) {
      if (missing(err)) return [];
      throw err;
    }
    const out = [];
    for (const entry of entries) {
      const rel = `${entry.parentPath === base ? "" : `${entry.parentPath.slice(base.length + 1)}/`}${entry.name}`;
      const full = key ? `${key}/${rel}` : rel;
      if (entry.isDirectory()) {
        // A recursive listing names files only, as a storage listing does.
        if (opts.recursive !== true) out.push({ path: full, name: entry.name, size: 0, modifiedAt: 0, isDirectory: true });
      } else if (entry.isFile()) {
        const st = fs.statSync(`${base}/${rel}`);
        out.push({ path: full, name: entry.name, size: st.size, modifiedAt: st.mtimeMs, isDirectory: false });
      }
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
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
    const key = normalize(path);
    const files = await this.list(key, { recursive: true });
    let deleted = 0;
    for (const f of files) {
      if (await this.delete(f.path)) deleted++;
    }
    if (key) fs.rmSync(`${this.localDir}/${key}`, { recursive: true, force: true });
    return deleted;
  }

  async mkdir(path) {
    const key = normalize(path);
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
}

/** The workspace the embedder granted (HostOptions::workspaceDir), or null. */
export function hostWorkspace() {
  const dir = globalThis.__host?.files?.cwd?.();
  return dir ? new LocalWorkspace(dir) : null;
}
