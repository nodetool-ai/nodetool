import { BaseNode, prop } from "@nodetool/node-sdk";
import { promises as fs } from "node:fs";
import path from "node:path";

function workspaceDirFrom(props: Record<string, unknown>): string {
  return String(props.workspace_dir ?? process.cwd());
}

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
  if (relativePath.split(path.sep).includes("..")) {
    throw new Error("Parent directory traversal (..) is not allowed");
  }
  const full = path.resolve(workspaceDir, relativePath);
  const root = path.resolve(workspaceDir);
  if (!full.startsWith(root)) {
    throw new Error("Path must be within workspace directory");
  }
  return full;
}

function formatTimestampedName(name: string): string {
  const now = new Date();
  const pad = (v: number): string => String(v).padStart(2, "0");
  return name
    .replaceAll("%Y", String(now.getFullYear()))
    .replaceAll("%m", pad(now.getMonth() + 1))
    .replaceAll("%d", pad(now.getDate()))
    .replaceAll("%H", pad(now.getHours()))
    .replaceAll("%M", pad(now.getMinutes()))
    .replaceAll("%S", pad(now.getSeconds()));
}

function wildcardToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`^${escaped.replaceAll("*", ".*")}$`);
}

async function walk(dir: string, recursive: boolean): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    out.push(full);
    if (recursive && entry.isDirectory()) {
      out.push(...(await walk(full, true)));
    }
  }
  return out;
}

function fileUri(fullPath: string): string {
  return `file://${fullPath}`;
}

function bytesFromUnknown(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Array.isArray(value) && value.every((x) => Number.isInteger(x))) {
    return new Uint8Array(value as number[]);
  }
  if (typeof value === "string") {
    return Uint8Array.from(Buffer.from(value, "base64"));
  }
  return new Uint8Array();
}

export class GetWorkspaceDirNode extends BaseNode {
  static readonly nodeType = "nodetool.workspace.GetWorkspaceDir";
  static readonly title = "Get Workspace Dir";
  static readonly description =
    "Get the current workspace directory path.\n    workspace, directory, path";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "Workspace Dir",
    description: "The workspace directory"
  })
  declare workspace_dir: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: workspaceDirFrom(this.serialize()) };
  }
}

export class ListWorkspaceFilesNode extends BaseNode {
  static readonly nodeType = "nodetool.workspace.ListWorkspaceFiles";
  static readonly title = "List Workspace Files";
  static readonly description =
    "List files in the workspace directory matching a pattern.\n    workspace, files, list, directory";
  static readonly metadataOutputTypes = {
    file: "str"
  };

  static readonly isStreamingOutput = true;
  @prop({
    type: "str",
    default: ".",
    title: "Path",
    description: "Relative path within workspace (use . for workspace root)"
  })
  declare path: any;

  @prop({
    type: "str",
    default: "*",
    title: "Pattern",
    description: "File pattern to match (e.g. *.txt, *.json)"
  })
  declare pattern: any;

  @prop({
    type: "bool",
    default: false,
    title: "Recursive",
    description: "Search subdirectories recursively"
  })
  declare recursive: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const workspace = workspaceDirFrom(this.serialize());
    const relative = String(this.path ?? this.path ?? ".");
    const pattern = String(this.pattern ?? this.pattern ?? "*");
    const recursive = Boolean(this.recursive ?? this.recursive ?? false);
    const root = ensureWorkspacePath(workspace, relative);
    const regex = wildcardToRegExp(pattern);
    const all = await walk(root, recursive);
    for (const item of all) {
      if (regex.test(path.basename(item))) {
        yield { file: path.relative(workspace, item) };
      }
    }
  }
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
    const relative = String(this.path ?? this.path ?? "");
    const encoding = String(
      this.encoding ?? this.encoding ?? "utf-8"
    ) as BufferEncoding;
    const full = ensureWorkspacePath(workspace, relative);
    const text = await fs.readFile(full, { encoding });
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
    const relative = String(this.path ?? this.path ?? "");
    const content = String(this.content ?? this.content ?? "");
    const append = Boolean(this.append ?? this.append ?? false);
    const encoding = String(
      this.encoding ?? this.encoding ?? "utf-8"
    ) as BufferEncoding;
    const full = ensureWorkspacePath(workspace, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    if (append) {
      await fs.appendFile(full, content, { encoding });
    } else {
      await fs.writeFile(full, content, { encoding });
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
    const relative = String(this.path ?? this.path ?? "");
    const full = ensureWorkspacePath(workspace, relative);
    const data = await fs.readFile(full);
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
    const relative = String(this.path ?? this.path ?? "");
    const content = String(this.content ?? this.content ?? "");
    const full = ensureWorkspacePath(workspace, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, Buffer.from(content, "base64"));
    return { output: relative };
  }
}

