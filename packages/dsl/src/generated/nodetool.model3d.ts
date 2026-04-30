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

export function loadModel3DFile(inputs: LoadModel3DFileInputs): DslNode<LoadModel3DFileOutputs, "output"> {
  return createNode("nodetool.model3d.LoadModel3DFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
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

export function saveModel3DFile(inputs: SaveModel3DFileInputs): DslNode<SaveModel3DFileOutputs, "output"> {
  return createNode("nodetool.model3d.SaveModel3DFile", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
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

export function saveModel3D(inputs: SaveModel3DInputs): DslNode<SaveModel3DOutputs, "output"> {
  return createNode("nodetool.model3d.SaveModel3D", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Format Converter — nodetool.model3d.FormatConverter
export interface FormatConverterInputs {
  model?: Connectable<unknown>;
  output_format?: Connectable<"glb" | "gltf" | "obj" | "stl" | "ply">;
}

export interface FormatConverterOutputs {
  output: unknown;
}

export function formatConverter(inputs: FormatConverterInputs): DslNode<FormatConverterOutputs, "output"> {
  return createNode("nodetool.model3d.FormatConverter", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Get Model 3D Metadata — nodetool.model3d.GetModel3DMetadata
export interface GetModel3DMetadataInputs {
  model?: Connectable<unknown>;
}

export interface GetModel3DMetadataOutputs {
  format: string;
  vertex_count: number;
  face_count: number;
  is_watertight: boolean;
  bounds_min: number[];
  bounds_max: number[];
  center_of_mass: number[];
  volume: number;
  surface_area: number;
}

export function getModel3DMetadata(inputs: GetModel3DMetadataInputs): DslNode<GetModel3DMetadataOutputs> {
  return createNode("nodetool.model3d.GetModel3DMetadata", inputs as Record<string, unknown>, { outputNames: ["format", "vertex_count", "face_count", "is_watertight", "bounds_min", "bounds_max", "center_of_mass", "volume", "surface_area"] });
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

export function transform3D(inputs: Transform3DInputs): DslNode<Transform3DOutputs, "output"> {
  return createNode("nodetool.model3d.Transform3D", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Decimate — nodetool.model3d.Decimate
export interface DecimateInputs {
  model?: Connectable<unknown>;
  target_ratio?: Connectable<number>;
}

export interface DecimateOutputs {
  output: unknown;
}

export function decimate(inputs: DecimateInputs): DslNode<DecimateOutputs, "output"> {
  return createNode("nodetool.model3d.Decimate", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
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

export function boolean3D(inputs: Boolean3DInputs): DslNode<Boolean3DOutputs, "output"> {
  return createNode("nodetool.model3d.Boolean3D", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
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

export function recalculateNormals(inputs: RecalculateNormalsInputs): DslNode<RecalculateNormalsOutputs, "output"> {
  return createNode("nodetool.model3d.RecalculateNormals", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Center Mesh — nodetool.model3d.CenterMesh
export interface CenterMeshInputs {
  model?: Connectable<unknown>;
  use_centroid?: Connectable<boolean>;
}

export interface CenterMeshOutputs {
  output: unknown;
}

export function centerMesh(inputs: CenterMeshInputs): DslNode<CenterMeshOutputs, "output"> {
  return createNode("nodetool.model3d.CenterMesh", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Flip Normals — nodetool.model3d.FlipNormals
export interface FlipNormalsInputs {
  model?: Connectable<unknown>;
}

export interface FlipNormalsOutputs {
  output: unknown;
}

export function flipNormals(inputs: FlipNormalsInputs): DslNode<FlipNormalsOutputs, "output"> {
  return createNode("nodetool.model3d.FlipNormals", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Merge Meshes — nodetool.model3d.MergeMeshes
export interface MergeMeshesInputs {
  models?: Connectable<unknown[]>;
}

export interface MergeMeshesOutputs {
  output: unknown;
}

export function mergeMeshes(inputs: MergeMeshesInputs): DslNode<MergeMeshesOutputs, "output"> {
  return createNode("nodetool.model3d.MergeMeshes", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Text To 3D — nodetool.model3d.TextTo3D
export interface TextTo3DInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  art_style?: Connectable<string>;
  output_format?: Connectable<"glb" | "gltf" | "obj" | "stl" | "ply">;
  seed?: Connectable<number>;
  timeout_seconds?: Connectable<number>;
}

export interface TextTo3DOutputs {
  output: unknown;
}

export function textTo3D(inputs: TextTo3DInputs): DslNode<TextTo3DOutputs, "output"> {
  return createNode("nodetool.model3d.TextTo3D", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}

// Image To 3D — nodetool.model3d.ImageTo3D
export interface ImageTo3DInputs {
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  output_format?: Connectable<"glb" | "gltf" | "obj" | "stl" | "ply">;
  seed?: Connectable<number>;
  timeout_seconds?: Connectable<number>;
}

export interface ImageTo3DOutputs {
  output: unknown;
}

export function imageTo3D(inputs: ImageTo3DInputs): DslNode<ImageTo3DOutputs, "output"> {
  return createNode("nodetool.model3d.ImageTo3D", inputs as Record<string, unknown>, { outputNames: ["output"], defaultOutput: "output" });
}
