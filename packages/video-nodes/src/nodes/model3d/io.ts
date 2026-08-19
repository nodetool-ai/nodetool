import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import { DEFAULT_FOLDER, DEFAULT_MODEL_3D } from "./defaults.js";
import { dateName, extFormat, filePath, modelRef, modelRefToBytes } from "./utils.js";
import {
  resolveSaveTarget,
  HIDDEN_WHEN_SAVING_TO_WORKSPACE,
  SAVE_TO_WORKSPACE_DESCRIPTION,
  SAVE_TO_WORKSPACE_TITLE
} from "@nodetool-ai/nodes-utils";

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
  declare path: any;

  async process(): Promise<LoadModel3DFileNodeOutputs> {
    const p = filePath(String(this.path ?? ""));
    const data = new Uint8Array(await fs.readFile(p));
    return {
      output: modelRef(data, { uri: pathToFileURL(p).toString(), format: extFormat(p) })
    };
  }
}

/** Output handles SaveModel3DFileNode.process() emits. */
type SaveModel3DFileNodeOutputs = {
  output: { type: string; asset_id: null; metadata: null; data: string };
};

export class SaveModel3DFileNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.SaveModel3DFile";
  static readonly title = "Save Model 3D File";
  static readonly description =
    "Save a 3D model to disk.\n    3d, mesh, model, output, save, file, export\n\n    Use cases:\n    - Save processed 3D models\n    - Export meshes to different formats\n    - Archive 3D model results";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  static readonly inlineFields = ["save_to_workspace", "filename"];
  static readonly inputFields = ["model"];

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to save"
  })
  declare model: any;

  @prop({
    type: "bool",
    default: true,
    title: SAVE_TO_WORKSPACE_TITLE,
    description: SAVE_TO_WORKSPACE_DESCRIPTION
  })
  declare save_to_workspace: any;

  @prop({
    type: "str",
    default: "",
    title: "Folder",
    description: "Folder where the file will be saved",
    json_schema_extra: HIDDEN_WHEN_SAVING_TO_WORKSPACE
  })
  declare folder: any;

  @prop({
    type: "str",
    default: "",
    title: "Filename",
    description:
      "\n        The name of the 3D model file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
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

  async process(context?: ProcessingContext): Promise<SaveModel3DFileNodeOutputs> {
    const targetPath = await resolveSaveTarget({
      folder: this.folder,
      filename: dateName(String(this.filename ?? "model.glb")),
      saveToWorkspace: this.save_to_workspace,
      workspaceDir: context?.workspaceDir,
      overwrite: this.overwrite
    });
    const bytes = await modelRefToBytes(this.model, context);
    await fs.writeFile(targetPath, bytes);

    return {
      output: modelRef(bytes, {
        uri: pathToFileURL(targetPath).toString(),
        format: extFormat(targetPath)
      })
    };
  }
}

/** Output handles SaveModel3DNode.process() emits. */
type SaveModel3DNodeOutputs = {
  output: { type: string; asset_id: null; metadata: null; data: string };
};

export class SaveModel3DNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.SaveModel3D";
  static readonly title = "Save Model3D Asset";
  static readonly description =
    "Save a 3D model to an asset folder with customizable name format.\n    save, 3d, mesh, model, folder, naming, asset\n\n    Use cases:\n    - Save generated 3D models with timestamps\n    - Organize outputs into specific folders\n    - Create backups of processed models";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  static readonly inlineFields = ["name"];
  static readonly inputFields = ["model"];

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to save."
  })
  declare model: any;

  @prop({
    type: "folder",
    default: DEFAULT_FOLDER,
    title: "Folder",
    description: "The asset folder to save the 3D model in."
  })
  declare folder: any;

  @prop({
    type: "str",
    default: "%Y-%m-%d_%H-%M-%S.glb",
    title: "Name",
    description:
      "\n        Name of the output file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare name: any;

  async process(context?: ProcessingContext): Promise<SaveModel3DNodeOutputs> {
    const folder = String(this.folder ?? ".");
    const name = dateName(String(this.name ?? "model.glb"));
    const full = path.resolve(folder, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const bytes = await modelRefToBytes(this.model, context);
    await fs.writeFile(full, bytes);
    return {
      output: modelRef(bytes, {
        uri: pathToFileURL(full).toString(),
        format: extFormat(full)
      })
    };
  }
}