export class DeleteWorkspaceFileNode extends BaseNode {
  static readonly nodeType = "nodetool.workspace.DeleteWorkspaceFile";
  static readonly title = "Delete Workspace File";
  static readonly description =
    "Delete a file or directory from the workspace.\n    workspace, file, delete, remove";
  static readonly metadataOutputTypes = {
    output: "none"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Relative path to file or directory within workspace"
  })
  declare path: any;

  @prop({
    type: "bool",
    default: false,
    title: "Recursive",
    description: "Delete directories recursively"
  })
  declare recursive: any;

  async process(): Promise<Record<string, unknown>> {
    const workspace = workspaceDirFrom(this.serialize());
    const relative = String(this.path ?? this.path ?? "");
    const recursive = Boolean(this.recursive ?? this.recursive ?? false);
    const full = ensureWorkspacePath(workspace, relative);
    const stat = await fs.stat(full);
    if (stat.isDirectory()) {
      if (!recursive) {
        throw new Error("Path is a directory. Set recursive=true to delete.");
      }
      await fs.rm(full, { recursive: true, force: false });
    } else {
      await fs.unlink(full);
    }
    return { output: null };
  }
}

export class CreateWorkspaceDirectoryNode extends BaseNode {
  static readonly nodeType = "nodetool.workspace.CreateWorkspaceDirectory";
  static readonly title = "Create Workspace Directory";
  static readonly description =
    "Create a directory in the workspace.\n    workspace, directory, create, folder";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Relative path to directory within workspace"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const workspace = workspaceDirFrom(this.serialize());
    const relative = String(this.path ?? this.path ?? "");
    const full = ensureWorkspacePath(workspace, relative);
    await fs.mkdir(full, { recursive: true });
    return { output: relative };
  }
}

export class WorkspaceFileExistsNode extends BaseNode {
  static readonly nodeType = "nodetool.workspace.WorkspaceFileExists";
  static readonly title = "Workspace File Exists";
  static readonly description =
    "Check if a file or directory exists in the workspace.\n    workspace, file, exists, check";
  static readonly metadataOutputTypes = {
    output: "bool"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Relative path within workspace to check"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const workspace = workspaceDirFrom(this.serialize());
    const relative = String(this.path ?? this.path ?? "");
    const full = ensureWorkspacePath(workspace, relative);
    try {
      await fs.access(full);
      return { output: true };
    } catch {
      return { output: false };
    }
  }
}

export class GetWorkspaceFileInfoNode extends BaseNode {
  static readonly nodeType = "nodetool.workspace.GetWorkspaceFileInfo";
  static readonly title = "Get Workspace File Info";
  static readonly description =
    "Get information about a file in the workspace.\n    workspace, file, info, metadata";
  static readonly metadataOutputTypes = {
    output: "dict"
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
    const relative = String(this.path ?? this.path ?? "");
    const full = ensureWorkspacePath(workspace, relative);
    const stats = await fs.stat(full);
    return {
      output: {
        path: relative,
        name: path.basename(relative),
        size: stats.size,
        is_file: stats.isFile(),
        is_directory: stats.isDirectory(),
        created: new Date(stats.birthtimeMs).toISOString(),
        modified: new Date(stats.mtimeMs).toISOString(),
        accessed: new Date(stats.atimeMs).toISOString()
      }
    };
  }
}

export class CopyWorkspaceFileNode extends BaseNode {
  static readonly nodeType = "nodetool.workspace.CopyWorkspaceFile";
  static readonly title = "Copy Workspace File";
  static readonly description =
    "Copy a file within the workspace.\n    workspace, file, copy, duplicate";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "Source",
    description: "Relative source path within workspace"
  })
  declare source: any;

  @prop({
    type: "str",
    default: "",
    title: "Destination",
    description: "Relative destination path within workspace"
  })
  declare destination: any;

  async process(): Promise<Record<string, unknown>> {
    const workspace = workspaceDirFrom(this.serialize());
    const source = ensureWorkspacePath(
      workspace,
      String(this.source ?? this.source ?? "")
    );
    const destRelative = String(this.destination ?? this.destination ?? "");
    const destination = ensureWorkspacePath(workspace, destRelative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.cp(source, destination, { recursive: true });
    return { output: destRelative };
  }
}

