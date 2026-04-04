import { BaseNode, prop } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

function expandUser(p: string): string {
  if (!p) return p;
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function toDateTimeValue(date: Date): Record<string, unknown> {
  const offsetMin = -date.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
    millisecond: date.getMilliseconds(),
    tzinfo: date.toString().match(/\(([^)]+)\)$/)?.[1] ?? "",
    utc_offset: `${sign}${hh}${mm}`
  };
}

function wildcardToRegExp(pattern: string, caseSensitive: boolean): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");
  return new RegExp(`^${escaped}$`, caseSensitive ? "" : "i");
}

async function walk(dir: string, recursive: boolean): Promise<string[]> {
  const out: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    out.push(full);
    if (recursive && entry.isDirectory()) {
      out.push(...(await walk(full, recursive)));
    }
  }
  return out;
}

function openPath(target: string): Promise<void> {
  const cmd =
    process.platform === "darwin"
      ? "open"
      : process.platform === "win32"
        ? "explorer"
        : "xdg-open";
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, [target], { stdio: "ignore" });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Failed to open path: exit ${code}`));
    });
  });
}

export class WorkspaceDirectoryLibNode extends BaseNode {
  static readonly nodeType = "lib.os.WorkspaceDirectory";
  static readonly title = "Workspace Directory";
  static readonly description =
    "Get the workspace directory.\n    files, workspace, directory";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    return { output: context?.workspaceDir ?? "" };
  }
}

export class OpenWorkspaceDirectoryLibNode extends BaseNode {
  static readonly nodeType = "lib.os.OpenWorkspaceDirectory";
  static readonly title = "Open Workspace Directory";
  static readonly description =
    "Open the workspace directory.\n    files, workspace, directory";
  static readonly metadataOutputTypes = {
    output: "none"
  };

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const dir = context?.workspaceDir;
    if (!dir) return {};
    await openPath(dir);
    return {};
  }
}

export class FileExistsLibNode extends BaseNode {
  static readonly nodeType = "lib.os.FileExists";
  static readonly title = "File Exists";
  static readonly description =
    "Check if a file or directory exists at the specified path.\n    files, check, exists\n\n    Use cases:\n    - Validate file presence before processing\n    - Implement conditional logic based on file existence";
  static readonly metadataOutputTypes = {
    output: "bool"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to check for existence"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const p = String(this.path ?? "");
    if (!p) throw new Error("'path' field cannot be empty");
    return { output: existsSync(expandUser(p)) };
  }
}

export class ListFilesLibNode extends BaseNode {
  static readonly nodeType = "lib.os.ListFiles";
  static readonly title = "List Files";
  static readonly description =
    "list files in a directory matching a pattern.\n    files, list, directory\n\n    Use cases:\n    - Get files for batch processing\n    - Filter files by extension or pattern";
  static readonly metadataOutputTypes = {
    file: "str"
  };

  static readonly isStreamingOutput = true;
  @prop({
    type: "str",
    default: "~",
    title: "Folder",
    description: "Directory to scan"
  })
  declare folder: any;

  @prop({
    type: "str",
    default: "*",
    title: "Pattern",
    description: "File pattern to match (e.g. *.txt)"
  })
  declare pattern: any;

  @prop({
    type: "bool",
    default: false,
    title: "Include Subdirectories",
    description: "Search subdirectories"
  })
  declare include_subdirectories: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const folder = expandUser(String(this.folder ?? "~"));
    const pattern = String(this.pattern ?? "*");
    const includeSubdirectories = Boolean(this.include_subdirectories ?? false);

    if (!folder) throw new Error("directory cannot be empty");
    const rx = wildcardToRegExp(pattern, true);
    for (const p of await walk(folder, includeSubdirectories)) {
      if (rx.test(path.basename(p))) {
        yield { file: p };
      }
    }
  }
}

export class CopyFileLibNode extends BaseNode {
  static readonly nodeType = "lib.os.CopyFile";
  static readonly title = "Copy File";
  static readonly description =
    "Copy a file from source to destination path.\n    files, copy, manage\n\n    Use cases:\n    - Create file backups\n    - Duplicate files for processing\n    - Copy files to new locations";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "Source Path",
    description: "Source file path"
  })
  declare source_path: any;

  @prop({
    type: "str",
    default: "",
    title: "Destination Path",
    description: "Destination file path"
  })
  declare destination_path: any;

  async process(): Promise<Record<string, unknown>> {
    const src = expandUser(String(this.source_path ?? ""));
    const dst = expandUser(String(this.destination_path ?? ""));
    if (!src) throw new Error("'source_path' field cannot be empty");
    if (!dst) throw new Error("'destination_path' field cannot be empty");

    await fs.mkdir(path.dirname(dst), { recursive: true });
    const stat = await fs.stat(src);
    if (stat.isDirectory()) {
      await fs.cp(src, dst, { recursive: true });
    } else {
      await fs.copyFile(src, dst);
    }
    return { output: String(this.destination_path ?? "") };
  }
}

export class MoveFileLibNode extends BaseNode {
  static readonly nodeType = "lib.os.MoveFile";
  static readonly title = "Move File";
  static readonly description =
    "Move a file from source to destination path.\n    files, move, manage\n\n    Use cases:\n    - Organize files into directories\n    - Process and archive files\n    - Relocate completed files";

  @prop({
    type: "str",
    default: "",
    title: "Source Path",
    description: "Source file path"
  })
  declare source_path: any;

  @prop({
    type: "str",
    default: "",
    title: "Destination Path",
    description: "Destination file path"
  })
  declare destination_path: any;

  async process(): Promise<Record<string, unknown>> {
    const src = expandUser(String(this.source_path ?? ""));
    const dst = expandUser(String(this.destination_path ?? ""));
    await fs.mkdir(path.dirname(dst), { recursive: true });
    await fs.rename(src, dst);
    return {};
  }
}

export class CreateDirectoryLibNode extends BaseNode {
  static readonly nodeType = "lib.os.CreateDirectory";
  static readonly title = "Create Directory";
  static readonly description =
    "Create a new directory at specified path.\n    files, directory, create\n\n    Use cases:\n    - Set up directory structure for file organization\n    - Create output directories for processed files";

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Directory path to create"
  })
  declare path: any;

  @prop({
    type: "bool",
    default: true,
    title: "Exist Ok",
    description: "Don't error if directory already exists"
  })
  declare exist_ok: any;

  async process(): Promise<Record<string, unknown>> {
    const p = expandUser(String(this.path ?? ""));
    if (!p) throw new Error("'path' field cannot be empty");
    await fs.mkdir(p, { recursive: Boolean(this.exist_ok ?? true) });
    return {};
  }
}

export class GetFileSizeLibNode extends BaseNode {
  static readonly nodeType = "lib.os.GetFileSize";
  static readonly title = "Get File Size";
  static readonly description =
    "Get file size in bytes.\n    files, metadata, size";
  static readonly metadataOutputTypes = {
    output: "int"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to file"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const p = expandUser(String(this.path ?? ""));
    if (!p) throw new Error("'path' field cannot be empty");
    const stat = await fs.stat(p);
    return { output: stat.size };
  }
}

abstract class FileTimeBase extends BaseNode {
  protected async getTime(kind: "atime" | "ctime" | "mtime") {
    const p = expandUser(String((this as any).path ?? ""));
    if (!p) throw new Error("'path' field cannot be empty");
    const stat = await fs.stat(p);
    const d =
      kind === "atime"
        ? stat.atime
        : kind === "ctime"
          ? stat.ctime
          : stat.mtime;
    return { output: toDateTimeValue(d) };
  }
}

export class CreatedTimeLibNode extends FileTimeBase {
  static readonly nodeType = "lib.os.CreatedTime";
  static readonly title = "Created Time";
  static readonly description =
    "Get file creation timestamp.\n    files, metadata, created, time";
  static readonly metadataOutputTypes = {
    output: "datetime"
  };
  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to file"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    return this.getTime("ctime");
  }
}

export class ModifiedTimeLibNode extends FileTimeBase {
  static readonly nodeType = "lib.os.ModifiedTime";
  static readonly title = "Modified Time";
  static readonly description =
    "Get file last modified timestamp.\n    files, metadata, modified, time";
  static readonly metadataOutputTypes = {
    output: "datetime"
  };
  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to file"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    return this.getTime("mtime");
  }
}

export class AccessedTimeLibNode extends FileTimeBase {
  static readonly nodeType = "lib.os.AccessedTime";
  static readonly title = "Accessed Time";
  static readonly description =
    "Get file last accessed timestamp.\n    files, metadata, accessed, time";
  static readonly metadataOutputTypes = {
    output: "datetime"
  };
  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to file"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    return this.getTime("atime");
  }
}

abstract class PathBoolNode extends BaseNode {
  @prop({ type: "str", default: "" })
  declare path: any;

  protected readPath(): string {
    const p = expandUser(String(this.path ?? ""));
    if (!p) throw new Error("'path' field cannot be empty");
    return p;
  }
}

export class IsFileLibNode extends PathBoolNode {
  static readonly nodeType = "lib.os.IsFile";
  static readonly title = "Is File";
  static readonly description =
    "Check if path is a file.\n    files, metadata, type";
  static readonly metadataOutputTypes = {
    output: "bool"
  };
  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to check"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const p = this.readPath();
    try {
      return { output: (await fs.stat(p)).isFile() };
    } catch {
      return { output: false };
    }
  }
}

export class IsDirectoryLibNode extends PathBoolNode {
  static readonly nodeType = "lib.os.IsDirectory";
  static readonly title = "Is Directory";
  static readonly description =
    "Check if path is a directory.\n    files, metadata, type";
  static readonly metadataOutputTypes = {
    output: "bool"
  };
  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to check"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const p = this.readPath();
    try {
      return { output: (await fs.stat(p)).isDirectory() };
    } catch {
      return { output: false };
    }
  }
}

export class FileExtensionLibNode extends PathBoolNode {
  static readonly nodeType = "lib.os.FileExtension";
  static readonly title = "File Extension";
  static readonly description =
    "Get file extension.\n    files, metadata, extension";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to file"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: path.extname(this.readPath()) };
  }
}

export class FileNameLibNode extends PathBoolNode {
  static readonly nodeType = "lib.os.FileName";
  static readonly title = "File Name";
  static readonly description =
    "Get file name without path.\n    files, metadata, name";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to file"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: path.basename(this.readPath()) };
  }
}

export class GetDirectoryLibNode extends PathBoolNode {
  static readonly nodeType = "lib.os.GetDirectory";
  static readonly title = "Get Directory";
  static readonly description =
    "Get directory containing the file.\n    files, metadata, directory";
  static readonly metadataOutputTypes = {
    output: "str"
  };
  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to file"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: path.dirname(this.readPath()) };
  }
}

export class FileNameMatchLibNode extends BaseNode {
  static readonly nodeType = "lib.os.FileNameMatch";
  static readonly title = "File Name Match";
  static readonly description =
    "Match a filename against a pattern using Unix shell-style wildcards.\n    files, pattern, match, filter\n\n    Use cases:\n    - Filter files by name pattern\n    - Validate file naming conventions\n    - Match file extensions";
  static readonly metadataOutputTypes = {
    output: "bool"
  };

  @prop({
    type: "str",
    default: "",
    title: "Filename",
    description: "Filename to check"
  })
  declare filename: any;

  @prop({
    type: "str",
    default: "*",
    title: "Pattern",
    description: "Pattern to match against (e.g. *.txt, data_*.csv)"
  })
  declare pattern: any;

  @prop({
    type: "bool",
    default: true,
    title: "Case Sensitive",
    description: "Whether the pattern matching should be case-sensitive"
  })
  declare case_sensitive: any;

  async process(): Promise<Record<string, unknown>> {
    const filename = String(this.filename ?? "");
    const pattern = String(this.pattern ?? "*");
    const caseSensitive = Boolean(this.case_sensitive ?? true);
    return {
      output: wildcardToRegExp(pattern, caseSensitive).test(
        caseSensitive ? filename : filename.toLowerCase()
      )
    };
  }
}

export class FilterFileNamesLibNode extends BaseNode {
  static readonly nodeType = "lib.os.FilterFileNames";
  static readonly title = "Filter File Names";
  static readonly description =
    "Filter a list of filenames using Unix shell-style wildcards.\n    files, pattern, filter, list\n\n    Use cases:\n    - Filter multiple files by pattern\n    - Batch process files matching criteria\n    - Select files by extension";
  static readonly metadataOutputTypes = {
    output: "list[str]"
  };

  @prop({
    type: "list[str]",
    default: [],
    title: "Filenames",
    description: "list of filenames to filter"
  })
  declare filenames: any;

  @prop({
    type: "str",
    default: "*",
    title: "Pattern",
    description: "Pattern to filter by (e.g. *.txt, data_*.csv)"
  })
  declare pattern: any;

  @prop({
    type: "bool",
    default: true,
    title: "Case Sensitive",
    description: "Whether the pattern matching should be case-sensitive"
  })
  declare case_sensitive: any;

  async process(): Promise<Record<string, unknown>> {
    const filenames = Array.isArray(this.filenames)
      ? ((this.filenames ?? []) as unknown[]).map(String)
      : [];
    const pattern = String(this.pattern ?? "*");
    const caseSensitive = Boolean(this.case_sensitive ?? true);
    const rx = wildcardToRegExp(pattern, caseSensitive);
    const output = filenames.filter((name) =>
      rx.test(caseSensitive ? name : name.toLowerCase())
    );
    return { output };
  }
}

export class BasenameLibNode extends BaseNode {
  static readonly nodeType = "lib.os.Basename";
  static readonly title = "Basename";
  static readonly description =
    "Get the base name component of a file path.\n    files, path, basename\n\n    Use cases:\n    - Extract filename from full path\n    - Get file name without directory\n    - Process file names independently";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "File path to get basename from"
  })
  declare path: any;

  @prop({
    type: "bool",
    default: false,
    title: "Remove Extension",
    description: "Remove file extension from basename"
  })
  declare remove_extension: any;

  async process(): Promise<Record<string, unknown>> {
    const p = expandUser(String(this.path ?? ""));
    if (p.trim() === "") throw new Error("path is empty");
    const basename = path.basename(p);
    if (this.remove_extension ?? false) {
      return { output: path.parse(basename).name };
    }
    return { output: basename };
  }
}

export class DirnameLibNode extends BaseNode {
  static readonly nodeType = "lib.os.Dirname";
  static readonly title = "Dirname";
  static readonly description =
    "Get the directory name component of a file path.\n    files, path, dirname\n\n    Use cases:\n    - Extract directory path from full path\n    - Get parent directory\n    - Process directory paths";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "File path to get dirname from"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    return { output: path.dirname(expandUser(String(this.path ?? ""))) };
  }
}

export class JoinPathsLibNode extends BaseNode {
  static readonly nodeType = "lib.os.JoinPaths";
  static readonly title = "Join Paths";
  static readonly description =
    "Joins path components.\n    path, join, combine\n\n    Use cases:\n    - Build file paths\n    - Create cross-platform paths";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "list[str]",
    default: [],
    title: "Paths",
    description: "Path components to join"
  })
  declare paths: any;

  async process(): Promise<Record<string, unknown>> {
    const parts = Array.isArray(this.paths)
      ? ((this.paths ?? []) as unknown[]).map(String)
      : [];
    if (parts.length === 0) throw new Error("paths cannot be empty");
    return { output: path.join(...parts) };
  }
}

export class NormalizePathLibNode extends BaseNode {
  static readonly nodeType = "lib.os.NormalizePath";
  static readonly title = "Normalize Path";
  static readonly description =
    "Normalizes a path.\n    path, normalize, clean\n\n    Use cases:\n    - Standardize paths\n    - Remove redundant separators";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to normalize"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const p = String(this.path ?? "");
    if (!p) throw new Error("path cannot be empty");
    return { output: path.normalize(p) };
  }
}

export class GetPathInfoLibNode extends BaseNode {
  static readonly nodeType = "lib.os.GetPathInfo";
  static readonly title = "Get Path Info";
  static readonly description =
    "Gets information about a path.\n    path, info, metadata\n\n    Use cases:\n    - Extract path components\n    - Parse file paths";
  static readonly metadataOutputTypes = {
    output: "dict"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to analyze"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const p = String(this.path ?? "");
    const abs = path.resolve(p);
    let stat: Awaited<ReturnType<typeof fs.lstat>> | null = null;
    try {
      stat = await fs.lstat(p);
    } catch {
      /* stat stays null if path doesn't exist */
    }
    return {
      output: {
        dirname: path.dirname(p),
        basename: path.basename(p),
        extension: path.extname(p),
        absolute: abs,
        exists: existsSync(p),
        is_file: stat?.isFile() ?? false,
        is_dir: stat?.isDirectory() ?? false,
        is_symlink: stat?.isSymbolicLink() ?? false
      }
    };
  }
}

export class AbsolutePathLibNode extends BaseNode {
  static readonly nodeType = "lib.os.AbsolutePath";
  static readonly title = "Absolute Path";
  static readonly description =
    "Return the absolute path of a file or directory.\n    files, path, absolute\n\n    Use cases:\n    - Convert relative paths to absolute\n    - Get full system path\n    - Resolve path references";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to convert to absolute"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const p = expandUser(String(this.path ?? ""));
    if (!p) throw new Error("path cannot be empty");
    return { output: path.resolve(p) };
  }
}

export class SplitPathLibNode extends BaseNode {
  static readonly nodeType = "lib.os.SplitPath";
  static readonly title = "Split Path";
  static readonly description =
    "Split a path into directory and file components.\n    files, path, split\n\n    Use cases:\n    - Separate directory from filename\n    - Process path components separately\n    - Extract path parts";
  static readonly metadataOutputTypes = {
    output: "dict"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to split"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const p = expandUser(String(this.path ?? ""));
    return { dirname: path.dirname(p), basename: path.basename(p) };
  }
}

export class SplitExtensionLibNode extends BaseNode {
  static readonly nodeType = "lib.os.SplitExtension";
  static readonly title = "Split Extension";
  static readonly description =
    "Split a path into root and extension components.\n    files, path, extension, split\n\n    Use cases:\n    - Extract file extension\n    - Process filename without extension\n    - Handle file types";
  static readonly metadataOutputTypes = {
    output: "dict"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to split"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const p = expandUser(String(this.path ?? ""));
    const parsed = path.parse(p);
    return { root: path.join(parsed.dir, parsed.name), extension: parsed.ext };
  }
}

export class RelativePathLibNode extends BaseNode {
  static readonly nodeType = "lib.os.RelativePath";
  static readonly title = "Relative Path";
  static readonly description =
    "Return a relative path to a target from a start directory.\n    files, path, relative\n\n    Use cases:\n    - Create relative path references\n    - Generate portable paths\n    - Compare file locations";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "Target Path",
    description: "Target path to convert to relative"
  })
  declare target_path: any;

  @prop({
    type: "str",
    default: ".",
    title: "Start Path",
    description: "Start path for relative conversion"
  })
  declare start_path: any;

  async process(): Promise<Record<string, unknown>> {
    const target = expandUser(String(this.target_path ?? ""));
    const start = expandUser(String(this.start_path ?? "."));
    if (!target) throw new Error("target_path cannot be empty");
    return { output: path.relative(start, target) };
  }
}

export class PathToStringLibNode extends BaseNode {
  static readonly nodeType = "lib.os.PathToString";
  static readonly title = "Path To String";
  static readonly description =
    "Convert a FilePath object to a string.\n    files, path, string, convert\n\n    Use cases:\n    - Get raw string path from FilePath object\n    - Convert FilePath for string operations\n    - Extract path string for external use";
  static readonly metadataOutputTypes = {
    output: "str"
  };

  @prop({
    type: "str",
    default: "",
    title: "File Path",
    description: "File path to convert to string"
  })
  declare file_path: any;

  async process(): Promise<Record<string, unknown>> {
    const filePath = String(this.file_path ?? "");
    if (!filePath) throw new Error("file_path cannot be empty");
    return { output: filePath };
  }
}

export class ShowNotificationLibNode extends BaseNode {
  static readonly nodeType = "lib.os.ShowNotification";
  static readonly title = "Show Notification";
  static readonly description =
    "Shows a system notification.\n    notification, system, alert\n\n    Use cases:\n    - Alert user of completed tasks\n    - Show process status\n    - Display important messages";
  static readonly metadataOutputTypes = {
    output: "none"
  };

  @prop({
    type: "str",
    default: "",
    title: "Title",
    description: "Title of the notification"
  })
  declare title: any;

  @prop({
    type: "str",
    default: "",
    title: "Message",
    description: "Content of the notification"
  })
  declare message: any;

  @prop({
    type: "int",
    default: 10,
    title: "Timeout",
    description: "How long the notification should stay visible (in seconds)"
  })
  declare timeout: any;

  async process(): Promise<Record<string, unknown>> {
    const title = String(this.title ?? "");
    const message = String(this.message ?? "");
    if (!title) throw new Error("title cannot be empty");
    if (!message) throw new Error("message cannot be empty");
    return {};
  }
}

export const LIB_OS_NODES = [
  WorkspaceDirectoryLibNode,
  OpenWorkspaceDirectoryLibNode,
  FileExistsLibNode,
  ListFilesLibNode,
  CopyFileLibNode,
  MoveFileLibNode,
  CreateDirectoryLibNode,
  GetFileSizeLibNode,
  CreatedTimeLibNode,
  ModifiedTimeLibNode,
  AccessedTimeLibNode,
  IsFileLibNode,
  IsDirectoryLibNode,
  FileExtensionLibNode,
  FileNameLibNode,
  GetDirectoryLibNode,
  FileNameMatchLibNode,
  FilterFileNamesLibNode,
  BasenameLibNode,
  DirnameLibNode,
  JoinPathsLibNode,
  NormalizePathLibNode,
  GetPathInfoLibNode,
  AbsolutePathLibNode,
  SplitPathLibNode,
  SplitExtensionLibNode,
  RelativePathLibNode,
  PathToStringLibNode,
  ShowNotificationLibNode
] as const;
