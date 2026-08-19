// Auto-generated — do not edit manually
// Guest surface: every call bridges to the host through
// "@nodetool-ai/sandbox-nodetool/flow" — see ../guest-core.ts.

import { callNode } from "../guest-core.js";
import type { ImageRef, FolderRef } from "../../types.js";

// Load Model 3D File — nodetool.model3d.LoadModel3DFile
export type LoadModel3DFileInputs = {
  path?: string;
};

export interface LoadModel3DFileOutputs {
  output: unknown;
}

export function loadModel3DFile(inputs: LoadModel3DFileInputs): Promise<LoadModel3DFileOutputs> {
  return callNode<LoadModel3DFileOutputs>("nodetool.model3d.LoadModel3DFile", inputs);
}

// Save Model 3D File — nodetool.model3d.SaveModel3DFile
export type SaveModel3DFileInputs = {
  model?: unknown;
  save_to_workspace?: boolean;
  folder?: string;
  filename?: string;
  overwrite?: boolean;
};

export interface SaveModel3DFileOutputs {
  output: unknown;
}

export function saveModel3DFile(inputs: SaveModel3DFileInputs): Promise<SaveModel3DFileOutputs> {
  return callNode<SaveModel3DFileOutputs>("nodetool.model3d.SaveModel3DFile", inputs);
}

// Save Model3D Asset — nodetool.model3d.SaveModel3D
export type SaveModel3DInputs = {
  model?: unknown;
  folder?: FolderRef;
  name?: string;
};

export interface SaveModel3DOutputs {
  output: unknown;
}

export function saveModel3D(inputs: SaveModel3DInputs): Promise<SaveModel3DOutputs> {
  return callNode<SaveModel3DOutputs>("nodetool.model3d.SaveModel3D", inputs);
}

// Format Converter — nodetool.model3d.FormatConverter
export type FormatConverterInputs = {
  model?: unknown;
  output_format?: "glb" | "gltf";
};

export interface FormatConverterOutputs {
  output: unknown;
}

export function formatConverter(inputs: FormatConverterInputs): Promise<FormatConverterOutputs> {
  return callNode<FormatConverterOutputs>("nodetool.model3d.FormatConverter", inputs);
}

// Get Model 3D Metadata — nodetool.model3d.GetModel3DMetadata
export type GetModel3DMetadataInputs = {
  model?: unknown;
};

export interface GetModel3DMetadataOutputs {
  output: Record<string, unknown>;
}

export function getModel3DMetadata(inputs: GetModel3DMetadataInputs): Promise<GetModel3DMetadataOutputs> {
  return callNode<GetModel3DMetadataOutputs>("nodetool.model3d.GetModel3DMetadata", inputs);
}

// Transform 3D — nodetool.model3d.Transform3D
export type Transform3DInputs = {
  model?: unknown;
  translate_x?: number;
  translate_y?: number;
  translate_z?: number;
  rotate_x?: number;
  rotate_y?: number;
  rotate_z?: number;
  scale_x?: number;
  scale_y?: number;
  scale_z?: number;
  uniform_scale?: number;
};

export interface Transform3DOutputs {
  output: unknown;
}

export function transform3D(inputs: Transform3DInputs): Promise<Transform3DOutputs> {
  return callNode<Transform3DOutputs>("nodetool.model3d.Transform3D", inputs);
}

// Decimate — nodetool.model3d.Decimate
export type DecimateInputs = {
  model?: unknown;
  target_ratio?: number;
  target_vertices?: number;
};

export interface DecimateOutputs {
  output: unknown;
}

export function decimate(inputs: DecimateInputs): Promise<DecimateOutputs> {
  return callNode<DecimateOutputs>("nodetool.model3d.Decimate", inputs);
}

// Boolean 3D — nodetool.model3d.Boolean3D
export type Boolean3DInputs = {
  model_a?: unknown;
  model_b?: unknown;
  operation?: "union" | "difference" | "intersection";
};

export interface Boolean3DOutputs {
  output: unknown;
}

export function boolean3D(inputs: Boolean3DInputs): Promise<Boolean3DOutputs> {
  return callNode<Boolean3DOutputs>("nodetool.model3d.Boolean3D", inputs);
}

// Recalculate Normals — nodetool.model3d.RecalculateNormals
export type RecalculateNormalsInputs = {
  model?: unknown;
  mode?: "smooth" | "flat" | "auto";
  fix_winding?: boolean;
};

export interface RecalculateNormalsOutputs {
  output: unknown;
}

export function recalculateNormals(inputs: RecalculateNormalsInputs): Promise<RecalculateNormalsOutputs> {
  return callNode<RecalculateNormalsOutputs>("nodetool.model3d.RecalculateNormals", inputs);
}