export class MoveWorkspaceFileNode extends BaseNode {
  static readonly nodeType = "nodetool.workspace.MoveWorkspaceFile";
  static readonly title = "Move Workspace File";
  static readonly description =
    "Move or rename a file within the workspace.\n    workspace, file, move, rename";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "Source",
    description: "Relative source path within workspace"
  })
  declare source: any;

  @prop({
    type: "str",
    default: "",
    title: "Destination",
    description: "Relative destination path within workspace"
  })
  declare destination: any;

  async process(): Promise<Record<string, unknown>> {
    const workspace = workspaceDirFrom(this.serialize());
    const source = ensureWorkspacePath(
      workspace,
      String(this.source ?? this.source ?? "")
    );
    const destRelative = String(this.destination ?? this.destination ?? "");
    const destination = ensureWorkspacePath(workspace, destRelative);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rename(source, destination);
    return { output: destRelative };
  }
}

export class GetWorkspaceFileSizeNode extends BaseNode {
  static readonly nodeType = "nodetool.workspace.GetWorkspaceFileSize";
  static readonly title = "Get Workspace File Size";
  static readonly description =
    "Get file size in bytes for a workspace file.\n    workspace, file, size, bytes";
  static readonly metadataOutputTypes = {
    output: "int"
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
    const relative = String(this.path ?? this.path ?? "");
    const full = ensureWorkspacePath(workspace, relative);
    const stats = await fs.stat(full);
    if (!stats.isFile()) {
      throw new Error(`Path is not a file: ${relative}`);
    }
    return { output: stats.size };
  }
}

export class IsWorkspaceFileNode extends BaseNode {
  static readonly nodeType = "nodetool.workspace.IsWorkspaceFile";
  static readonly title = "Is Workspace File";
  static readonly description =
    "Check if a path in the workspace is a file.\n    workspace, file, check, type";
  static readonly metadataOutputTypes = {
    output: "bool"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Relative path within workspace to check"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const workspace = workspaceDirFrom(this.serialize());
    const relative = String(this.path ?? this.path ?? "");
    const full = ensureWorkspacePath(workspace, relative);
    try {
      const stats = await fs.stat(full);
      return { output: stats.isFile() };
    } catch {
      return { output: false };
    }
  }
}

export class IsWorkspaceDirectoryNode extends BaseNode {
  static readonly nodeType = "nodetool.workspace.IsWorkspaceDirectory";
  static readonly title = "Is Workspace Directory";
  static readonly description =
    "Check if a path in the workspace is a directory.\n    workspace, directory, check, type";
  static readonly metadataOutputTypes = {
    output: "bool"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Relative path within workspace to check"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const workspace = workspaceDirFrom(this.serialize());
    const relative = String(this.path ?? this.path ?? "");
    const full = ensureWorkspacePath(workspace, relative);
    try {
      const stats = await fs.stat(full);
      return { output: stats.isDirectory() };
    } catch {
      return { output: false };
    }
  }
}

export class JoinWorkspacePathsNode extends BaseNode {
  static readonly nodeType = "nodetool.workspace.JoinWorkspacePaths";
  static readonly title = "Join Workspace Paths";
  static readonly description =
    "Join path components relative to workspace.\n    workspace, path, join, combine";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "list[str]",
    default: [],
    title: "Paths",
    description: "Path components to join (relative to workspace)"
  })
  declare paths: any;

  async process(): Promise<Record<string, unknown>> {
    const workspace = workspaceDirFrom(this.serialize());
    const parts = Array.isArray(this.paths ?? this.paths)
      ? ((this.paths ?? this.paths) as unknown[])
      : [];
    if (parts.length === 0) {
      throw new Error("paths cannot be empty");
    }
    const joined = path.join(...parts.map((p) => String(p)));
    ensureWorkspacePath(workspace, joined);
    return { output: joined };
  }
}

