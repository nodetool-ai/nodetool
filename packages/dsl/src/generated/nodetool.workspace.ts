// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";
import type { ImageRef, VideoRef } from "../types.js";

// Get Workspace Dir — nodetool.workspace.GetWorkspaceDir
export interface GetWorkspaceDirInputs {
}

export function getWorkspaceDir(inputs?: GetWorkspaceDirInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.workspace.GetWorkspaceDir", (inputs ?? {}) as Record<string, unknown>);
}

// List Workspace Files — nodetool.workspace.ListWorkspaceFiles
export interface ListWorkspaceFilesInputs {
  path?: Connectable<string>;
  pattern?: Connectable<string>;
  recursive?: Connectable<boolean>;
}

export interface ListWorkspaceFilesOutputs {
  file: OutputHandle<string>;
}

export function listWorkspaceFiles(inputs: ListWorkspaceFilesInputs): DslNode<ListWorkspaceFilesOutputs> {
  return createNode("nodetool.workspace.ListWorkspaceFiles", inputs as Record<string, unknown>, { multiOutput: true, streaming: true });
}

// Read Text File — nodetool.workspace.ReadTextFile
export interface ReadTextFileInputs {
  path?: Connectable<string>;
  encoding?: Connectable<string>;
}

export function readTextFile(inputs: ReadTextFileInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.workspace.ReadTextFile", inputs as Record<string, unknown>);
}

// Write Text File — nodetool.workspace.WriteTextFile
export interface WriteTextFileInputs {
  path?: Connectable<string>;
  content?: Connectable<string>;
  encoding?: Connectable<string>;
  append?: Connectable<boolean>;
}

export function writeTextFile(inputs: WriteTextFileInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.workspace.WriteTextFile", inputs as Record<string, unknown>);
}

// Read Binary File — nodetool.workspace.ReadBinaryFile
export interface ReadBinaryFileInputs {
  path?: Connectable<string>;
}

export function readBinaryFile(inputs: ReadBinaryFileInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.workspace.ReadBinaryFile", inputs as Record<string, unknown>);
}

// Write Binary File — nodetool.workspace.WriteBinaryFile
export interface WriteBinaryFileInputs {
  path?: Connectable<string>;
  content?: Connectable<string>;
}

export function writeBinaryFile(inputs: WriteBinaryFileInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.workspace.WriteBinaryFile", inputs as Record<string, unknown>);
}

// Delete Workspace File — nodetool.workspace.DeleteWorkspaceFile
export interface DeleteWorkspaceFileInputs {
  path?: Connectable<string>;
  recursive?: Connectable<boolean>;
}

export function deleteWorkspaceFile(inputs: DeleteWorkspaceFileInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.workspace.DeleteWorkspaceFile", inputs as Record<string, unknown>);
}

// Create Workspace Directory — nodetool.workspace.CreateWorkspaceDirectory
export interface CreateWorkspaceDirectoryInputs {
  path?: Connectable<string>;
}

export function createWorkspaceDirectory(inputs: CreateWorkspaceDirectoryInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.workspace.CreateWorkspaceDirectory", inputs as Record<string, unknown>);
}

// Workspace File Exists — nodetool.workspace.WorkspaceFileExists
export interface WorkspaceFileExistsInputs {
  path?: Connectable<string>;
}

export function workspaceFileExists(inputs: WorkspaceFileExistsInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.workspace.WorkspaceFileExists", inputs as Record<string, unknown>);
}

// Get Workspace File Info — nodetool.workspace.GetWorkspaceFileInfo
export interface GetWorkspaceFileInfoInputs {
  path?: Connectable<string>;
}

export function getWorkspaceFileInfo(inputs: GetWorkspaceFileInfoInputs): DslNode<SingleOutput<Record<string, unknown>>> {
  return createNode("nodetool.workspace.GetWorkspaceFileInfo", inputs as Record<string, unknown>);
}

// Copy Workspace File — nodetool.workspace.CopyWorkspaceFile
export interface CopyWorkspaceFileInputs {
  source?: Connectable<string>;
  destination?: Connectable<string>;
}

export function copyWorkspaceFile(inputs: CopyWorkspaceFileInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.workspace.CopyWorkspaceFile", inputs as Record<string, unknown>);
}

// Move Workspace File — nodetool.workspace.MoveWorkspaceFile
export interface MoveWorkspaceFileInputs {
  source?: Connectable<string>;
  destination?: Connectable<string>;
}

export function moveWorkspaceFile(inputs: MoveWorkspaceFileInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.workspace.MoveWorkspaceFile", inputs as Record<string, unknown>);
}

// Get Workspace File Size — nodetool.workspace.GetWorkspaceFileSize
export interface GetWorkspaceFileSizeInputs {
  path?: Connectable<string>;
}

export function getWorkspaceFileSize(inputs: GetWorkspaceFileSizeInputs): DslNode<SingleOutput<number>> {
  return createNode("nodetool.workspace.GetWorkspaceFileSize", inputs as Record<string, unknown>);
}

// Is Workspace File — nodetool.workspace.IsWorkspaceFile
export interface IsWorkspaceFileInputs {
  path?: Connectable<string>;
}

export function isWorkspaceFile(inputs: IsWorkspaceFileInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.workspace.IsWorkspaceFile", inputs as Record<string, unknown>);
}

// Is Workspace Directory — nodetool.workspace.IsWorkspaceDirectory
export interface IsWorkspaceDirectoryInputs {
  path?: Connectable<string>;
}

export function isWorkspaceDirectory(inputs: IsWorkspaceDirectoryInputs): DslNode<SingleOutput<boolean>> {
  return createNode("nodetool.workspace.IsWorkspaceDirectory", inputs as Record<string, unknown>);
}

// Join Workspace Paths — nodetool.workspace.JoinWorkspacePaths
export interface JoinWorkspacePathsInputs {
  paths?: Connectable<string[]>;
}

export function joinWorkspacePaths(inputs: JoinWorkspacePathsInputs): DslNode<SingleOutput<string>> {
  return createNode("nodetool.workspace.JoinWorkspacePaths", inputs as Record<string, unknown>);
}

// Save Image File — nodetool.workspace.SaveImageFile
export interface SaveImageFileInputs {
  image?: Connectable<ImageRef>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
  overwrite?: Connectable<boolean>;
}

export function saveImageFile(inputs: SaveImageFileInputs): DslNode<SingleOutput<ImageRef>> {
  return createNode("nodetool.workspace.SaveImageFile", inputs as Record<string, unknown>);
}

// Save Video File — nodetool.workspace.SaveVideoFile
export interface SaveVideoFileInputs {
  video?: Connectable<VideoRef>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
  overwrite?: Connectable<boolean>;
}

export function saveVideoFile(inputs: SaveVideoFileInputs): DslNode<SingleOutput<VideoRef>> {
  return createNode("nodetool.workspace.SaveVideoFile", inputs as Record<string, unknown>);
}
