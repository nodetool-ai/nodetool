export { GlbTransformNode, glbOutput } from "./base.js";
export * from "./defaults.js";
export * from "./io.js";
export * from "./convert.js";
export * from "./analysis.js";
export * from "./transforms.js";
export * from "./cleanup.js";
export * from "./ops.js";
export * from "./generation.js";

import { LoadModel3DFileNode } from "./io.js";
import { SaveModel3DFileNode } from "./io.js";
import { SaveModel3DNode } from "./io.js";
import { FormatConverterNode } from "./convert.js";
import { GetModel3DMetadataNode } from "./analysis.js";
import { Transform3DNode, CenterMeshNode, NormalizeModel3DNode } from "./transforms.js";
import { DecimateNode, Boolean3DNode, MergeMeshesNode } from "./ops.js";
import { RecalculateNormalsNode, FlipNormalsNode, ExtractLargestComponentNode, RepairMeshNode } from "./cleanup.js";
import { TextTo3DNode, ImageTo3DNode } from "./generation.js";

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
  NormalizeModel3DNode,
  ExtractLargestComponentNode,
  RepairMeshNode,
  MergeMeshesNode,
  TextTo3DNode,
  ImageTo3DNode
] as const;
