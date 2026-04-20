import { BaseNode, prop } from "@nodetool/node-sdk";
import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { DEFAULT_FOLDER, DEFAULT_MODEL_3D } from "./defaults.js";
import { dateName, extFormat, filePath, modelBytes, modelRef } from "./utils.js";

const MAX_NON_OVERWRITE_ATTEMPTS = 1000;

async function writeWithSuffixWhenNeeded(
  fullPath: string,
  bytes: Uint8Array
): Promise<string> {
  const parsed = path.parse(fullPath);
  for (let i = 0; i < MAX_NON_OVERWRITE_ATTEMPTS; i++) {
    const candidate =
      i === 0
        ? path.join(parsed.dir, parsed.base)
        : path.join(parsed.dir, `${parsed.name}-${i}${parsed.ext}`);
    try {
      await fs.writeFile(candidate, bytes, { flag: "wx" });
      return candidate;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        const message =
          error instanceof Error ? error.message : String(error);
        throw new Error(
          `Failed to write model file "${candidate}": ${message}`
        );
      }
    }
  }
  throw new Error(
    `Could not find an available filename for "${parsed.base}" after ${MAX_NON_OVERWRITE_ATTEMPTS} attempts`
  );
}

export class LoadModel3DFileNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.LoadModel3DFile";
  static readonly title = "Load Model 3D File";
  static readonly description =
    "Load a 3D model file from disk.\n    3d, mesh, model, input, load, file, obj, glb, stl, ply\n\n    Use cases:\n    - Load 3D models for processing\n    - Import meshes from CAD software\n    - Read 3D assets for a workflow";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to the 3D model file to read"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const p = filePath(String(this.path ?? ""));
    const data = new Uint8Array(await fs.readFile(p));
    return {
      output: modelRef(data, { uri: pathToFileURL(p).toString(), format: extFormat(p) })
    };
  }
}

export class SaveModel3DFileNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.SaveModel3DFile";
  static readonly title = "Save Model 3D File";
  static readonly description =
    "Save a 3D model to disk.\n    3d, mesh, model, output, save, file, export\n\n    Use cases:\n    - Save processed 3D models\n    - Export meshes to different formats\n    - Archive 3D model results";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to save"
  })
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Folder",
    description: "Folder where the file will be saved"
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

  async process(): Promise<Record<string, unknown>> {
    const folder = String(this.folder ?? ".");
    const filename = dateName(String(this.filename ?? "model.glb"));
    const overwrite = this.overwrite === true;
    await fs.mkdir(path.resolve(folder), { recursive: true });
    const bytes = modelBytes(this.model);
    const full = path.resolve(folder, filename);
    const targetPath = overwrite
      ? full
      : await writeWithSuffixWhenNeeded(full, bytes);
    if (overwrite) {
      await fs.writeFile(targetPath, bytes);
    }

    return {
      output: modelRef(bytes, {
        uri: pathToFileURL(targetPath).toString(),
        format: extFormat(targetPath)
      })
    };
  }
}

export class SaveModel3DNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.SaveModel3D";
  static readonly title = "Save Model3D Asset";
  static readonly description =
    "Save a 3D model to an asset folder with customizable name format.\n    save, 3d, mesh, model, folder, naming, asset\n\n    Use cases:\n    - Save generated 3D models with timestamps\n    - Organize outputs into specific folders\n    - Create backups of processed models";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };

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

  async process(): Promise<Record<string, unknown>> {
    const folder = String(this.folder ?? ".");
    const name = dateName(String(this.name ?? "model.glb"));
    const full = path.resolve(folder, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const bytes = modelBytes(this.model);
    await fs.writeFile(full, bytes);
    return {
      output: modelRef(bytes, {
        uri: pathToFileURL(full).toString(),
        format: extFormat(full)
      })
    };
  }
}
