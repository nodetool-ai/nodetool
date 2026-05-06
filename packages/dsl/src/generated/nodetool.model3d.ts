// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode } from "../core.js";
import type { ImageRef, FolderRef } from "../types.js";

// Load Model 3D File — nodetool.model3d.LoadModel3DFile
export interface LoadModel3DFileInputs {
  path?: Connectable<string>;
}

export interface LoadModel3DFileOutputs {
  output: unknown;
}

export function loadModel3DFile(inputs: LoadModel3DFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<LoadModel3DFileOutputs, "output"> {
  return createNode("nodetool.model3d.LoadModel3DFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Save Model 3D File — nodetool.model3d.SaveModel3DFile
export interface SaveModel3DFileInputs {
  model?: Connectable<unknown>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
  overwrite?: Connectable<boolean>;
}

export interface SaveModel3DFileOutputs {
  output: unknown;
}

export function saveModel3DFile(inputs: SaveModel3DFileInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SaveModel3DFileOutputs, "output"> {
  return createNode("nodetool.model3d.SaveModel3DFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Save Model3D Asset — nodetool.model3d.SaveModel3D
export interface SaveModel3DInputs {
  model?: Connectable<unknown>;
  folder?: Connectable<FolderRef>;
  name?: Connectable<string>;
}

export interface SaveModel3DOutputs {
  output: unknown;
}

export function saveModel3D(inputs: SaveModel3DInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<SaveModel3DOutputs, "output"> {
  return createNode("nodetool.model3d.SaveModel3D", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Format Converter — nodetool.model3d.FormatConverter
export interface FormatConverterInputs {
  model?: Connectable<unknown>;
  output_format?: Connectable<"glb" | "gltf">;
}

export interface FormatConverterOutputs {
  output: unknown;
}

export function formatConverter(inputs: FormatConverterInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FormatConverterOutputs, "output"> {
  return createNode("nodetool.model3d.FormatConverter", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Get Model 3D Metadata — nodetool.model3d.GetModel3DMetadata
export interface GetModel3DMetadataInputs {
  model?: Connectable<unknown>;
}

export interface GetModel3DMetadataOutputs {
  output: Record<string, unknown>;
}

export function getModel3DMetadata(inputs: GetModel3DMetadataInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<GetModel3DMetadataOutputs, "output"> {
  return createNode("nodetool.model3d.GetModel3DMetadata", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Transform 3D — nodetool.model3d.Transform3D
export interface Transform3DInputs {
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
}

export interface Transform3DOutputs {
  output: unknown;
}

export function transform3D(inputs: Transform3DInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<Transform3DOutputs, "output"> {
  return createNode("nodetool.model3d.Transform3D", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Decimate — nodetool.model3d.Decimate
export interface DecimateInputs {
  model?: Connectable<unknown>;
  target_ratio?: Connectable<number>;
  target_vertices?: Connectable<number>;
}

export interface DecimateOutputs {
  output: unknown;
}

export function decimate(inputs: DecimateInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<DecimateOutputs, "output"> {
  return createNode("nodetool.model3d.Decimate", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Boolean 3D — nodetool.model3d.Boolean3D
export interface Boolean3DInputs {
  model_a?: Connectable<unknown>;
  model_b?: Connectable<unknown>;
  operation?: Connectable<"union" | "difference" | "intersection">;
}

export interface Boolean3DOutputs {
  output: unknown;
}

export function boolean3D(inputs: Boolean3DInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<Boolean3DOutputs, "output"> {
  return createNode("nodetool.model3d.Boolean3D", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Recalculate Normals — nodetool.model3d.RecalculateNormals
export interface RecalculateNormalsInputs {
  model?: Connectable<unknown>;
  mode?: Connectable<"smooth" | "flat" | "auto">;
  fix_winding?: Connectable<boolean>;
}

export interface RecalculateNormalsOutputs {
  output: unknown;
}

export function recalculateNormals(inputs: RecalculateNormalsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RecalculateNormalsOutputs, "output"> {
  return createNode("nodetool.model3d.RecalculateNormals", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Center Mesh — nodetool.model3d.CenterMesh
export interface CenterMeshInputs {
  model?: Connectable<unknown>;
  use_centroid?: Connectable<boolean>;
}

export interface CenterMeshOutputs {
  output: unknown;
}

export function centerMesh(inputs: CenterMeshInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<CenterMeshOutputs, "output"> {
  return createNode("nodetool.model3d.CenterMesh", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Flip Normals — nodetool.model3d.FlipNormals
export interface FlipNormalsInputs {
  model?: Connectable<unknown>;
}

export interface FlipNormalsOutputs {
  output: unknown;
}

export function flipNormals(inputs: FlipNormalsInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<FlipNormalsOutputs, "output"> {
  return createNode("nodetool.model3d.FlipNormals", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Normalize Model 3D — nodetool.model3d.NormalizeModel3D
export interface NormalizeModel3DInputs {
  model?: Connectable<unknown>;
  center_mode?: Connectable<"bounds" | "centroid" | "none">;
  axis_preset?: Connectable<"keep" | "z_to_y" | "y_to_z">;
  scale_to_size?: Connectable<boolean>;
  target_size?: Connectable<number>;
  place_on_ground?: Connectable<boolean>;
  ground_axis?: Connectable<"y" | "z">;
}

export interface NormalizeModel3DOutputs {
  output: unknown;
}

export function normalizeModel3D(inputs: NormalizeModel3DInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<NormalizeModel3DOutputs, "output"> {
  return createNode("nodetool.model3d.NormalizeModel3D", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Extract Largest Component — nodetool.model3d.ExtractLargestComponent
export interface ExtractLargestComponentInputs {
  model?: Connectable<unknown>;
}

export interface ExtractLargestComponentOutputs {
  output: unknown;
}

export function extractLargestComponent(inputs: ExtractLargestComponentInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ExtractLargestComponentOutputs, "output"> {
  return createNode("nodetool.model3d.ExtractLargestComponent", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Repair Mesh — nodetool.model3d.RepairMesh
export interface RepairMeshInputs {
  model?: Connectable<unknown>;
  merge_duplicate_vertices?: Connectable<boolean>;
  remove_degenerate_faces?: Connectable<boolean>;
  position_tolerance?: Connectable<number>;
}

export interface RepairMeshOutputs {
  output: unknown;
}

export function repairMesh(inputs: RepairMeshInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<RepairMeshOutputs, "output"> {
  return createNode("nodetool.model3d.RepairMesh", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Merge Meshes — nodetool.model3d.MergeMeshes
export interface MergeMeshesInputs {
  models?: Connectable<unknown[]>;
}

export interface MergeMeshesOutputs {
  output: unknown;
}

export function mergeMeshes(inputs: MergeMeshesInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<MergeMeshesOutputs, "output"> {
  return createNode("nodetool.model3d.MergeMeshes", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Text To 3D — nodetool.model3d.TextTo3D
export interface TextTo3DInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  art_style?: Connectable<string>;
  output_format?: Connectable<"glb" | "obj" | "fbx" | "usdz">;
  enable_textures?: Connectable<boolean>;
  seed?: Connectable<number>;
  timeout_seconds?: Connectable<number>;
}

export interface TextTo3DOutputs {
  output: unknown;
}

export function textTo3D(inputs: TextTo3DInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<TextTo3DOutputs, "output"> {
  return createNode("nodetool.model3d.TextTo3D", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}

// Image To 3D — nodetool.model3d.ImageTo3D
export interface ImageTo3DInputs {
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  output_format?: Connectable<"glb" | "obj" | "fbx" | "usdz">;
  seed?: Connectable<number>;
  timeout_seconds?: Connectable<number>;
}

export interface ImageTo3DOutputs {
  output: unknown;
}

export function imageTo3D(inputs: ImageTo3DInputs, overrides?: { syncMode?: "zip_all" | "on_any" }): DslNode<ImageTo3DOutputs, "output"> {
  return createNode("nodetool.model3d.ImageTo3D", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output", ...(overrides?.syncMode ? { syncMode: overrides.syncMode } : {}) });
}
