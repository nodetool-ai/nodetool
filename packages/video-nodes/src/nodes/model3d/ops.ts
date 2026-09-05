import { BaseNode, prop } from "@nodetool-ai/node-sdk";

import type { ProcessingContext } from "@nodetool-ai/runtime";
import { glbOutput } from "./base.js";
import { DEFAULT_MODEL_3D } from "./defaults.js";
import { booleanGlb } from "./boolean-ops.js";
import { decimateGlb, mergeGlbModels } from "./document-ops.js";
import { analyzeGlbMetadata, requireGlbBytes } from "./glb.js";
import type { Model3DRefLike } from "./types.js";
import { modelRefToBytes } from "./utils.js";

export class DecimateNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.Decimate";
  static readonly title = "Decimate";
  static readonly description =
    "Reduce polygon count while preserving shape using meshoptimizer-backed simplification.\n    3d, mesh, model, decimate, simplify, reduce, polygon, optimize, LOD\n\n    Set target_vertices > 0 to target an exact vertex count instead of a ratio.\n\n    Use cases:\n    - Create level-of-detail (LOD) versions\n    - Optimize models for real-time rendering\n    - Reduce file size for web deployment\n    - Prepare models for mobile/VR applications";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["model"];

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to decimate"
  })
  declare model: Model3DRefLike;

  @prop({
    type: "float",
    default: 0.5,
    title: "Target Ratio",
    description: "Target ratio of faces to keep (0.5 = 50% reduction). Ignored when target_vertices is set.",
    min: 0.01,
    max: 1
  })
  declare target_ratio: number;

  @prop({
    type: "int",
    default: 0,
    title: "Target Vertices",
    description: "Approximate target vertex count. Overrides target_ratio when > 0.",
    min: 0
  })
  declare target_vertices: number;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const model = this.model;
    const bytes = await modelRefToBytes(model, context);
    requireGlbBytes(model, bytes, "decimation");
    const targetVertices = this.target_vertices;
    let ratio: number;
    if (targetVertices > 0) {
      const meta = analyzeGlbMetadata(model, bytes);
      const currentVertices = meta.vertex_count;
      ratio = currentVertices > 0 ? targetVertices / currentVertices : 0.5;
    } else {
      ratio = this.target_ratio;
    }
    const decimatedBytes = await decimateGlb(bytes, ratio);
    return glbOutput(decimatedBytes, model.uri ?? "");
  }
}

export class Boolean3DNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.Boolean3D";
  static readonly title = "Boolean 3D";
  static readonly description =
    "Perform boolean operations on 3D meshes.\n    3d, mesh, model, boolean, union, difference, intersection, combine, subtract\n\n    Current limits:\n    - First honest pass supports GLB triangle meshes only\n    - Boolean output preserves geometry, not full material/attribute fidelity\n\n    Use cases:\n    - Combine multiple objects (union)\n    - Cut holes in objects (difference)\n    - Find overlapping regions (intersection)\n    - Hard-surface modeling operations\n    - 3D printing preparation";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["model_a", "model_b"];

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model A",
    description: "First 3D model (base)"
  })
  declare model_a: Model3DRefLike;

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model B",
    description: "Second 3D model (tool)"
  })
  declare model_b: Model3DRefLike;

  @prop({
    type: "enum",
    default: "union",
    title: "Operation",
    description: "Boolean operation to perform",
    values: ["union", "difference", "intersection"]
  })
  declare operation: "union" | "difference" | "intersection";

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const modelA = this.model_a;
    const modelB = this.model_b;
    const a = requireGlbBytes(modelA, await modelRefToBytes(modelA, context), "boolean");
    const b = requireGlbBytes(modelB, await modelRefToBytes(modelB, context), "boolean");
    const operation = this.operation.toLowerCase();
    const out = await booleanGlb(a, b, operation);
    return glbOutput(out);
  }
}

export class MergeMeshesNode extends BaseNode {
  static readonly nodeType = "nodetool.model3d.MergeMeshes";
  static readonly title = "Merge Meshes";
  static readonly description =
    "Merge multiple meshes into a single GLB scene.\n    3d, mesh, model, merge, combine, concatenate\n\n    Current limits:\n    - First honest pass supports GLB input only\n    - This node performs scene merge, not boolean union\n\n    Use cases:\n    - Combine multiple parts into one model\n    - Merge imported components\n    - Prepare models for downstream processing";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["models"];

  @prop({
    type: "list[model_3d]",
    default: [],
    title: "Models",
    description: "List of 3D models to merge"
  })
  declare models: Model3DRefLike[];

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const models = this.models;
    if (models.length === 0) {
      return glbOutput(new Uint8Array(0));
    }
    const bytesList = await Promise.all(models.map((m) => modelRefToBytes(m, context)));
    for (let i = 0; i < models.length; i++) {
      requireGlbBytes(models[i], bytesList[i], "merge");
    }
    const merged = await mergeGlbModels(bytesList);
    return glbOutput(merged);
  }
}
