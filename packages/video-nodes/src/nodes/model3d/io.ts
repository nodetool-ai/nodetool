import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import { DEFAULT_MODEL_3D } from "./defaults.js";
import {
  dateName,
  extFormat,
  filePath,
  modelFormat,
  modelRef,
  modelRefToBytes
} from "./utils.js";
import {
  saveFilename,
  writeSavedFileAsset,
  savedMediaRef,
  workspaceFolderOf,
  type FolderValue,
  VISIBLE_WHEN_NOT_SAVING_TO_WORKSPACE,
  SAVE_TO_WORKSPACE_DESCRIPTION,
  SAVE_TO_WORKSPACE_TITLE
} from "@nodetool-ai/nodes-utils";
import type { Model3DRefLike } from "./types.js";

/** Output handles LoadModel3DFileNode.process() emits. */
type LoadModel3DFileNodeOutputs = {
  output: { type: string; asset_id: null; metadata: null; data: string };
};

export class LoadModel3DFileNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.LoadModel3DFile";
  static readonly title = "Load Model 3D File";
  static readonly description =
    "Load a 3D model file from disk.\n    3d, mesh, model, input, load, file, obj, glb, stl, ply\n\n    Use cases:\n    - Load 3D models for processing\n    - Import meshes from CAD software\n    - Read 3D assets for a workflow";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  static readonly inlineFields = ["path"];
  static readonly inputFields = [];

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to the 3D model file to read"
  })
  declare path: string;

  async process(): Promise<LoadModel3DFileNodeOutputs> {
    const p = filePath(this.path);
    const data = new Uint8Array(await fs.readFile(p));
    return {
      output: modelRef(data, { uri: pathToFileURL(p).toString(), format: extFormat(p) })
    };
  }
}

/** Output handles SaveModel3DNode.process() emits. */
type SaveModel3DNodeOutputs = {
  output: { type: string; asset_id: null; metadata: null; data: string };
  path: string;
};

export class SaveModel3DNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.SaveModel3D";
  static readonly title = "Save Model 3D";
  static readonly description =
    "Save a 3D model into the project folder, or to a folder on disk.\n    3d, mesh, model, output, save, file, export, asset\n\n    Use cases:\n    - Save processed 3D models\n    - Export meshes to different formats\n    - Archive 3D model results";
  static readonly metadataOutputTypes = {
    output: "model_3d",
    path: "str"
  };
  static readonly inlineFields = ["save_to_workspace", "filename"];
  static readonly inputFields = ["model"];

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to save"
  })
  declare model: Model3DRefLike;

  @prop({
    type: "bool",
    default: true,
    title: SAVE_TO_WORKSPACE_TITLE,
    description: SAVE_TO_WORKSPACE_DESCRIPTION
  })
  declare save_to_workspace: boolean;

  @prop({
    type: "str",
    default: "",
    title: "Folder",
    description: "Folder where the file will be saved",
    json_schema_extra: VISIBLE_WHEN_NOT_SAVING_TO_WORKSPACE
  })
  declare folder: FolderValue;

  @prop({
    type: "str",
    default: "",
    title: "Filename",
    description:
      "\n        The name of the 3D model file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare filename: string;

  @prop({
    type: "bool",
    default: false,
    title: "Overwrite",
    description:
      "Overwrite the file if it already exists, otherwise file will be renamed"
  })
  declare overwrite: boolean;

  async process(context?: ProcessingContext): Promise<SaveModel3DNodeOutputs> {
    const bytes = await modelRefToBytes(this.model, context);
    const { path: targetPath, asset_id } = await writeSavedFileAsset({
      folder: this.folder,
      filename: saveFilename({
        filename: dateName(this.filename),
        fallback: dateName("model_%Y-%m-%d_%H-%M-%S"),
        extension: `.${modelFormat(this.model)}`
      }),
      workspaceFolder: await workspaceFolderOf(this.folder, context),
      saveToWorkspace: this.save_to_workspace,
      workspace: context?.workspace,
      workspaceDir: context?.workspaceDir,
      context: context ?? null,
      overwrite: this.overwrite,
      bytes
    });

    return {
      output: savedMediaRef(
        modelRef(bytes, {
          uri: pathToFileURL(targetPath).toString(),
          format: extFormat(targetPath)
        }),
        asset_id
      ),
      path: targetPath
    };
  }
}

