// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, FolderRef } from "../types.js";

// Load Model 3D File — nodetool.model3d.LoadModel3DFile
export type LoadModel3DFileInputs = {
  path?: Connectable<string>;
};

export interface LoadModel3DFileOutputs {
  output: unknown;
}

export function loadModel3DFile(inputs: LoadModel3DFileInputs): DslNode<LoadModel3DFileOutputs, "output"> {
  return createNode("nodetool.model3d.LoadModel3DFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Save Model 3D File — nodetool.model3d.SaveModel3DFile
export type SaveModel3DFileInputs = {
  model?: Connectable<unknown>;
  save_to_workspace?: Connectable<boolean>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
  overwrite?: Connectable<boolean>;
};

export interface SaveModel3DFileOutputs {
  output: unknown;
}

export function saveModel3DFile(inputs: SaveModel3DFileInputs): DslNode<SaveModel3DFileOutputs, "output"> {
  return createNode("nodetool.model3d.SaveModel3DFile", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Save Model3D Asset — nodetool.model3d.SaveModel3D
export type SaveModel3DInputs = {
  model?: Connectable<unknown>;
  folder?: Connectable<FolderRef>;
  name?: Connectable<string>;
};

export interface SaveModel3DOutputs {
  output: unknown;
}

export function saveModel3D(inputs: SaveModel3DInputs): DslNode<SaveModel3DOutputs, "output"> {
  return createNode("nodetool.model3d.SaveModel3D", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Format Converter — nodetool.model3d.FormatConverter
export type FormatConverterInputs = {
  model?: Connectable<unknown>;
  output_format?: Connectable<"glb" | "gltf">;
};

export interface FormatConverterOutputs {
  output: unknown;
}

export function formatConverter(inputs: FormatConverterInputs): DslNode<FormatConverterOutputs, "output"> {
  return createNode("nodetool.model3d.FormatConverter", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Get Model 3D Metadata — nodetool.model3d.GetModel3DMetadata
export type GetModel3DMetadataInputs = {
  model?: Connectable<unknown>;
};

export interface GetModel3DMetadataOutputs {
  output: Record<string, unknown>;
}

export function getModel3DMetadata(inputs: GetModel3DMetadataInputs): DslNode<GetModel3DMetadataOutputs, "output"> {
  return createNode("nodetool.model3d.GetModel3DMetadata", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Transform 3D — nodetool.model3d.Transform3D
export type Transform3DInputs = {
  model?: Connectable<unknown>;
  translate_x?: Connectable<number>;
  translate_y?: Connectable<number>;
  translate_z?: Connectable<number>;
  rotate_x?: Connectable<number>;
  rotate_y?: Connectable<number>;
  rotate_z?: Connectable<number>;
  scale_x?: Connectable<number>;
  scale_y?: Connectable<number>;
  scale_z?: Connectable<number>;
  uniform_scale?: Connectable<number>;
};

export interface Transform3DOutputs {
  output: unknown;
}

export function transform3D(inputs: Transform3DInputs): DslNode<Transform3DOutputs, "output"> {
  return createNode("nodetool.model3d.Transform3D", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Decimate — nodetool.model3d.Decimate
export type DecimateInputs = {
  model?: Connectable<unknown>;
  target_ratio?: Connectable<number>;
  target_vertices?: Connectable<number>;
};

export interface DecimateOutputs {
  output: unknown;
}

export function decimate(inputs: DecimateInputs): DslNode<DecimateOutputs, "output"> {
  return createNode("nodetool.model3d.Decimate", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Boolean 3D — nodetool.model3d.Boolean3D
export type Boolean3DInputs = {
  model_a?: Connectable<unknown>;
  model_b?: Connectable<unknown>;
  operation?: Connectable<"union" | "difference" | "intersection">;
};

export interface Boolean3DOutputs {
  output: unknown;
}

export function boolean3D(inputs: Boolean3DInputs): DslNode<Boolean3DOutputs, "output"> {
  return createNode("nodetool.model3d.Boolean3D", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Recalculate Normals — nodetool.model3d.RecalculateNormals
export type RecalculateNormalsInputs = {
  model?: Connectable<unknown>;
  mode?: Connectable<"smooth" | "flat" | "auto">;
  fix_winding?: Connectable<boolean>;
};

export interface RecalculateNormalsOutputs {
  output: unknown;
}

export function recalculateNormals(inputs: RecalculateNormalsInputs): DslNode<RecalculateNormalsOutputs, "output"> {
  return createNode("nodetool.model3d.RecalculateNormals", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Center Mesh — nodetool.model3d.CenterMesh
export type CenterMeshInputs = {
  model?: Connectable<unknown>;
  use_centroid?: Connectable<boolean>;
};

export interface CenterMeshOutputs {
  output: unknown;
}

export function centerMesh(inputs: CenterMeshInputs): DslNode<CenterMeshOutputs, "output"> {
  return createNode("nodetool.model3d.CenterMesh", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Flip Normals — nodetool.model3d.FlipNormals
export type FlipNormalsInputs = {
  model?: Connectable<unknown>;
};

export interface FlipNormalsOutputs {
  output: unknown;
}

export function flipNormals(inputs: FlipNormalsInputs): DslNode<FlipNormalsOutputs, "output"> {
  return createNode("nodetool.model3d.FlipNormals", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Normalize Model 3D — nodetool.model3d.NormalizeModel3D
export type NormalizeModel3DInputs = {
  model?: Connectable<unknown>;
  center_mode?: Connectable<"bounds" | "centroid" | "none">;
  axis_preset?: Connectable<"keep" | "z_to_y" | "y_to_z">;
  scale_to_size?: Connectable<boolean>;
  target_size?: Connectable<number>;
  place_on_ground?: Connectable<boolean>;
  ground_axis?: Connectable<"y" | "z">;
};

export interface NormalizeModel3DOutputs {
  output: unknown;
}

export function normalizeModel3D(inputs: NormalizeModel3DInputs): DslNode<NormalizeModel3DOutputs, "output"> {
  return createNode("nodetool.model3d.NormalizeModel3D", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Extract Largest Component — nodetool.model3d.ExtractLargestComponent
export type ExtractLargestComponentInputs = {
  model?: Connectable<unknown>;
};

export interface ExtractLargestComponentOutputs {
  output: unknown;
}

export function extractLargestComponent(inputs: ExtractLargestComponentInputs): DslNode<ExtractLargestComponentOutputs, "output"> {
  return createNode("nodetool.model3d.ExtractLargestComponent", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Repair Mesh — nodetool.model3d.RepairMesh
export type RepairMeshInputs = {
  model?: Connectable<unknown>;
  merge_duplicate_vertices?: Connectable<boolean>;
  remove_degenerate_faces?: Connectable<boolean>;
  position_tolerance?: Connectable<number>;
};

export interface RepairMeshOutputs {
  output: unknown;
}

export function repairMesh(inputs: RepairMeshInputs): DslNode<RepairMeshOutputs, "output"> {
  return createNode("nodetool.model3d.RepairMesh", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Merge Meshes — nodetool.model3d.MergeMeshes
export type MergeMeshesInputs = {
  models?: Connectable<unknown[]>;
};

export interface MergeMeshesOutputs {
  output: unknown;
}

export function mergeMeshes(inputs: MergeMeshesInputs): DslNode<MergeMeshesOutputs, "output"> {
  return createNode("nodetool.model3d.MergeMeshes", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Text To 3D — nodetool.model3d.TextTo3D
export type TextTo3DInputs = {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  art_style?: Connectable<string>;
  output_format?: Connectable<"glb" | "obj" | "fbx" | "usdz">;
  enable_textures?: Connectable<boolean>;
  seed?: Connectable<number>;
  timeout_seconds?: Connectable<number>;
};

export interface TextTo3DOutputs {
  output: unknown;
}

export function textTo3D(inputs: TextTo3DInputs): DslNode<TextTo3DOutputs, "output"> {
  return createNode("nodetool.model3d.TextTo3D", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Image To 3D — nodetool.model3d.ImageTo3D
export type ImageTo3DInputs = {
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  output_format?: Connectable<"glb" | "obj" | "fbx" | "usdz">;
  seed?: Connectable<number>;
  timeout_seconds?: Connectable<number>;
};

export interface ImageTo3DOutputs {
  output: unknown;
}

export function imageTo3D(inputs: ImageTo3DInputs): DslNode<ImageTo3DOutputs, "output"> {
  return createNode("nodetool.model3d.ImageTo3D", inputs, { outputNames: ["output"], defaultOutput: "output" });
}

// Render 3D To Image — nodetool.model3d.RenderToImage
export type RenderToImageInputs = {
  model?: Connectable<unknown>;
  width?: Connectable<number>;
  height?: Connectable<number>;
  azimuth?: Connectable<number>;
  elevation?: Connectable<number>;
  fov?: Connectable<number>;
  zoom?: Connectable<number>;
  lighting?: Connectable<"studio" | "soft" | "flat">;
  light_intensity?: Connectable<number>;
  background_color?: Connectable<string>;
  transparent?: Connectable<boolean>;
};

export interface RenderToImageOutputs {
  output: ImageRef;
}

export function renderToImage(inputs: RenderToImageInputs): DslNode<RenderToImageOutputs, "output"> {
  return createNode("nodetool.model3d.RenderToImage", inputs, { outputNames: ["output"], defaultOutput: "output" });
}