export class SaveImageFileNode extends BaseNode {
  static readonly nodeType = "nodetool.workspace.SaveImageFile";
  static readonly title = "Save Image File";
  static readonly description =
    "Save an image to a file in the workspace.\n    workspace, image, save, file, output";
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The image to save"
  })
  declare image: any;

  @prop({
    type: "str",
    default: ".",
    title: "Folder",
    description:
      "Relative folder path within workspace (use . for workspace root)"
  })
  declare folder: any;

  @prop({
    type: "str",
    default: "image.png",
    title: "Filename",
    description:
      "\n        The name of the image file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare filename: any;

  @prop({
    type: "bool",
    default: false,
    title: "Overwrite",
    description:
      "Overwrite the file if it already exists, otherwise file will be renamed"
  })
  declare overwrite: any;

  async process(): Promise<Record<string, unknown>> {
    const workspace = workspaceDirFrom(this.serialize());
    const image = (this.image ?? this.image ?? {}) as Record<string, unknown>;
    const folder = String(this.folder ?? this.folder ?? ".");
    const filename = formatTimestampedName(
      String(this.filename ?? this.filename ?? "image.png")
    );
    const overwrite = Boolean(this.overwrite ?? this.overwrite ?? false);

    let relative = path.join(folder, filename);
    let full = ensureWorkspacePath(workspace, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });

    if (!overwrite) {
      let count = 1;
      while (true) {
        try {
          await fs.access(full);
          const ext = path.extname(filename);
          const base = filename.slice(
            0,
            Math.max(0, filename.length - ext.length)
          );
          const next = `${base}_${count}${ext}`;
          relative = path.join(folder, next);
          full = ensureWorkspacePath(workspace, relative);
          count += 1;
        } catch {
          break;
        }
      }
    }

    const bytes = bytesFromUnknown(image.data);
    await fs.writeFile(full, bytes);
    return {
      output: {
        uri: fileUri(full),
        data: Buffer.from(bytes).toString("base64")
      }
    };
  }
}

export class SaveVideoFileNode extends BaseNode {
  static readonly nodeType = "nodetool.workspace.SaveVideoFile";
  static readonly title = "Save Video File";
  static readonly description =
    "Save a video file to the workspace.\n    workspace, video, save, file, output\n\n    The filename can include time and date variables:\n    %Y - Year, %m - Month, %d - Day\n    %H - Hour, %M - Minute, %S - Second";
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The video to save"
  })
  declare video: any;

  @prop({
    type: "str",
    default: ".",
    title: "Folder",
    description:
      "Relative folder path within workspace (use . for workspace root)"
  })
  declare folder: any;

  @prop({
    type: "str",
    default: "video.mp4",
    title: "Filename",
    description:
      "\n        Name of the file to save.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare filename: any;

  @prop({
    type: "bool",
    default: false,
    title: "Overwrite",
    description:
      "Overwrite the file if it already exists, otherwise file will be renamed"
  })
  declare overwrite: any;

  async process(): Promise<Record<string, unknown>> {
    const workspace = workspaceDirFrom(this.serialize());
    const video = (this.video ?? this.video ?? {}) as Record<string, unknown>;
    const folder = String(this.folder ?? this.folder ?? ".");
    const filename = formatTimestampedName(
      String(this.filename ?? this.filename ?? "video.mp4")
    );
    const overwrite = Boolean(this.overwrite ?? this.overwrite ?? false);

    let relative = path.join(folder, filename);
    let full = ensureWorkspacePath(workspace, relative);
    await fs.mkdir(path.dirname(full), { recursive: true });

    if (!overwrite) {
      let count = 1;
      while (true) {
        try {
          await fs.access(full);
          const ext = path.extname(filename);
          const base = filename.slice(
            0,
            Math.max(0, filename.length - ext.length)
          );
          const next = `${base}_${count}${ext}`;
          relative = path.join(folder, next);
          full = ensureWorkspacePath(workspace, relative);
          count += 1;
        } catch {
          break;
        }
      }
    }

    const bytes = bytesFromUnknown(video.data);
    await fs.writeFile(full, bytes);
    return {
      output: {
        uri: fileUri(full),
        data: Buffer.from(bytes).toString("base64")
      }
    };
  }
}

export const WORKSPACE_NODES = [
  GetWorkspaceDirNode,
  ListWorkspaceFilesNode,
  ReadTextFileNode,
  WriteTextFileNode,
  ReadBinaryFileNode,
  WriteBinaryFileNode,
  DeleteWorkspaceFileNode,
  CreateWorkspaceDirectoryNode,
  WorkspaceFileExistsNode,
  GetWorkspaceFileInfoNode,
  CopyWorkspaceFileNode,
  MoveWorkspaceFileNode,
  GetWorkspaceFileSizeNode,
  IsWorkspaceFileNode,
  IsWorkspaceDirectoryNode,
  JoinWorkspacePathsNode,
  SaveImageFileNode,
  SaveVideoFileNode
] as const;
