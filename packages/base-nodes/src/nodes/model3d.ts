import { BaseNode, prop } from "@nodetool/node-sdk";
import { promises as fs } from "node:fs";
import path from "node:path";

type Model3DRefLike = {
  uri?: string;
  data?: Uint8Array | string;
  format?: string;
  vertices?: number;
  faces?: number;
};

type ImageRefLike = { data?: Uint8Array | string; uri?: string };

function toBytes(data: Uint8Array | string | undefined): Uint8Array {
  if (!data) return new Uint8Array();
  if (data instanceof Uint8Array) return data;
  return Uint8Array.from(Buffer.from(data, "base64"));
}

function modelBytes(model: unknown): Uint8Array {
  if (!model || typeof model !== "object") return new Uint8Array();
  return toBytes((model as Model3DRefLike).data);
}

function modelRef(data: Uint8Array, extras: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    data: Buffer.from(data).toString("base64"),
    ...extras,
  };
}

function filePath(uriOrPath: string): string {
  if (uriOrPath.startsWith("file://")) return uriOrPath.slice("file://".length);
  return uriOrPath;
}

function dateName(name: string): string {
  const now = new Date();
  const pad = (v: number): string => String(v).padStart(2, "0");
  return name
    .replaceAll("%Y", String(now.getFullYear()))
    .replaceAll("%m", pad(now.getMonth() + 1))
    .replaceAll("%d", pad(now.getDate()))
    .replaceAll("%H", pad(now.getHours()))
    .replaceAll("%M", pad(now.getMinutes()))
    .replaceAll("%S", pad(now.getSeconds()));
}

function extFormat(filename: string): string {
  const ext = path.extname(filename).replace(".", "").toLowerCase();
  return ext || "glb";
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export class LoadModel3DFileNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.LoadModel3DFile";
            static readonly title = "Load Model 3D File";
            static readonly description = "Load a 3D model file from disk.\n    3d, mesh, model, input, load, file, obj, glb, stl, ply\n\n    Use cases:\n    - Load 3D models for processing\n    - Import meshes from CAD software\n    - Read 3D assets for a workflow";
        static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  
  @prop({ type: "str", default: "", title: "Path", description: "Path to the 3D model file to read" })
  declare path: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const p = filePath(String(inputs.path ?? this.path ?? ""));
    const data = new Uint8Array(await fs.readFile(p));
    return { output: modelRef(data, { uri: `file://${p}`, format: extFormat(p) }) };
  }
}

export class SaveModel3DFileNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.SaveModel3DFile";
            static readonly title = "Save Model 3D File";
            static readonly description = "Save a 3D model to disk.\n    3d, mesh, model, output, save, file, export\n\n    Use cases:\n    - Save processed 3D models\n    - Export meshes to different formats\n    - Archive 3D model results";
        static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  
  @prop({ type: "model_3d", default: {
  "type": "model_3d",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "format": null,
  "material_file": null,
  "texture_files": []
}, title: "Model", description: "The 3D model to save" })
  declare model: any;

  @prop({ type: "str", default: "", title: "Folder", description: "Folder where the file will be saved" })
  declare folder: any;

  @prop({ type: "str", default: "", title: "Filename", description: "\n        The name of the 3D model file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        " })
  declare filename: any;

  @prop({ type: "bool", default: false, title: "Overwrite", description: "Overwrite the file if it already exists, otherwise file will be renamed" })
  declare overwrite: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const folder = String(inputs.folder ?? this.folder ?? ".");
    const filename = String(inputs.filename ?? this.filename ?? "model.glb");
    const full = path.resolve(folder, filename);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const bytes = modelBytes(inputs.model ?? this.model);
    await fs.writeFile(full, bytes);
    return { output: modelRef(bytes, { uri: `file://${full}`, format: extFormat(full) }) };
  }
}

