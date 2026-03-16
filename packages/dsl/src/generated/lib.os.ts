// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";

// Workspace Directory — lib.os.WorkspaceDirectory
export interface WorkspaceDirectoryInputs {
}

export function workspaceDirectory(inputs?: WorkspaceDirectoryInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.os.WorkspaceDirectory", (inputs ?? {}) as Record<string, unknown>);
}

// Open Workspace Directory — lib.os.OpenWorkspaceDirectory
export interface OpenWorkspaceDirectoryInputs {
}

export function openWorkspaceDirectory(inputs?: OpenWorkspaceDirectoryInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.os.OpenWorkspaceDirectory", (inputs ?? {}) as Record<string, unknown>);
}

// File Exists — lib.os.FileExists
export interface FileExistsInputs {
  path?: Connectable<string>;
}

export function fileExists(inputs: FileExistsInputs): DslNode<SingleOutput<boolean>> {
  return createNode("lib.os.FileExists", inputs as Record<string, unknown>);
}

// List Files — lib.os.ListFiles
export interface ListFilesInputs {
  folder?: Connectable<string>;
  pattern?: Connectable<string>;
  include_subdirectories?: Connectable<boolean>;
}

export interface ListFilesOutputs {
  file: OutputHandle<string>;
}

export function listFiles(inputs: ListFilesInputs): DslNode<ListFilesOutputs> {
  return createNode("lib.os.ListFiles", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Copy File — lib.os.CopyFile
export interface CopyFileInputs {
  source_path?: Connectable<string>;
  destination_path?: Connectable<string>;
}

export function copyFile(inputs: CopyFileInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.os.CopyFile", inputs as Record<string, unknown>);
}

// Move File — lib.os.MoveFile
export interface MoveFileInputs {
  source_path?: Connectable<string>;
  destination_path?: Connectable<string>;
}

export function moveFile(inputs: MoveFileInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.os.MoveFile", inputs as Record<string, unknown>);
}

// Create Directory — lib.os.CreateDirectory
export interface CreateDirectoryInputs {
  path?: Connectable<string>;
  exist_ok?: Connectable<boolean>;
}

export function createDirectory(inputs: CreateDirectoryInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.os.CreateDirectory", inputs as Record<string, unknown>);
}

// Get File Size — lib.os.GetFileSize
export interface GetFileSizeInputs {
  path?: Connectable<string>;
}

export function getFileSize(inputs: GetFileSizeInputs): DslNode<SingleOutput<number>> {
  return createNode("lib.os.GetFileSize", inputs as Record<string, unknown>);
}

// Created Time — lib.os.CreatedTime
export interface CreatedTimeInputs {
  path?: Connectable<string>;
}

export function createdTime(inputs: CreatedTimeInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.os.CreatedTime", inputs as Record<string, unknown>);
}

// Modified Time — lib.os.ModifiedTime
export interface ModifiedTimeInputs {
  path?: Connectable<string>;
}

export function modifiedTime(inputs: ModifiedTimeInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.os.ModifiedTime", inputs as Record<string, unknown>);
}

// Accessed Time — lib.os.AccessedTime
export interface AccessedTimeInputs {
  path?: Connectable<string>;
}

export function accessedTime(inputs: AccessedTimeInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.os.AccessedTime", inputs as Record<string, unknown>);
}

// Is File — lib.os.IsFile
export interface IsFileInputs {
  path?: Connectable<string>;
}

export function isFile(inputs: IsFileInputs): DslNode<SingleOutput<boolean>> {
  return createNode("lib.os.IsFile", inputs as Record<string, unknown>);
}

// Is Directory — lib.os.IsDirectory
export interface IsDirectoryInputs {
  path?: Connectable<string>;
}

export function isDirectory(inputs: IsDirectoryInputs): DslNode<SingleOutput<boolean>> {
  return createNode("lib.os.IsDirectory", inputs as Record<string, unknown>);
}

// File Extension — lib.os.FileExtension
export interface FileExtensionInputs {
  path?: Connectable<string>;
}

export function fileExtension(inputs: FileExtensionInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.os.FileExtension", inputs as Record<string, unknown>);
}

// File Name — lib.os.FileName
export interface FileNameInputs {
  path?: Connectable<string>;
}

export function fileName(inputs: FileNameInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.os.FileName", inputs as Record<string, unknown>);
}

// Get Directory — lib.os.GetDirectory
export interface GetDirectoryInputs {
  path?: Connectable<string>;
}

export function getDirectory(inputs: GetDirectoryInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.os.GetDirectory", inputs as Record<string, unknown>);
}

// File Name Match — lib.os.FileNameMatch
export interface FileNameMatchInputs {
  filename?: Connectable<string>;
  pattern?: Connectable<string>;
  case_sensitive?: Connectable<boolean>;
}

export function fileNameMatch(inputs: FileNameMatchInputs): DslNode<SingleOutput<boolean>> {
  return createNode("lib.os.FileNameMatch", inputs as Record<string, unknown>);
}

// Filter File Names — lib.os.FilterFileNames
export interface FilterFileNamesInputs {
  filenames?: Connectable<string[]>;
  pattern?: Connectable<string>;
  case_sensitive?: Connectable<boolean>;
}

export function filterFileNames(inputs: FilterFileNamesInputs): DslNode<SingleOutput<string[]>> {
  return createNode("lib.os.FilterFileNames", inputs as Record<string, unknown>);
}

// Basename — lib.os.Basename
export interface BasenameInputs {
  path?: Connectable<string>;
  remove_extension?: Connectable<boolean>;
}

export function basename(inputs: BasenameInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.os.Basename", inputs as Record<string, unknown>);
}

// Dirname — lib.os.Dirname
export interface DirnameInputs {
  path?: Connectable<string>;
}

export function dirname(inputs: DirnameInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.os.Dirname", inputs as Record<string, unknown>);
}

// Join Paths — lib.os.JoinPaths
export interface JoinPathsInputs {
  paths?: Connectable<string[]>;
}

export function joinPaths(inputs: JoinPathsInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.os.JoinPaths", inputs as Record<string, unknown>);
}

// Normalize Path — lib.os.NormalizePath
export interface NormalizePathInputs {
  path?: Connectable<string>;
}

export function normalizePath(inputs: NormalizePathInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.os.NormalizePath", inputs as Record<string, unknown>);
}

// Get Path Info — lib.os.GetPathInfo
export interface GetPathInfoInputs {
  path?: Connectable<string>;
}

export function getPathInfo(inputs: GetPathInfoInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.os.GetPathInfo", inputs as Record<string, unknown>);
}

// Absolute Path — lib.os.AbsolutePath
export interface AbsolutePathInputs {
  path?: Connectable<string>;
}

export function absolutePath(inputs: AbsolutePathInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.os.AbsolutePath", inputs as Record<string, unknown>);
}

// Split Path — lib.os.SplitPath
export interface SplitPathInputs {
  path?: Connectable<string>;
}

export function splitPath(inputs: SplitPathInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.os.SplitPath", inputs as Record<string, unknown>);
}

// Split Extension — lib.os.SplitExtension
export interface SplitExtensionInputs {
  path?: Connectable<string>;
}

export function splitExtension(inputs: SplitExtensionInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("lib.os.SplitExtension", inputs as Record<string, unknown>);
}

// Relative Path — lib.os.RelativePath
export interface RelativePathInputs {
  target_path?: Connectable<string>;
  start_path?: Connectable<string>;
}

export function relativePath(inputs: RelativePathInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.os.RelativePath", inputs as Record<string, unknown>);
}

// Path To String — lib.os.PathToString
export interface PathToStringInputs {
  file_path?: Connectable<string>;
}

export function pathToString(inputs: PathToStringInputs): DslNode<SingleOutput<string>> {
  return createNode("lib.os.PathToString", inputs as Record<string, unknown>);
}

// Show Notification — lib.os.ShowNotification
export interface ShowNotificationInputs {
  title?: Connectable<string>;
  message?: Connectable<string>;
  timeout?: Connectable<number>;
}

export function showNotification(inputs: ShowNotificationInputs): DslNode<SingleOutput<unknown>> {
  return createNode("lib.os.ShowNotification", inputs as Record<string, unknown>);
}
