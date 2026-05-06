// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, VideoRef } from "../types.js";

// Get Workspace Dir — nodetool.workspace.GetWorkspaceDir
export interface GetWorkspaceDirInputs {
  workspace_dir?: Connectable<string>;
}

export interface GetWorkspaceDirOutputs {
  output: string;
}

export function getWorkspaceDir(inputs: GetWorkspaceDirInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GetWorkspaceDirOutputs, "output"> {
  return createNode("nodetool.workspace.GetWorkspaceDir", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// List Workspace Files — nodetool.workspace.ListWorkspaceFiles
export interface ListWorkspaceFilesInputs {
  path?: Connectable<string>;
  pattern?: Connectable<string>;
  recursive?: Connectable<boolean>;
}

export interface ListWorkspaceFilesOutputs {
  file: string;
  files: unknown[];
}

export function listWorkspaceFiles(inputs: ListWorkspaceFilesInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ListWorkspaceFilesOutputs> {
  return createNode("nodetool.workspace.ListWorkspaceFiles", inputs as Record<string, unknown>, { outputNames: ["file", "files"], streaming: true, ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Read Text File — nodetool.workspace.ReadTextFile
export interface ReadTextFileInputs {
  path?: Connectable<string>;
  encoding?: Connectable<string>;
}

export interface ReadTextFileOutputs {
  output: string;
}

export function readTextFile(inputs: ReadTextFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ReadTextFileOutputs, "output"> {
  return createNode("nodetool.workspace.ReadTextFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Write Text File — nodetool.workspace.WriteTextFile
export interface WriteTextFileInputs {
  path?: Connectable<string>;
  content?: Connectable<string>;
  encoding?: Connectable<string>;
  append?: Connectable<boolean>;
}

export interface WriteTextFileOutputs {
  output: string;
}

export function writeTextFile(inputs: WriteTextFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<WriteTextFileOutputs, "output"> {
  return createNode("nodetool.workspace.WriteTextFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Read Binary File — nodetool.workspace.ReadBinaryFile
export interface ReadBinaryFileInputs {
  path?: Connectable<string>;
}

export interface ReadBinaryFileOutputs {
  output: string;
}

export function readBinaryFile(inputs: ReadBinaryFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ReadBinaryFileOutputs, "output"> {
  return createNode("nodetool.workspace.ReadBinaryFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Write Binary File — nodetool.workspace.WriteBinaryFile
export interface WriteBinaryFileInputs {
  path?: Connectable<string>;
  content?: Connectable<string>;
}

export interface WriteBinaryFileOutputs {
  output: string;
}

export function writeBinaryFile(inputs: WriteBinaryFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<WriteBinaryFileOutputs, "output"> {
  return createNode("nodetool.workspace.WriteBinaryFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Delete Workspace File — nodetool.workspace.DeleteWorkspaceFile
export interface DeleteWorkspaceFileInputs {
  path?: Connectable<string>;
  recursive?: Connectable<boolean>;
}

export interface DeleteWorkspaceFileOutputs {
  output: unknown;
}

export function deleteWorkspaceFile(inputs: DeleteWorkspaceFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DeleteWorkspaceFileOutputs, "output"> {
  return createNode("nodetool.workspace.DeleteWorkspaceFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Create Workspace Directory — nodetool.workspace.CreateWorkspaceDirectory
export interface CreateWorkspaceDirectoryInputs {
  path?: Connectable<string>;
}

export interface CreateWorkspaceDirectoryOutputs {
  output: string;
}

export function createWorkspaceDirectory(inputs: CreateWorkspaceDirectoryInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CreateWorkspaceDirectoryOutputs, "output"> {
  return createNode("nodetool.workspace.CreateWorkspaceDirectory", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Workspace File Exists — nodetool.workspace.WorkspaceFileExists
export interface WorkspaceFileExistsInputs {
  path?: Connectable<string>;
}

export interface WorkspaceFileExistsOutputs {
  output: boolean;
}

export function workspaceFileExists(inputs: WorkspaceFileExistsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<WorkspaceFileExistsOutputs, "output"> {
  return createNode("nodetool.workspace.WorkspaceFileExists", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Get Workspace File Info — nodetool.workspace.GetWorkspaceFileInfo
export interface GetWorkspaceFileInfoInputs {
  path?: Connectable<string>;
}

export interface GetWorkspaceFileInfoOutputs {
  output: Record<string, unknown>;
}

export function getWorkspaceFileInfo(inputs: GetWorkspaceFileInfoInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GetWorkspaceFileInfoOutputs, "output"> {
  return createNode("nodetool.workspace.GetWorkspaceFileInfo", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Copy Workspace File — nodetool.workspace.CopyWorkspaceFile
export interface CopyWorkspaceFileInputs {
  source?: Connectable<string>;
  destination?: Connectable<string>;
}

export interface CopyWorkspaceFileOutputs {
  output: string;
}

export function copyWorkspaceFile(inputs: CopyWorkspaceFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CopyWorkspaceFileOutputs, "output"> {
  return createNode("nodetool.workspace.CopyWorkspaceFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Move Workspace File — nodetool.workspace.MoveWorkspaceFile
export interface MoveWorkspaceFileInputs {
  source?: Connectable<string>;
  destination?: Connectable<string>;
}

export interface MoveWorkspaceFileOutputs {
  output: string;
}

export function moveWorkspaceFile(inputs: MoveWorkspaceFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<MoveWorkspaceFileOutputs, "output"> {
  return createNode("nodetool.workspace.MoveWorkspaceFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Get Workspace File Size — nodetool.workspace.GetWorkspaceFileSize
export interface GetWorkspaceFileSizeInputs {
  path?: Connectable<string>;
}

export interface GetWorkspaceFileSizeOutputs {
  output: number;
}

export function getWorkspaceFileSize(inputs: GetWorkspaceFileSizeInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GetWorkspaceFileSizeOutputs, "output"> {
  return createNode("nodetool.workspace.GetWorkspaceFileSize", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Is Workspace File — nodetool.workspace.IsWorkspaceFile
export interface IsWorkspaceFileInputs {
  path?: Connectable<string>;
}

export interface IsWorkspaceFileOutputs {
  output: boolean;
}

export function isWorkspaceFile(inputs: IsWorkspaceFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<IsWorkspaceFileOutputs, "output"> {
  return createNode("nodetool.workspace.IsWorkspaceFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Is Workspace Directory — nodetool.workspace.IsWorkspaceDirectory
export interface IsWorkspaceDirectoryInputs {
  path?: Connectable<string>;
}

export interface IsWorkspaceDirectoryOutputs {
  output: boolean;
}

export function isWorkspaceDirectory(inputs: IsWorkspaceDirectoryInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<IsWorkspaceDirectoryOutputs, "output"> {
  return createNode("nodetool.workspace.IsWorkspaceDirectory", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Join Workspace Paths — nodetool.workspace.JoinWorkspacePaths
export interface JoinWorkspacePathsInputs {
  paths?: Connectable<string[]>;
}

export interface JoinWorkspacePathsOutputs {
  output: string;
}

export function joinWorkspacePaths(inputs: JoinWorkspacePathsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<JoinWorkspacePathsOutputs, "output"> {
  return createNode("nodetool.workspace.JoinWorkspacePaths", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Save Image File — nodetool.workspace.SaveImageFile
export interface SaveImageFileInputs {
  image?: Connectable<ImageRef>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
  overwrite?: Connectable<boolean>;
}

export interface SaveImageFileOutputs {
  output: ImageRef;
}

export function saveImageFile(inputs: SaveImageFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SaveImageFileOutputs, "output"> {
  return createNode("nodetool.workspace.SaveImageFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Save Video File — nodetool.workspace.SaveVideoFile
export interface SaveVideoFileInputs {
  video?: Connectable<VideoRef>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
  overwrite?: Connectable<boolean>;
}

export interface SaveVideoFileOutputs {
  output: VideoRef;
}

export function saveVideoFile(inputs: SaveVideoFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SaveVideoFileOutputs, "output"> {
  return createNode("nodetool.workspace.SaveVideoFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