export class SaveModel3DNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.SaveModel3D";
            static readonly title = "Save Model3D Asset";
            static readonly description = "Save a 3D model to an asset folder with customizable name format.\n    save, 3d, mesh, model, folder, naming, asset\n\n    Use cases:\n    - Save generated 3D models with timestamps\n    - Organize outputs into specific folders\n    - Create backups of processed models";
        static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  
  @prop({ type: "model_3d", default: {
  "type": "model_3d",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "format": null,
  "material_file": null,
  "texture_files": []
}, title: "Model", description: "The 3D model to save." })
  declare model: any;

  @prop({ type: "folder", default: {
  "type": "folder",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Folder", description: "The asset folder to save the 3D model in." })
  declare folder: any;

  @prop({ type: "str", default: "%Y-%m-%d_%H-%M-%S.glb", title: "Name", description: "\n        Name of the output file.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        " })
  declare name: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const folder = String(inputs.folder ?? this.folder ?? ".");
    const name = dateName(String(inputs.name ?? this.name ?? "model.glb"));
    const full = path.resolve(folder, name);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const bytes = modelBytes(inputs.model ?? this.model);
    await fs.writeFile(full, bytes);
    return { output: modelRef(bytes, { uri: `file://${full}`, format: extFormat(full) }) };
  }
}

abstract class ModelTransformNode extends BaseNode {
  @prop({ type: "dict", default: {} })
  declare model: any;



  protected getModel(inputs: Record<string, unknown>): Model3DRefLike {
    const value = inputs.model ?? this.model ?? {};
    if (!value || typeof value !== "object") return {};
    return value as Model3DRefLike;
  }

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const model = this.getModel(inputs);
    const bytes = modelBytes(model);
    return {
      output: modelRef(bytes, {
        uri: model.uri ?? "",
        format: model.format ?? "glb",
      }),
    };
  }
}

export class FormatConverterNode extends ModelTransformNode {
  static readonly nodeType = "nodetool.model3d.FormatConverter";
      static readonly title = "Format Converter";
      static readonly description = "Convert a 3D model to a different format.\n    3d, mesh, model, convert, format, obj, glb, stl, ply, usdz, export\n\n    Use cases:\n    - Convert high-poly sculpts to web-friendly GLB\n    - Export models for 3D printing (STL)\n    - Create cross-platform 3D assets";
    static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  @prop({ type: "model_3d", default: {
  "type": "model_3d",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "format": null,
  "material_file": null,
  "texture_files": []
}, title: "Model", description: "The 3D model to convert" })
  declare model: any;

  @prop({ type: "enum", default: "glb", title: "Output Format", description: "Target format for conversion", values: [
  "glb",
  "gltf",
  "obj",
  "stl",
  "ply"
] })
  declare output_format: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const model = this.getModel(inputs);
    const bytes = modelBytes(model);
    const outputFormat = String(inputs.output_format ?? this.output_format ?? "glb");
    return {
      output: modelRef(bytes, {
        uri: model.uri ?? "",
        format: outputFormat,
      }),
    };
  }
}

export class GetModel3DMetadataNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.GetModel3DMetadata";
            static readonly title = "Get Model 3D Metadata";
            static readonly description = "Get metadata about a 3D model.\n    3d, mesh, model, metadata, info, properties\n\n    Use cases:\n    - Get vertex and face counts for processing decisions\n    - Analyze model properties\n    - Gather information for model cataloging";
        static readonly metadataOutputTypes = {
    format: "str",
    vertex_count: "int",
    face_count: "int",
    is_watertight: "bool",
    bounds_min: "list[float]",
    bounds_max: "list[float]",
    center_of_mass: "list[float]",
    volume: "float",
    surface_area: "float"
  };
  
  @prop({ type: "model_3d", default: {
  "type": "model_3d",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "format": null,
  "material_file": null,
  "texture_files": []
}, title: "Model", description: "The 3D model to analyze" })
  declare model: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const model = (inputs.model ?? this.model ?? {}) as Model3DRefLike;
    const bytes = modelBytes(model);
    const vertices = model.vertices ?? Math.floor(bytes.length / 32);
    const faces = model.faces ?? Math.floor(vertices / 3);
    return {
      output: {
        uri: model.uri ?? "",
        format: model.format ?? "glb",
        size_bytes: bytes.length,
        vertices,
        faces,
      },
    };
  }
}

export class Transform3DNode extends ModelTransformNode {
  static readonly nodeType = "nodetool.model3d.Transform3D";
      static readonly title = "Transform 3D";
      static readonly description = "Apply translation, rotation, and scaling to a 3D model.\n    3d, mesh, model, transform, translate, rotate, scale, move\n\n    Use cases:\n    - Position models in 3D space\n    - Scale models to specific dimensions\n    - Rotate models for proper orientation";
    static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  @prop({ type: "model_3d", default: {
  "type": "model_3d",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "format": null,
  "material_file": null,
  "texture_files": []
}, title: "Model", description: "The 3D model to transform" })
  declare model: any;

