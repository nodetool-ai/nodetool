// Auto-generated — do not edit manually

import { createNode, Connectable, NodeWithOutputs, NodeOptions } from "../core.js";
import type { ImageRef, FolderRef } from "../types.js";

// Load Model 3D File — nodetool.model3d.LoadModel3DFile
export type LoadModel3DFileInputs = {
  path?: Connectable<string>;
};

export interface LoadModel3DFileOutputs {
  output: unknown;
}

export function loadModel3DFile(inputs: LoadModel3DFileInputs, options?: NodeOptions): NodeWithOutputs<LoadModel3DFileOutputs, "output"> {
  return createNode("nodetool.model3d.LoadModel3DFile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"model_3d"}, defaultOutput: "output" });
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

export function saveModel3DFile(inputs: SaveModel3DFileInputs, options?: NodeOptions): NodeWithOutputs<SaveModel3DFileOutputs, "output"> {
  return createNode("nodetool.model3d.SaveModel3DFile", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"model_3d"}, defaultOutput: "output" });
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

export function saveModel3D(inputs: SaveModel3DInputs, options?: NodeOptions): NodeWithOutputs<SaveModel3DOutputs, "output"> {
  return createNode("nodetool.model3d.SaveModel3D", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"model_3d"}, defaultOutput: "output" });
}

// Format Converter — nodetool.model3d.FormatConverter
export type FormatConverterInputs = {
  model?: Connectable<unknown>;
  output_format?: Connectable<"glb" | "gltf">;
};

export interface FormatConverterOutputs {
  output: unknown;
}

export function formatConverter(inputs: FormatConverterInputs, options?: NodeOptions): NodeWithOutputs<FormatConverterOutputs, "output"> {
  return createNode("nodetool.model3d.FormatConverter", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"model_3d"}, defaultOutput: "output" });
}

// Get Model 3D Metadata — nodetool.model3d.GetModel3DMetadata
export type GetModel3DMetadataInputs = {
  model?: Connectable<unknown>;
};

export interface GetModel3DMetadataOutputs {
  output: Record<string, unknown>;
}

export function getModel3DMetadata(inputs: GetModel3DMetadataInputs, options?: NodeOptions): NodeWithOutputs<GetModel3DMetadataOutputs, "output"> {
  return createNode("nodetool.model3d.GetModel3DMetadata", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"dict"}, defaultOutput: "output" });
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

export function transform3D(inputs: Transform3DInputs, options?: NodeOptions): NodeWithOutputs<Transform3DOutputs, "output"> {
  return createNode("nodetool.model3d.Transform3D", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"model_3d"}, defaultOutput: "output" });
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

export function decimate(inputs: DecimateInputs, options?: NodeOptions): NodeWithOutputs<DecimateOutputs, "output"> {
  return createNode("nodetool.model3d.Decimate", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"model_3d"}, defaultOutput: "output" });
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

export function boolean3D(inputs: Boolean3DInputs, options?: NodeOptions): NodeWithOutputs<Boolean3DOutputs, "output"> {
  return createNode("nodetool.model3d.Boolean3D", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"model_3d"}, defaultOutput: "output" });
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

export function recalculateNormals(inputs: RecalculateNormalsInputs, options?: NodeOptions): NodeWithOutputs<RecalculateNormalsOutputs, "output"> {
  return createNode("nodetool.model3d.RecalculateNormals", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"model_3d"}, defaultOutput: "output" });
}

// Center Mesh — nodetool.model3d.CenterMesh
export type CenterMeshInputs = {
  model?: Connectable<unknown>;
  use_centroid?: Connectable<boolean>;
};

export interface CenterMeshOutputs {
  output: unknown;
}

export function centerMesh(inputs: CenterMeshInputs, options?: NodeOptions): NodeWithOutputs<CenterMeshOutputs, "output"> {
  return createNode("nodetool.model3d.CenterMesh", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"model_3d"}, defaultOutput: "output" });
}

// Flip Normals — nodetool.model3d.FlipNormals
export type FlipNormalsInputs = {
  model?: Connectable<unknown>;
};

export interface FlipNormalsOutputs {
  output: unknown;
}

export function flipNormals(inputs: FlipNormalsInputs, options?: NodeOptions): NodeWithOutputs<FlipNormalsOutputs, "output"> {
  return createNode("nodetool.model3d.FlipNormals", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"model_3d"}, defaultOutput: "output" });
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

export function normalizeModel3D(inputs: NormalizeModel3DInputs, options?: NodeOptions): NodeWithOutputs<NormalizeModel3DOutputs, "output"> {
  return createNode("nodetool.model3d.NormalizeModel3D", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"model_3d"}, defaultOutput: "output" });
}

// Extract Largest Component — nodetool.model3d.ExtractLargestComponent
export type ExtractLargestComponentInputs = {
  model?: Connectable<unknown>;
};

export interface ExtractLargestComponentOutputs {
  output: unknown;
}

export function extractLargestComponent(inputs: ExtractLargestComponentInputs, options?: NodeOptions): NodeWithOutputs<ExtractLargestComponentOutputs, "output"> {
  return createNode("nodetool.model3d.ExtractLargestComponent", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"model_3d"}, defaultOutput: "output" });
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

export function repairMesh(inputs: RepairMeshInputs, options?: NodeOptions): NodeWithOutputs<RepairMeshOutputs, "output"> {
  return createNode("nodetool.model3d.RepairMesh", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"model_3d"}, defaultOutput: "output" });
}

// Merge Meshes — nodetool.model3d.MergeMeshes
export type MergeMeshesInputs = {
  models?: Connectable<unknown[]>;
};

export interface MergeMeshesOutputs {
  output: unknown;
}

export function mergeMeshes(inputs: MergeMeshesInputs, options?: NodeOptions): NodeWithOutputs<MergeMeshesOutputs, "output"> {
  return createNode("nodetool.model3d.MergeMeshes", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"model_3d"}, defaultOutput: "output" });
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

export function textTo3D(inputs: TextTo3DInputs, options?: NodeOptions): NodeWithOutputs<TextTo3DOutputs, "output"> {
  return createNode("nodetool.model3d.TextTo3D", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"model_3d"}, defaultOutput: "output" });
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

export function imageTo3D(inputs: ImageTo3DInputs, options?: NodeOptions): NodeWithOutputs<ImageTo3DOutputs, "output"> {
  return createNode("nodetool.model3d.ImageTo3D", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"model_3d"}, defaultOutput: "output" });
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

export function renderToImage(inputs: RenderToImageInputs, options?: NodeOptions): NodeWithOutputs<RenderToImageOutputs, "output"> {
  return createNode("nodetool.model3d.RenderToImage", inputs, { id: options?.id, outputNames: ["output"], outputTypes: {"output":"image"}, defaultOutput: "output" });
}
