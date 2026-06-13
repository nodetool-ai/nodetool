import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { root as fsSafeRoot, type Root } from "@openclaw/fs-safe";
import path from "node:path";

function workspaceDirFrom(props: Record<string, unknown>): string {
  return String(props.workspace_dir ?? process.cwd());
}

/**
 * Capability-style workspace handle backed by `@openclaw/fs-safe`.
 *
 * Cached per workspace directory so repeated I/O on a single workflow run
 * doesn't re-stat the root. Symlinks and hardlinks pointing outside the
 * workspace are rejected at I/O time, not just at path-resolution time.
 */
const workspaceRoots = new Map<string, Promise<Root>>();
export function workspaceRoot(workspaceDir: string): Promise<Root> {
  const key = path.resolve(workspaceDir);
  let pending = workspaceRoots.get(key);
  if (!pending) {
    pending = fsSafeRoot(key, {
      hardlinks: "reject",
      symlinks: "reject",
      mkdir: true
    });
    pending.catch(() => workspaceRoots.delete(key));
    workspaceRoots.set(key, pending);
  }
  return pending;
}

/**
 * Pure path-string pre-validation used by node-graph workspace nodes.
 *
 * Rejects absolute paths and `..` segments before they ever reach the
 * filesystem. Pair with `workspaceRoot()` for the I/O leg.
 */
export function ensureWorkspacePath(
  workspaceDir: string,
  relativePath: string
): string {
  if (!relativePath) {
    throw new Error("Path cannot be empty");
  }
  if (path.isAbsolute(relativePath)) {
    throw new Error(
      "Absolute paths are not allowed. Use relative paths within workspace."
    );
  }
  if (relativePath.split(/[\\/]/).includes("..")) {
    throw new Error("Parent directory traversal (..) is not allowed");
  }
  const full = path.resolve(workspaceDir, relativePath);
  const root = path.resolve(workspaceDir);
  if (full !== root && !full.startsWith(root + path.sep)) {
    throw new Error("Path must be within workspace directory");
  }
  return full;
}

export class ReadTextFileNode extends BaseNode {
  static readonly nodeType = "nodetool.workspace.ReadTextFile";
  static readonly title = "Read Text File";
  static readonly description =
    "Read a text file from the workspace.\n    workspace, file, read, text";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Relative path to file within workspace"
  })
  declare path: any;

  @prop({
    type: "str",
    default: "utf-8",
    title: "Encoding",
    description: "Text encoding (utf-8, ascii, etc.)"
  })
  declare encoding: any;

  async process(): Promise<Record<string, unknown>> {
    const workspace = workspaceDirFrom(this.serialize());
    const relative = String(this.path ?? "");
    const encoding = String(
      this.encoding ?? "utf-8"
    ) as BufferEncoding;
    ensureWorkspacePath(workspace, relative);
    const r = await workspaceRoot(workspace);
    const text = await r.readText(relative, { encoding });
    return { output: text };
  }
}

export class WriteTextFileNode extends BaseNode {
  static readonly nodeType = "nodetool.workspace.WriteTextFile";
  static readonly title = "Write Text File";
  static readonly description =
    "Write text to a file in the workspace.\n    workspace, file, write, text, save";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Relative path to file within workspace"
  })
  declare path: any;

  @prop({
    type: "str",
    default: "",
    title: "Content",
    description: "Text content to write"
  })
  declare content: any;

  @prop({
    type: "str",
    default: "utf-8",
    title: "Encoding",
    description: "Text encoding (utf-8, ascii, etc.)"
  })
  declare encoding: any;

  @prop({
    type: "bool",
    default: false,
    title: "Append",
    description: "Append to file instead of overwriting"
  })
  declare append: any;

  async process(): Promise<Record<string, unknown>> {
    const workspace = workspaceDirFrom(this.serialize());
    const relative = String(this.path ?? "");
    const content = String(this.content ?? "");
    const append = Boolean(this.append ?? false);
    const encoding = String(
      this.encoding ?? "utf-8"
    ) as BufferEncoding;
    ensureWorkspacePath(workspace, relative);
    const r = await workspaceRoot(workspace);
    if (append) {
      await r.append(relative, Buffer.from(content, encoding), { mkdir: true });
    } else {
      await r.write(relative, Buffer.from(content, encoding), {
        mkdir: true,
        overwrite: true
      });
    }
    return { output: relative };
  }
}

export class ReadBinaryFileNode extends BaseNode {
  static readonly nodeType = "nodetool.workspace.ReadBinaryFile";
  static readonly title = "Read Binary File";
  static readonly description =
    "Read a binary file from the workspace as base64-encoded string.\n    workspace, file, read, binary";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Relative path to file within workspace"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const workspace = workspaceDirFrom(this.serialize());
    const relative = String(this.path ?? "");
    ensureWorkspacePath(workspace, relative);
    const r = await workspaceRoot(workspace);
    const data = await r.readBytes(relative);
    return { output: Buffer.from(data).toString("base64") };
  }
}

export class WriteBinaryFileNode extends BaseNode {
  static readonly nodeType = "nodetool.workspace.WriteBinaryFile";
  static readonly title = "Write Binary File";
  static readonly description =
    "Write binary data (base64-encoded) to a file in the workspace.\n    workspace, file, write, binary, save";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Relative path to file within workspace"
  })
  declare path: any;

  @prop({
    type: "str",
    default: "",
    title: "Content",
    description: "Base64-encoded binary content to write"
  })
  declare content: any;

  async process(): Promise<Record<string, unknown>> {
    const workspace = workspaceDirFrom(this.serialize());
    const relative = String(this.path ?? "");
    const content = String(this.content ?? "");
    ensureWorkspacePath(workspace, relative);
    const r = await workspaceRoot(workspace);
    await r.write(relative, Buffer.from(content, "base64"), {
      mkdir: true,
      overwrite: true
    });
    return { output: relative };
  }
}

export const WORKSPACE_NODES = [
  ReadTextFileNode,
  WriteTextFileNode,
  ReadBinaryFileNode,
  WriteBinaryFileNode
] as const;