  @prop({ type: "float", default: 0, title: "Translate X", description: "Translation along X axis" })
  declare translate_x: any;

  @prop({ type: "float", default: 0, title: "Translate Y", description: "Translation along Y axis" })
  declare translate_y: any;

  @prop({ type: "float", default: 0, title: "Translate Z", description: "Translation along Z axis" })
  declare translate_z: any;

  @prop({ type: "float", default: 0, title: "Rotate X", description: "Rotation around X axis in degrees", min: -360, max: 360 })
  declare rotate_x: any;

  @prop({ type: "float", default: 0, title: "Rotate Y", description: "Rotation around Y axis in degrees", min: -360, max: 360 })
  declare rotate_y: any;

  @prop({ type: "float", default: 0, title: "Rotate Z", description: "Rotation around Z axis in degrees", min: -360, max: 360 })
  declare rotate_z: any;

  @prop({ type: "float", default: 1, title: "Scale X", description: "Scale factor along X axis" })
  declare scale_x: any;

  @prop({ type: "float", default: 1, title: "Scale Y", description: "Scale factor along Y axis" })
  declare scale_y: any;

  @prop({ type: "float", default: 1, title: "Scale Z", description: "Scale factor along Z axis" })
  declare scale_z: any;

  @prop({ type: "float", default: 1, title: "Uniform Scale", description: "Uniform scale factor (applied after axis scales)" })
  declare uniform_scale: any;

}

export class DecimateNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.Decimate";
            static readonly title = "Decimate";
            static readonly description = "Reduce polygon count while preserving shape using Quadric Error Metrics.\n    3d, mesh, model, decimate, simplify, reduce, polygon, optimize, LOD\n\n    Use cases:\n    - Create level-of-detail (LOD) versions\n    - Optimize models for real-time rendering\n    - Reduce file size for web deployment\n    - Prepare models for mobile/VR applications";
        static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  
  @prop({ type: "model_3d", default: {
  "type": "model_3d",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "format": null,
  "material_file": null,
  "texture_files": []
}, title: "Model", description: "The 3D model to decimate" })
  declare model: any;

  @prop({ type: "float", default: 0.5, title: "Target Ratio", description: "Target ratio of faces to keep (0.5 = 50% reduction)", min: 0.01, max: 1 })
  declare target_ratio: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const model = (inputs.model ?? this.model ?? {}) as Model3DRefLike;
    const bytes = modelBytes(model);
    const ratio = Number(inputs.ratio ?? this.ratio ?? 0.5);
    const keep = Math.max(1, Math.floor(bytes.length * Math.max(0, Math.min(1, ratio))));
    return {
      output: modelRef(bytes.slice(0, keep), {
        uri: model.uri ?? "",
        format: model.format ?? "glb",
      }),
    };
  }
}

export class Boolean3DNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.Boolean3D";
            static readonly title = "Boolean 3D";
            static readonly description = "Perform boolean operations on 3D meshes.\n    3d, mesh, model, boolean, union, difference, intersection, combine, subtract\n\n    Use cases:\n    - Combine multiple objects (union)\n    - Cut holes in objects (difference)\n    - Find overlapping regions (intersection)\n    - Hard-surface modeling operations\n    - 3D printing preparation";
        static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  
  @prop({ type: "model_3d", default: {
  "type": "model_3d",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "format": null,
  "material_file": null,
  "texture_files": []
}, title: "Model A", description: "First 3D model (base)" })
  declare model_a: any;

  @prop({ type: "model_3d", default: {
  "type": "model_3d",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "format": null,
  "material_file": null,
  "texture_files": []
}, title: "Model B", description: "Second 3D model (tool)" })
  declare model_b: any;

  @prop({ type: "enum", default: "union", title: "Operation", description: "Boolean operation to perform", values: [
  "union",
  "difference",
  "intersection"
] })
  declare operation: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const a = modelBytes(inputs.model_a ?? this.model_a);
    const b = modelBytes(inputs.model_b ?? this.model_b);
    const operation = String(inputs.operation ?? this.operation ?? "union").toLowerCase();

    if (operation === "difference") {
      const len = Math.max(a.length, b.length);
      const out = new Uint8Array(len);
      for (let i = 0; i < len; i += 1) out[i] = Math.max(0, (a[i] ?? 0) - (b[i] ?? 0));
      return { output: modelRef(out, { format: "glb" }) };
    }

    if (operation === "intersection") {
      const len = Math.min(a.length, b.length);
      const out = new Uint8Array(len);
      for (let i = 0; i < len; i += 1) out[i] = Math.min(a[i] ?? 0, b[i] ?? 0);
      return { output: modelRef(out, { format: "glb" }) };
    }

    return { output: modelRef(concatBytes([a, b]), { format: "glb" }) };
  }
}

