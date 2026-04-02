// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Workspace Directory — lib.os.WorkspaceDirectory
export interface WorkspaceDirectoryInputs {}

export interface WorkspaceDirectoryOutputs {
  output: string;
}

export function workspaceDirectory(
  inputs?: WorkspaceDirectoryInputs
): DslNode<WorkspaceDirectoryOutputs, "output"> {
  return createNode(
    "lib.os.WorkspaceDirectory",
    (inputs ?? {}) as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Open Workspace Directory — lib.os.OpenWorkspaceDirectory
export interface OpenWorkspaceDirectoryInputs {}

export interface OpenWorkspaceDirectoryOutputs {
  output: unknown;
}

export function openWorkspaceDirectory(
  inputs?: OpenWorkspaceDirectoryInputs
): DslNode<OpenWorkspaceDirectoryOutputs, "output"> {
  return createNode(
    "lib.os.OpenWorkspaceDirectory",
    (inputs ?? {}) as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// File Exists — lib.os.FileExists
export interface FileExistsInputs {
  path?: Connectable<string>;
}

export interface FileExistsOutputs {
  output: boolean;
}

export function fileExists(
  inputs: FileExistsInputs
): DslNode<FileExistsOutputs, "output"> {
  return createNode("lib.os.FileExists", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// List Files — lib.os.ListFiles
export interface ListFilesInputs {
  folder?: Connectable<string>;
  pattern?: Connectable<string>;
  include_subdirectories?: Connectable<boolean>;
}

export interface ListFilesOutputs {
  file: string;
}

export function listFiles(
  inputs: ListFilesInputs
): DslNode<ListFilesOutputs, "file"> {
  return createNode("lib.os.ListFiles", inputs as Record<string, unknown>, {
    outputNames: ["file"],
    defaultOutput: "file",
    streaming: true
  });
}

// Copy File — lib.os.CopyFile
export interface CopyFileInputs {
  source_path?: Connectable<string>;
  destination_path?: Connectable<string>;
}

export interface CopyFileOutputs {
  output: string;
}

export function copyFile(
  inputs: CopyFileInputs
): DslNode<CopyFileOutputs, "output"> {
  return createNode("lib.os.CopyFile", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Move File — lib.os.MoveFile
export interface MoveFileInputs {
  source_path?: Connectable<string>;
  destination_path?: Connectable<string>;
}

export interface MoveFileOutputs {}

export function moveFile(inputs: MoveFileInputs): DslNode<MoveFileOutputs> {
  return createNode("lib.os.MoveFile", inputs as Record<string, unknown>, {
    outputNames: []
  });
}

// Create Directory — lib.os.CreateDirectory
export interface CreateDirectoryInputs {
  path?: Connectable<string>;
  exist_ok?: Connectable<boolean>;
}

export interface CreateDirectoryOutputs {}

export function createDirectory(
  inputs: CreateDirectoryInputs
): DslNode<CreateDirectoryOutputs> {
  return createNode(
    "lib.os.CreateDirectory",
    inputs as Record<string, unknown>,
    { outputNames: [] }
  );
}

// Get File Size — lib.os.GetFileSize
export interface GetFileSizeInputs {
  path?: Connectable<string>;
}

export interface GetFileSizeOutputs {
  output: number;
}

export function getFileSize(
  inputs: GetFileSizeInputs
): DslNode<GetFileSizeOutputs, "output"> {
  return createNode("lib.os.GetFileSize", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Created Time — lib.os.CreatedTime
export interface CreatedTimeInputs {
  path?: Connectable<string>;
}

export interface CreatedTimeOutputs {
  output: unknown;
}

export function createdTime(
  inputs: CreatedTimeInputs
): DslNode<CreatedTimeOutputs, "output"> {
  return createNode("lib.os.CreatedTime", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Modified Time — lib.os.ModifiedTime
export interface ModifiedTimeInputs {
  path?: Connectable<string>;
}

export interface ModifiedTimeOutputs {
  output: unknown;
}

export function modifiedTime(
  inputs: ModifiedTimeInputs
): DslNode<ModifiedTimeOutputs, "output"> {
  return createNode("lib.os.ModifiedTime", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Accessed Time — lib.os.AccessedTime
export interface AccessedTimeInputs {
  path?: Connectable<string>;
}

export interface AccessedTimeOutputs {
  output: unknown;
}

export function accessedTime(
  inputs: AccessedTimeInputs
): DslNode<AccessedTimeOutputs, "output"> {
  return createNode("lib.os.AccessedTime", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Is File — lib.os.IsFile
export interface IsFileInputs {
  path?: Connectable<string>;
}

export interface IsFileOutputs {
  output: boolean;
}

export function isFile(inputs: IsFileInputs): DslNode<IsFileOutputs, "output"> {
  return createNode("lib.os.IsFile", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Is Directory — lib.os.IsDirectory
export interface IsDirectoryInputs {
  path?: Connectable<string>;
}

export interface IsDirectoryOutputs {
  output: boolean;
}

export function isDirectory(
  inputs: IsDirectoryInputs
): DslNode<IsDirectoryOutputs, "output"> {
  return createNode("lib.os.IsDirectory", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// File Extension — lib.os.FileExtension
export interface FileExtensionInputs {
  path?: Connectable<string>;
}

export interface FileExtensionOutputs {
  output: string;
}

export function fileExtension(
  inputs: FileExtensionInputs
): DslNode<FileExtensionOutputs, "output"> {
  return createNode("lib.os.FileExtension", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// File Name — lib.os.FileName
export interface FileNameInputs {
  path?: Connectable<string>;
}

export interface FileNameOutputs {
  output: string;
}

export function fileName(
  inputs: FileNameInputs
): DslNode<FileNameOutputs, "output"> {
  return createNode("lib.os.FileName", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Get Directory — lib.os.GetDirectory
export interface GetDirectoryInputs {
  path?: Connectable<string>;
}

export interface GetDirectoryOutputs {
  output: string;
}

export function getDirectory(
  inputs: GetDirectoryInputs
): DslNode<GetDirectoryOutputs, "output"> {
  return createNode("lib.os.GetDirectory", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// File Name Match — lib.os.FileNameMatch
export interface FileNameMatchInputs {
  filename?: Connectable<string>;
  pattern?: Connectable<string>;
  case_sensitive?: Connectable<boolean>;
}

export interface FileNameMatchOutputs {
  output: boolean;
}

export function fileNameMatch(
  inputs: FileNameMatchInputs
): DslNode<FileNameMatchOutputs, "output"> {
  return createNode("lib.os.FileNameMatch", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Filter File Names — lib.os.FilterFileNames
export interface FilterFileNamesInputs {
  filenames?: Connectable<string[]>;
  pattern?: Connectable<string>;
  case_sensitive?: Connectable<boolean>;
}

export interface FilterFileNamesOutputs {
  output: string[];
}

export function filterFileNames(
  inputs: FilterFileNamesInputs
): DslNode<FilterFileNamesOutputs, "output"> {
  return createNode(
    "lib.os.FilterFileNames",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Basename — lib.os.Basename
export interface BasenameInputs {
  path?: Connectable<string>;
  remove_extension?: Connectable<boolean>;
}

export interface BasenameOutputs {
  output: string;
}

export function basename(
  inputs: BasenameInputs
): DslNode<BasenameOutputs, "output"> {
  return createNode("lib.os.Basename", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Dirname — lib.os.Dirname
export interface DirnameInputs {
  path?: Connectable<string>;
}

export interface DirnameOutputs {
  output: string;
}

export function dirname(
  inputs: DirnameInputs
): DslNode<DirnameOutputs, "output"> {
  return createNode("lib.os.Dirname", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Join Paths — lib.os.JoinPaths
export interface JoinPathsInputs {
  paths?: Connectable<string[]>;
}

export interface JoinPathsOutputs {
  output: string;
}

export function joinPaths(
  inputs: JoinPathsInputs
): DslNode<JoinPathsOutputs, "output"> {
  return createNode("lib.os.JoinPaths", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Normalize Path — lib.os.NormalizePath
export interface NormalizePathInputs {
  path?: Connectable<string>;
}

export interface NormalizePathOutputs {
  output: string;
}

export function normalizePath(
  inputs: NormalizePathInputs
): DslNode<NormalizePathOutputs, "output"> {
  return createNode("lib.os.NormalizePath", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Get Path Info — lib.os.GetPathInfo
export interface GetPathInfoInputs {
  path?: Connectable<string>;
}

export interface GetPathInfoOutputs {
  output: Record<string, unknown>;
}

export function getPathInfo(
  inputs: GetPathInfoInputs
): DslNode<GetPathInfoOutputs, "output"> {
  return createNode("lib.os.GetPathInfo", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Absolute Path — lib.os.AbsolutePath
export interface AbsolutePathInputs {
  path?: Connectable<string>;
}

export interface AbsolutePathOutputs {
  output: string;
}

export function absolutePath(
  inputs: AbsolutePathInputs
): DslNode<AbsolutePathOutputs, "output"> {
  return createNode("lib.os.AbsolutePath", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Split Path — lib.os.SplitPath
export interface SplitPathInputs {
  path?: Connectable<string>;
}

export interface SplitPathOutputs {
  output: Record<string, unknown>;
}

export function splitPath(
  inputs: SplitPathInputs
): DslNode<SplitPathOutputs, "output"> {
  return createNode("lib.os.SplitPath", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Split Extension — lib.os.SplitExtension
export interface SplitExtensionInputs {
  path?: Connectable<string>;
}

export interface SplitExtensionOutputs {
  output: Record<string, unknown>;
}

export function splitExtension(
  inputs: SplitExtensionInputs
): DslNode<SplitExtensionOutputs, "output"> {
  return createNode(
    "lib.os.SplitExtension",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Relative Path — lib.os.RelativePath
export interface RelativePathInputs {
  target_path?: Connectable<string>;
  start_path?: Connectable<string>;
}

export interface RelativePathOutputs {
  output: string;
}

export function relativePath(
  inputs: RelativePathInputs
): DslNode<RelativePathOutputs, "output"> {
  return createNode("lib.os.RelativePath", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Path To String — lib.os.PathToString
export interface PathToStringInputs {
  file_path?: Connectable<string>;
}

export interface PathToStringOutputs {
  output: string;
}

export function pathToString(
  inputs: PathToStringInputs
): DslNode<PathToStringOutputs, "output"> {
  return createNode("lib.os.PathToString", inputs as Record<string, unknown>, {
    outputNames: ["output"],
    defaultOutput: "output"
  });
}

// Show Notification — lib.os.ShowNotification
export interface ShowNotificationInputs {
  title?: Connectable<string>;
  message?: Connectable<string>;
  timeout?: Connectable<number>;
}

export interface ShowNotificationOutputs {
  output: unknown;
}

export function showNotification(
  inputs: ShowNotificationInputs
): DslNode<ShowNotificationOutputs, "output"> {
  return createNode(
    "lib.os.ShowNotification",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
