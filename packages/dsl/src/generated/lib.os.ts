// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";

// Workspace Directory — lib.os.WorkspaceDirectory
export interface WorkspaceDirectoryInputs {
}

export interface WorkspaceDirectoryOutputs {
  output: string;
}

export function workspaceDirectory(inputs?: WorkspaceDirectoryInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<WorkspaceDirectoryOutputs, "output"> {
  return createNode("lib.os.WorkspaceDirectory", (inputs ?? {}) as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Open Workspace Directory — lib.os.OpenWorkspaceDirectory
export interface OpenWorkspaceDirectoryInputs {
}

export interface OpenWorkspaceDirectoryOutputs {
  output: unknown;
}

export function openWorkspaceDirectory(inputs?: OpenWorkspaceDirectoryInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<OpenWorkspaceDirectoryOutputs, "output"> {
  return createNode("lib.os.OpenWorkspaceDirectory", (inputs ?? {}) as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// File Exists — lib.os.FileExists
export interface FileExistsInputs {
  path?: Connectable<string>;
}

export interface FileExistsOutputs {
  output: boolean;
}

export function fileExists(inputs: FileExistsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FileExistsOutputs, "output"> {
  return createNode("lib.os.FileExists", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// List Files — lib.os.ListFiles
export interface ListFilesInputs {
  folder?: Connectable<string>;
  pattern?: Connectable<string>;
  include_subdirectories?: Connectable<boolean>;
}

export interface ListFilesOutputs {
  file: string;
  files: unknown[];
}

export function listFiles(inputs: ListFilesInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ListFilesOutputs> {
  return createNode("lib.os.ListFiles", inputs as Record<string, unknown>, { outputNames: ["file", "files"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Copy File — lib.os.CopyFile
export interface CopyFileInputs {
  source_path?: Connectable<string>;
  destination_path?: Connectable<string>;
}

export interface CopyFileOutputs {
  output: string;
}

export function copyFile(inputs: CopyFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CopyFileOutputs, "output"> {
  return createNode("lib.os.CopyFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Move File — lib.os.MoveFile
export interface MoveFileInputs {
  source_path?: Connectable<string>;
  destination_path?: Connectable<string>;
}

export interface MoveFileOutputs {
}

export function moveFile(inputs: MoveFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<MoveFileOutputs> {
  return createNode("lib.os.MoveFile", inputs as Record<string, unknown>, { outputNames: [], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Create Directory — lib.os.CreateDirectory
export interface CreateDirectoryInputs {
  path?: Connectable<string>;
  exist_ok?: Connectable<boolean>;
}

export interface CreateDirectoryOutputs {
}

export function createDirectory(inputs: CreateDirectoryInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CreateDirectoryOutputs> {
  return createNode("lib.os.CreateDirectory", inputs as Record<string, unknown>, { outputNames: [], ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Get File Size — lib.os.GetFileSize
export interface GetFileSizeInputs {
  path?: Connectable<string>;
}

export interface GetFileSizeOutputs {
  output: number;
}

export function getFileSize(inputs: GetFileSizeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GetFileSizeOutputs, "output"> {
  return createNode("lib.os.GetFileSize", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Created Time — lib.os.CreatedTime
export interface CreatedTimeInputs {
  path?: Connectable<string>;
}

export interface CreatedTimeOutputs {
  output: unknown;
}

export function createdTime(inputs: CreatedTimeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CreatedTimeOutputs, "output"> {
  return createNode("lib.os.CreatedTime", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Modified Time — lib.os.ModifiedTime
export interface ModifiedTimeInputs {
  path?: Connectable<string>;
}

export interface ModifiedTimeOutputs {
  output: unknown;
}

export function modifiedTime(inputs: ModifiedTimeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ModifiedTimeOutputs, "output"> {
  return createNode("lib.os.ModifiedTime", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Accessed Time — lib.os.AccessedTime
export interface AccessedTimeInputs {
  path?: Connectable<string>;
}

export interface AccessedTimeOutputs {
  output: unknown;
}

export function accessedTime(inputs: AccessedTimeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<AccessedTimeOutputs, "output"> {
  return createNode("lib.os.AccessedTime", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Is File — lib.os.IsFile
export interface IsFileInputs {
  path?: Connectable<string>;
}

export interface IsFileOutputs {
  output: boolean;
}

export function isFile(inputs: IsFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<IsFileOutputs, "output"> {
  return createNode("lib.os.IsFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Is Directory — lib.os.IsDirectory
export interface IsDirectoryInputs {
  path?: Connectable<string>;
}

export interface IsDirectoryOutputs {
  output: boolean;
}

export function isDirectory(inputs: IsDirectoryInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<IsDirectoryOutputs, "output"> {
  return createNode("lib.os.IsDirectory", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// File Extension — lib.os.FileExtension
export interface FileExtensionInputs {
  path?: Connectable<string>;
}

export interface FileExtensionOutputs {
  output: string;
}

export function fileExtension(inputs: FileExtensionInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FileExtensionOutputs, "output"> {
  return createNode("lib.os.FileExtension", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// File Name — lib.os.FileName
export interface FileNameInputs {
  path?: Connectable<string>;
}

export interface FileNameOutputs {
  output: string;
}

export function fileName(inputs: FileNameInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FileNameOutputs, "output"> {
  return createNode("lib.os.FileName", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Get Directory — lib.os.GetDirectory
export interface GetDirectoryInputs {
  path?: Connectable<string>;
}

export interface GetDirectoryOutputs {
  output: string;
}

export function getDirectory(inputs: GetDirectoryInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GetDirectoryOutputs, "output"> {
  return createNode("lib.os.GetDirectory", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
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

export function fileNameMatch(inputs: FileNameMatchInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FileNameMatchOutputs, "output"> {
  return createNode("lib.os.FileNameMatch", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
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

export function filterFileNames(inputs: FilterFileNamesInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FilterFileNamesOutputs, "output"> {
  return createNode("lib.os.FilterFileNames", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Basename — lib.os.Basename
export interface BasenameInputs {
  path?: Connectable<string>;
  remove_extension?: Connectable<boolean>;
}

export interface BasenameOutputs {
  output: string;
}

export function basename(inputs: BasenameInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<BasenameOutputs, "output"> {
  return createNode("lib.os.Basename", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Dirname — lib.os.Dirname
export interface DirnameInputs {
  path?: Connectable<string>;
}

export interface DirnameOutputs {
  output: string;
}

export function dirname(inputs: DirnameInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DirnameOutputs, "output"> {
  return createNode("lib.os.Dirname", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Join Paths — lib.os.JoinPaths
export interface JoinPathsInputs {
  paths?: Connectable<string[]>;
}

export interface JoinPathsOutputs {
  output: string;
}

export function joinPaths(inputs: JoinPathsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<JoinPathsOutputs, "output"> {
  return createNode("lib.os.JoinPaths", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Normalize Path — lib.os.NormalizePath
export interface NormalizePathInputs {
  path?: Connectable<string>;
}

export interface NormalizePathOutputs {
  output: string;
}

export function normalizePath(inputs: NormalizePathInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<NormalizePathOutputs, "output"> {
  return createNode("lib.os.NormalizePath", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Get Path Info — lib.os.GetPathInfo
export interface GetPathInfoInputs {
  path?: Connectable<string>;
}

export interface GetPathInfoOutputs {
  output: Record<string, unknown>;
}

export function getPathInfo(inputs: GetPathInfoInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GetPathInfoOutputs, "output"> {
  return createNode("lib.os.GetPathInfo", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Absolute Path — lib.os.AbsolutePath
export interface AbsolutePathInputs {
  path?: Connectable<string>;
}

export interface AbsolutePathOutputs {
  output: string;
}

export function absolutePath(inputs: AbsolutePathInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<AbsolutePathOutputs, "output"> {
  return createNode("lib.os.AbsolutePath", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Split Path — lib.os.SplitPath
export interface SplitPathInputs {
  path?: Connectable<string>;
}

export interface SplitPathOutputs {
  output: Record<string, unknown>;
}

export function splitPath(inputs: SplitPathInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SplitPathOutputs, "output"> {
  return createNode("lib.os.SplitPath", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Split Extension — lib.os.SplitExtension
export interface SplitExtensionInputs {
  path?: Connectable<string>;
}

export interface SplitExtensionOutputs {
  output: Record<string, unknown>;
}

export function splitExtension(inputs: SplitExtensionInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SplitExtensionOutputs, "output"> {
  return createNode("lib.os.SplitExtension", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Relative Path — lib.os.RelativePath
export interface RelativePathInputs {
  target_path?: Connectable<string>;
  start_path?: Connectable<string>;
}

export interface RelativePathOutputs {
  output: string;
}

export function relativePath(inputs: RelativePathInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RelativePathOutputs, "output"> {
  return createNode("lib.os.RelativePath", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Path To String — lib.os.PathToString
export interface PathToStringInputs {
  file_path?: Connectable<string>;
}

export interface PathToStringOutputs {
  output: string;
}

export function pathToString(inputs: PathToStringInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<PathToStringOutputs, "output"> {
  return createNode("lib.os.PathToString", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
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

export function showNotification(inputs: ShowNotificationInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ShowNotificationOutputs, "output"> {
  return createNode("lib.os.ShowNotification", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