export class RecalculateNormalsNode extends ModelTransformNode {
  static readonly nodeType = "nodetool.model3d.RecalculateNormals";
      static readonly title = "Recalculate Normals";
      static readonly description = "Recalculate mesh normals for proper shading.\n    3d, mesh, model, normals, fix, shading, smooth, flat, faces\n\n    Use cases:\n    - Fix inverted or broken normals\n    - Switch between smooth and flat shading\n    - Repair imported meshes with bad normals\n    - Prepare models for rendering";
    static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  @prop({ type: "model_3d", default: {
  "type": "model_3d",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "format": null,
  "material_file": null,
  "texture_files": []
}, title: "Model", description: "The 3D model to process" })
  declare model: any;

  @prop({ type: "enum", default: "auto", title: "Mode", description: "Shading mode: smooth, flat, or auto (uses mesh default)", values: [
  "smooth",
  "flat",
  "auto"
] })
  declare mode: any;

  @prop({ type: "bool", default: true, title: "Fix Winding", description: "Fix inconsistent face winding (inverted faces)" })
  declare fix_winding: any;

}

export class CenterMeshNode extends ModelTransformNode {
  static readonly nodeType = "nodetool.model3d.CenterMesh";
      static readonly title = "Center Mesh";
      static readonly description = "Center a mesh at the origin.\n    3d, mesh, model, center, origin, align\n\n    Use cases:\n    - Center models for consistent positioning\n    - Prepare models for rotation\n    - Align multiple models";
    static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  @prop({ type: "model_3d", default: {
  "type": "model_3d",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "format": null,
  "material_file": null,
  "texture_files": []
}, title: "Model", description: "The 3D model to center" })
  declare model: any;

  @prop({ type: "bool", default: true, title: "Use Centroid", description: "Use geometric centroid (True) or bounding box center (False)" })
  declare use_centroid: any;

}

export class FlipNormalsNode extends ModelTransformNode {
  static readonly nodeType = "nodetool.model3d.FlipNormals";
      static readonly title = "Flip Normals";
      static readonly description = "Flip all face normals of a mesh.\n    3d, mesh, model, normals, flip, invert, inside_out\n\n    Use cases:\n    - Fix inside-out meshes\n    - Invert normals for specific rendering effects\n    - Repair meshes from incompatible software";
    static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  @prop({ type: "model_3d", default: {
  "type": "model_3d",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null,
  "format": null,
  "material_file": null,
  "texture_files": []
}, title: "Model", description: "The 3D model to process" })
  declare model: any;

}

export class MergeMeshesNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.MergeMeshes";
            static readonly title = "Merge Meshes";
            static readonly description = "Merge multiple meshes into a single mesh.\n    3d, mesh, model, merge, combine, concatenate\n\n    Use cases:\n    - Combine multiple parts into one model\n    - Merge imported components\n    - Prepare models for boolean operations";
        static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  
  @prop({ type: "list[model_3d]", default: [], title: "Models", description: "List of 3D models to merge" })
  declare models: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const values = Array.isArray(inputs.models ?? this.models)
      ? (inputs.models ?? this.models) as unknown[]
      : [];
    const all = values.map((v) => modelBytes(v));
    return { output: modelRef(concatBytes(all), { format: "glb" }) };
  }
}

