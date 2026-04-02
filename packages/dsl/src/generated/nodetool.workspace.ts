// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, VideoRef } from "../types.js";

// Get Workspace Dir — nodetool.workspace.GetWorkspaceDir
export interface GetWorkspaceDirInputs {}

export interface GetWorkspaceDirOutputs {
  output: string;
}

export function getWorkspaceDir(
  inputs?: GetWorkspaceDirInputs
): DslNode<GetWorkspaceDirOutputs, "output"> {
  return createNode(
    "nodetool.workspace.GetWorkspaceDir",
    (inputs ?? {}) as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// List Workspace Files — nodetool.workspace.ListWorkspaceFiles
export interface ListWorkspaceFilesInputs {
  path?: Connectable<string>;
  pattern?: Connectable<string>;
  recursive?: Connectable<boolean>;
}

export interface ListWorkspaceFilesOutputs {
  file: string;
}

export function listWorkspaceFiles(
  inputs: ListWorkspaceFilesInputs
): DslNode<ListWorkspaceFilesOutputs, "file"> {
  return createNode(
    "nodetool.workspace.ListWorkspaceFiles",
    inputs as Record<string, unknown>,
    { outputNames: ["file"], defaultOutput: "file", streaming: true }
  );
}

// Read Text File — nodetool.workspace.ReadTextFile
export interface ReadTextFileInputs {
  path?: Connectable<string>;
  encoding?: Connectable<string>;
}

export interface ReadTextFileOutputs {
  output: string;
}

export function readTextFile(
  inputs: ReadTextFileInputs
): DslNode<ReadTextFileOutputs, "output"> {
  return createNode(
    "nodetool.workspace.ReadTextFile",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function writeTextFile(
  inputs: WriteTextFileInputs
): DslNode<WriteTextFileOutputs, "output"> {
  return createNode(
    "nodetool.workspace.WriteTextFile",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Read Binary File — nodetool.workspace.ReadBinaryFile
export interface ReadBinaryFileInputs {
  path?: Connectable<string>;
}

export interface ReadBinaryFileOutputs {
  output: string;
}

export function readBinaryFile(
  inputs: ReadBinaryFileInputs
): DslNode<ReadBinaryFileOutputs, "output"> {
  return createNode(
    "nodetool.workspace.ReadBinaryFile",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Write Binary File — nodetool.workspace.WriteBinaryFile
export interface WriteBinaryFileInputs {
  path?: Connectable<string>;
  content?: Connectable<string>;
}

export interface WriteBinaryFileOutputs {
  output: string;
}

export function writeBinaryFile(
  inputs: WriteBinaryFileInputs
): DslNode<WriteBinaryFileOutputs, "output"> {
  return createNode(
    "nodetool.workspace.WriteBinaryFile",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Delete Workspace File — nodetool.workspace.DeleteWorkspaceFile
export interface DeleteWorkspaceFileInputs {
  path?: Connectable<string>;
  recursive?: Connectable<boolean>;
}

export interface DeleteWorkspaceFileOutputs {
  output: unknown;
}

export function deleteWorkspaceFile(
  inputs: DeleteWorkspaceFileInputs
): DslNode<DeleteWorkspaceFileOutputs, "output"> {
  return createNode(
    "nodetool.workspace.DeleteWorkspaceFile",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Create Workspace Directory — nodetool.workspace.CreateWorkspaceDirectory
export interface CreateWorkspaceDirectoryInputs {
  path?: Connectable<string>;
}

export interface CreateWorkspaceDirectoryOutputs {
  output: string;
}

export function createWorkspaceDirectory(
  inputs: CreateWorkspaceDirectoryInputs
): DslNode<CreateWorkspaceDirectoryOutputs, "output"> {
  return createNode(
    "nodetool.workspace.CreateWorkspaceDirectory",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Workspace File Exists — nodetool.workspace.WorkspaceFileExists
export interface WorkspaceFileExistsInputs {
  path?: Connectable<string>;
}

export interface WorkspaceFileExistsOutputs {
  output: boolean;
}

export function workspaceFileExists(
  inputs: WorkspaceFileExistsInputs
): DslNode<WorkspaceFileExistsOutputs, "output"> {
  return createNode(
    "nodetool.workspace.WorkspaceFileExists",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Get Workspace File Info — nodetool.workspace.GetWorkspaceFileInfo
export interface GetWorkspaceFileInfoInputs {
  path?: Connectable<string>;
}

export interface GetWorkspaceFileInfoOutputs {
  output: Record<string, unknown>;
}

export function getWorkspaceFileInfo(
  inputs: GetWorkspaceFileInfoInputs
): DslNode<GetWorkspaceFileInfoOutputs, "output"> {
  return createNode(
    "nodetool.workspace.GetWorkspaceFileInfo",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Copy Workspace File — nodetool.workspace.CopyWorkspaceFile
export interface CopyWorkspaceFileInputs {
  source?: Connectable<string>;
  destination?: Connectable<string>;
}

export interface CopyWorkspaceFileOutputs {
  output: string;
}

export function copyWorkspaceFile(
  inputs: CopyWorkspaceFileInputs
): DslNode<CopyWorkspaceFileOutputs, "output"> {
  return createNode(
    "nodetool.workspace.CopyWorkspaceFile",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Move Workspace File — nodetool.workspace.MoveWorkspaceFile
export interface MoveWorkspaceFileInputs {
  source?: Connectable<string>;
  destination?: Connectable<string>;
}

export interface MoveWorkspaceFileOutputs {
  output: string;
}

export function moveWorkspaceFile(
  inputs: MoveWorkspaceFileInputs
): DslNode<MoveWorkspaceFileOutputs, "output"> {
  return createNode(
    "nodetool.workspace.MoveWorkspaceFile",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Get Workspace File Size — nodetool.workspace.GetWorkspaceFileSize
export interface GetWorkspaceFileSizeInputs {
  path?: Connectable<string>;
}

export interface GetWorkspaceFileSizeOutputs {
  output: number;
}

export function getWorkspaceFileSize(
  inputs: GetWorkspaceFileSizeInputs
): DslNode<GetWorkspaceFileSizeOutputs, "output"> {
  return createNode(
    "nodetool.workspace.GetWorkspaceFileSize",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Is Workspace File — nodetool.workspace.IsWorkspaceFile
export interface IsWorkspaceFileInputs {
  path?: Connectable<string>;
}

export interface IsWorkspaceFileOutputs {
  output: boolean;
}

export function isWorkspaceFile(
  inputs: IsWorkspaceFileInputs
): DslNode<IsWorkspaceFileOutputs, "output"> {
  return createNode(
    "nodetool.workspace.IsWorkspaceFile",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Is Workspace Directory — nodetool.workspace.IsWorkspaceDirectory
export interface IsWorkspaceDirectoryInputs {
  path?: Connectable<string>;
}

export interface IsWorkspaceDirectoryOutputs {
  output: boolean;
}

export function isWorkspaceDirectory(
  inputs: IsWorkspaceDirectoryInputs
): DslNode<IsWorkspaceDirectoryOutputs, "output"> {
  return createNode(
    "nodetool.workspace.IsWorkspaceDirectory",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}

// Join Workspace Paths — nodetool.workspace.JoinWorkspacePaths
export interface JoinWorkspacePathsInputs {
  paths?: Connectable<string[]>;
}

export interface JoinWorkspacePathsOutputs {
  output: string;
}

export function joinWorkspacePaths(
  inputs: JoinWorkspacePathsInputs
): DslNode<JoinWorkspacePathsOutputs, "output"> {
  return createNode(
    "nodetool.workspace.JoinWorkspacePaths",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function saveImageFile(
  inputs: SaveImageFileInputs
): DslNode<SaveImageFileOutputs, "output"> {
  return createNode(
    "nodetool.workspace.SaveImageFile",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
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

export function saveVideoFile(
  inputs: SaveVideoFileInputs
): DslNode<SaveVideoFileOutputs, "output"> {
  return createNode(
    "nodetool.workspace.SaveVideoFile",
    inputs as Record<string, unknown>,
    { outputNames: ["output"], defaultOutput: "output" }
  );
}