// Center Mesh — nodetool.model3d.CenterMesh
export type CenterMeshInputs = {
  model?: unknown;
  use_centroid?: boolean;
};

export interface CenterMeshOutputs {
  output: unknown;
}

export function centerMesh(inputs: CenterMeshInputs): Promise<CenterMeshOutputs> {
  return callNode<CenterMeshOutputs>("nodetool.model3d.CenterMesh", inputs);
}

// Flip Normals — nodetool.model3d.FlipNormals
export type FlipNormalsInputs = {
  model?: unknown;
};

export interface FlipNormalsOutputs {
  output: unknown;
}

export function flipNormals(inputs: FlipNormalsInputs): Promise<FlipNormalsOutputs> {
  return callNode<FlipNormalsOutputs>("nodetool.model3d.FlipNormals", inputs);
}

// Normalize Model 3D — nodetool.model3d.NormalizeModel3D
export type NormalizeModel3DInputs = {
  model?: unknown;
  center_mode?: "bounds" | "centroid" | "none";
  axis_preset?: "keep" | "z_to_y" | "y_to_z";
  scale_to_size?: boolean;
  target_size?: number;
  place_on_ground?: boolean;
  ground_axis?: "y" | "z";
};

export interface NormalizeModel3DOutputs {
  output: unknown;
}

export function normalizeModel3D(inputs: NormalizeModel3DInputs): Promise<NormalizeModel3DOutputs> {
  return callNode<NormalizeModel3DOutputs>("nodetool.model3d.NormalizeModel3D", inputs);
}

// Extract Largest Component — nodetool.model3d.ExtractLargestComponent
export type ExtractLargestComponentInputs = {
  model?: unknown;
};

export interface ExtractLargestComponentOutputs {
  output: unknown;
}

export function extractLargestComponent(inputs: ExtractLargestComponentInputs): Promise<ExtractLargestComponentOutputs> {
  return callNode<ExtractLargestComponentOutputs>("nodetool.model3d.ExtractLargestComponent", inputs);
}

// Repair Mesh — nodetool.model3d.RepairMesh
export type RepairMeshInputs = {
  model?: unknown;
  merge_duplicate_vertices?: boolean;
  remove_degenerate_faces?: boolean;
  position_tolerance?: number;
};

export interface RepairMeshOutputs {
  output: unknown;
}

export function repairMesh(inputs: RepairMeshInputs): Promise<RepairMeshOutputs> {
  return callNode<RepairMeshOutputs>("nodetool.model3d.RepairMesh", inputs);
}

// Merge Meshes — nodetool.model3d.MergeMeshes
export type MergeMeshesInputs = {
  models?: unknown[];
};

export interface MergeMeshesOutputs {
  output: unknown;
}

export function mergeMeshes(inputs: MergeMeshesInputs): Promise<MergeMeshesOutputs> {
  return callNode<MergeMeshesOutputs>("nodetool.model3d.MergeMeshes", inputs);
}

// Text To 3D — nodetool.model3d.TextTo3D
export type TextTo3DInputs = {
  model?: unknown;
  prompt?: string;
  negative_prompt?: string;
  art_style?: string;
  output_format?: "glb" | "obj" | "fbx" | "usdz";
  enable_textures?: boolean;
  seed?: number;
  timeout_seconds?: number;
};

export interface TextTo3DOutputs {
  output: unknown;
}

export function textTo3D(inputs: TextTo3DInputs): Promise<TextTo3DOutputs> {
  return callNode<TextTo3DOutputs>("nodetool.model3d.TextTo3D", inputs);
}

// Image To 3D — nodetool.model3d.ImageTo3D
export type ImageTo3DInputs = {
  model?: unknown;
  image?: ImageRef;
  prompt?: string;
  output_format?: "glb" | "obj" | "fbx" | "usdz";
  seed?: number;
  timeout_seconds?: number;
};

export interface ImageTo3DOutputs {
  output: unknown;
}

export function imageTo3D(inputs: ImageTo3DInputs): Promise<ImageTo3DOutputs> {
  return callNode<ImageTo3DOutputs>("nodetool.model3d.ImageTo3D", inputs);
}

// Render 3D To Image — nodetool.model3d.RenderToImage
export type RenderToImageInputs = {
  model?: unknown;
  width?: number;
  height?: number;
  azimuth?: number;
  elevation?: number;
  fov?: number;
  zoom?: number;
  lighting?: "studio" | "soft" | "flat";
  light_intensity?: number;
  background_color?: string;
  transparent?: boolean;
};

export interface RenderToImageOutputs {
  output: ImageRef;
}

export function renderToImage(inputs: RenderToImageInputs): Promise<RenderToImageOutputs> {
  return callNode<RenderToImageOutputs>("nodetool.model3d.RenderToImage", inputs);
}