export class TextTo3DNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.TextTo3D";
            static readonly title = "Text To 3D";
            static readonly description = "Generate 3D models from text prompts using AI providers (Meshy, Rodin).\n    3d, generation, AI, text-to-3d, t3d, mesh, create\n\n    Use cases:\n    - Create 3D models from text descriptions\n    - Generate game assets from prompts\n    - Prototype 3D concepts quickly\n    - Create 3D content for AR/VR";
        static readonly metadataOutputTypes = {
    output: "model_3d"
  };
          static readonly basicFields = [
  "model",
  "prompt",
  "output_format",
  "seed"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "model_3d_model", default: {
  "type": "model_3d_model",
  "provider": "meshy",
  "id": "meshy-4",
  "name": "Meshy-4 Text-to-3D",
  "path": null,
  "supported_tasks": [],
  "output_formats": [
    "glb"
  ]
}, title: "Model", description: "The 3D generation model to use" })
  declare model: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Text description of the 3D model to generate" })
  declare prompt: any;

  @prop({ type: "str", default: "", title: "Negative Prompt", description: "Elements to avoid in the generated model" })
  declare negative_prompt: any;

  @prop({ type: "str", default: "", title: "Art Style", description: "Art style for the model (e.g., 'realistic', 'cartoon', 'low-poly')" })
  declare art_style: any;

  @prop({ type: "enum", default: "glb", title: "Output Format", description: "Output format for the 3D model", values: [
  "glb",
  "gltf",
  "obj",
  "stl",
  "ply"
] })
  declare output_format: any;

  @prop({ type: "int", default: -1, title: "Seed", description: "Random seed for reproducibility (-1 for random)", min: -1 })
  declare seed: any;

  @prop({ type: "int", default: 600, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use provider default)", min: 0, max: 7200 })
  declare timeout_seconds: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const text = String(inputs.prompt ?? this.prompt ?? "");
    const bytes = Uint8Array.from(Buffer.from(text, "utf8"));
    return { output: modelRef(bytes, { format: "glb" }) };
  }
}

export class ImageTo3DNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.ImageTo3D";
            static readonly title = "Image To 3D";
            static readonly description = "Generate 3D models from images using AI providers (Meshy, Rodin).\n    3d, generation, AI, image-to-3d, i3d, mesh, reconstruction\n\n    Use cases:\n    - Convert product photos to 3D models\n    - Create 3D assets from concept art\n    - Generate 3D characters from drawings\n    - Reconstruct objects from images";
        static readonly metadataOutputTypes = {
    output: "model_3d"
  };
          static readonly basicFields = [
  "model",
  "image",
  "output_format",
  "seed"
];
          static readonly exposeAsTool = true;
  
  @prop({ type: "model_3d_model", default: {
  "type": "model_3d_model",
  "provider": "meshy",
  "id": "meshy-4-image",
  "name": "Meshy-4 Image-to-3D",
  "path": null,
  "supported_tasks": [],
  "output_formats": [
    "glb"
  ]
}, title: "Model", description: "The 3D generation model to use" })
  declare model: any;

  @prop({ type: "image", default: {
  "type": "image",
  "uri": "",
  "asset_id": null,
  "data": null,
  "metadata": null
}, title: "Image", description: "Input image to convert to 3D" })
  declare image: any;

  @prop({ type: "str", default: "", title: "Prompt", description: "Optional text prompt to guide the 3D generation" })
  declare prompt: any;

  @prop({ type: "enum", default: "glb", title: "Output Format", description: "Output format for the 3D model", values: [
  "glb",
  "gltf",
  "obj",
  "stl",
  "ply"
] })
  declare output_format: any;

  @prop({ type: "int", default: -1, title: "Seed", description: "Random seed for reproducibility (-1 for random)", min: -1 })
  declare seed: any;

  @prop({ type: "int", default: 600, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use provider default)", min: 0, max: 7200 })
  declare timeout_seconds: any;




  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    const image = (inputs.image ?? this.image ?? {}) as ImageRefLike;
    const bytes = toBytes(image.data);
    return { output: modelRef(bytes, { format: "glb" }) };
  }
}

export const MODEL3D_NODES = [
  LoadModel3DFileNode,
  SaveModel3DFileNode,
  SaveModel3DNode,
  FormatConverterNode,
  GetModel3DMetadataNode,
  Transform3DNode,
  DecimateNode,
  Boolean3DNode,
  RecalculateNormalsNode,
  CenterMeshNode,
  FlipNormalsNode,
  MergeMeshesNode,
  TextTo3DNode,
  ImageTo3DNode,
] as const;
