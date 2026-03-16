// Auto-generated — do not edit manually

import { createNode, Connectable, DslNode, SingleOutput, OutputHandle } from "../core.js";
import type { ImageRef, FolderRef } from "../types.js";

// Load Model 3D File — nodetool.model3d.LoadModel3DFile
export interface LoadModel3DFileInputs {
  path?: Connectable<string>;
}

export function loadModel3DFile(inputs: LoadModel3DFileInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.model3d.LoadModel3DFile", inputs as Record<string, unknown>);
}

// Save Model 3D File — nodetool.model3d.SaveModel3DFile
export interface SaveModel3DFileInputs {
  model?: Connectable<unknown>;
  folder?: Connectable<string>;
  filename?: Connectable<string>;
  overwrite?: Connectable<boolean>;
}

export function saveModel3DFile(inputs: SaveModel3DFileInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.model3d.SaveModel3DFile", inputs as Record<string, unknown>);
}

// Save Model3D Asset — nodetool.model3d.SaveModel3D
export interface SaveModel3DInputs {
  model?: Connectable<unknown>;
  folder?: Connectable<FolderRef>;
  name?: Connectable<string>;
}

export function saveModel3D(inputs: SaveModel3DInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.model3d.SaveModel3D", inputs as Record<string, unknown>);
}

// Format Converter — nodetool.model3d.FormatConverter
export interface FormatConverterInputs {
  model?: Connectable<unknown>;
  output_format?: Connectable<unknown>;
}

export function formatConverter(inputs: FormatConverterInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.model3d.FormatConverter", inputs as Record<string, unknown>);
}

// Get Model 3D Metadata — nodetool.model3d.GetModel3DMetadata
export interface GetModel3DMetadataInputs {
  model?: Connectable<unknown>;
}

export interface GetModel3DMetadataOutputs {
  format: OutputHandle<string>;
  vertex_count: OutputHandle<number>;
  face_count: OutputHandle<number>;
  is_watertight: OutputHandle<boolean>;
  bounds_min: OutputHandle<number[]>;
  bounds_max: OutputHandle<number[]>;
  center_of_mass: OutputHandle<number[]>;
  volume: OutputHandle<number>;
  surface_area: OutputHandle<number>;
}

export function getModel3DMetadata(inputs: GetModel3DMetadataInputs): DslNode<GetModel3DMetadataOutputs> {
  return createNode("nodetool.model3d.GetModel3DMetadata", inputs as Record<string, unknown>, { multiOutput: true });
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

export function transform3D(inputs: Transform3DInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.model3d.Transform3D", inputs as Record<string, unknown>);
}

// Decimate — nodetool.model3d.Decimate
export interface DecimateInputs {
  model?: Connectable<unknown>;
  target_ratio?: Connectable<number>;
}

export function decimate(inputs: DecimateInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.model3d.Decimate", inputs as Record<string, unknown>);
}

// Boolean 3D — nodetool.model3d.Boolean3D
export interface Boolean3DInputs {
  model_a?: Connectable<unknown>;
  model_b?: Connectable<unknown>;
  operation?: Connectable<unknown>;
}

export function boolean3D(inputs: Boolean3DInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.model3d.Boolean3D", inputs as Record<string, unknown>);
}

// Recalculate Normals — nodetool.model3d.RecalculateNormals
export interface RecalculateNormalsInputs {
  model?: Connectable<unknown>;
  mode?: Connectable<unknown>;
  fix_winding?: Connectable<boolean>;
}

export function recalculateNormals(inputs: RecalculateNormalsInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.model3d.RecalculateNormals", inputs as Record<string, unknown>);
}

// Center Mesh — nodetool.model3d.CenterMesh
export interface CenterMeshInputs {
  model?: Connectable<unknown>;
  use_centroid?: Connectable<boolean>;
}

export function centerMesh(inputs: CenterMeshInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.model3d.CenterMesh", inputs as Record<string, unknown>);
}

// Flip Normals — nodetool.model3d.FlipNormals
export interface FlipNormalsInputs {
  model?: Connectable<unknown>;
}

export function flipNormals(inputs: FlipNormalsInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.model3d.FlipNormals", inputs as Record<string, unknown>);
}

// Merge Meshes — nodetool.model3d.MergeMeshes
export interface MergeMeshesInputs {
  models?: Connectable<unknown[]>;
}

export function mergeMeshes(inputs: MergeMeshesInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.model3d.MergeMeshes", inputs as Record<string, unknown>);
}

// Text To 3D — nodetool.model3d.TextTo3D
export interface TextTo3DInputs {
  model?: Connectable<unknown>;
  prompt?: Connectable<string>;
  negative_prompt?: Connectable<string>;
  art_style?: Connectable<string>;
  output_format?: Connectable<unknown>;
  seed?: Connectable<number>;
  timeout_seconds?: Connectable<number>;
}

export function textTo3D(inputs: TextTo3DInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.model3d.TextTo3D", inputs as Record<string, unknown>);
}

// Image To 3D — nodetool.model3d.ImageTo3D
export interface ImageTo3DInputs {
  model?: Connectable<unknown>;
  image?: Connectable<ImageRef>;
  prompt?: Connectable<string>;
  output_format?: Connectable<unknown>;
  seed?: Connectable<number>;
  timeout_seconds?: Connectable<number>;
}

export function imageTo3D(inputs: ImageTo3DInputs): DslNode<SingleOutput<unknown>> {
  return createNode("nodetool.model3d.ImageTo3D", inputs as Record<string, unknown>);
}
