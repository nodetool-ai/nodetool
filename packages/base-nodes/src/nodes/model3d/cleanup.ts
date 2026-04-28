import { prop } from "@nodetool/node-sdk";

import { GlbTransformNode } from "./base.js";
import { DEFAULT_MODEL_3D } from "./defaults.js";
import {
  extractLargestComponentGlb,
  flipNormalsGlb,
  recalculateNormalsGlb,
  repairGlb
} from "./mesh-ops.js";

export class RecalculateNormalsNode extends GlbTransformNode {
  static readonly nodeType = "nodetool.model3d.RecalculateNormals";
  static readonly title = "Recalculate Normals";
  static readonly description =
    "Recalculate mesh normals for proper shading.\n    3d, mesh, model, normals, fix, shading, smooth, flat, faces\n\n    Use cases:\n    - Fix inverted or broken normals\n    - Switch between smooth and flat shading\n    - Repair imported meshes with bad normals\n    - Prepare models for rendering";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to process"
  })
  declare model: any;

  @prop({
    type: "enum",
    default: "auto",
    title: "Mode",
    description: "Shading mode: smooth, flat, or auto (uses mesh default)",
    values: ["smooth", "flat", "auto"]
  })
  declare mode: any;

  @prop({
    type: "bool",
    default: true,
    title: "Fix Winding",
    description: "Fix inconsistent face winding (inverted faces)"
  })
  declare fix_winding: any;

  protected transform(bytes: Uint8Array): Uint8Array | null {
    return recalculateNormalsGlb(bytes, {
      mode: String(this.mode ?? "auto"),
      fixWinding: Boolean(this.fix_winding)
    });
  }
}

export class FlipNormalsNode extends GlbTransformNode {
  static readonly nodeType = "nodetool.model3d.FlipNormals";
  static readonly title = "Flip Normals";
  static readonly description =
    "Flip all face normals of a mesh.\n    3d, mesh, model, normals, flip, invert, inside_out\n\n    Use cases:\n    - Fix inside-out meshes\n    - Invert normals for specific rendering effects\n    - Repair meshes from incompatible software";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to process"
  })
  declare model: any;

  protected transform(bytes: Uint8Array): Uint8Array | null {
    return flipNormalsGlb(bytes);
  }
}

export class ExtractLargestComponentNode extends GlbTransformNode {
  static readonly nodeType = "nodetool.model3d.ExtractLargestComponent";
  static readonly title = "Extract Largest Component";
  static readonly description =
    "Keep only the largest disconnected triangle component of a 3D mesh.\n    3d, mesh, model, cleanup, component, connected, floater, islands\n\n    Current limits:\n    - First honest pass supports GLB triangle geometry only\n    - Output rebuilds triangle geometry and does not preserve all original attributes/material setup\n\n    Use cases:\n    - Remove disconnected floaters from AI-generated meshes\n    - Keep the primary object from noisy geometry\n    - Clean up multi-island outputs before downstream processing";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to clean up"
  })
  declare model: any;

  protected transform(bytes: Uint8Array): Uint8Array | null {
    return extractLargestComponentGlb(bytes);
  }
}

export class RepairMeshNode extends GlbTransformNode {
  static readonly nodeType = "nodetool.model3d.RepairMesh";
  static readonly title = "Repair Mesh";
  static readonly description =
    "Apply conservative mesh cleanup passes to remove obviously broken GLB triangle geometry.\n    3d, mesh, model, repair, cleanup, weld, degenerate, duplicate\n\n    Current limits:\n    - First honest pass supports GLB triangle geometry only\n    - Repair is intentionally conservative: near-duplicate vertex merge plus degenerate-face removal\n    - Output rebuilds triangle geometry and does not preserve all original attributes/material setup\n\n    Use cases:\n    - Clean up noisy AI-generated meshes before export\n    - Weld tiny duplicate seams in simple geometry\n    - Remove zero-area or collapsed triangles";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to repair"
  })
  declare model: any;

  @prop({
    type: "bool",
    default: true,
    title: "Merge Duplicate Vertices",
    description: "Merge exact or near-duplicate vertices before other cleanup"
  })
  declare merge_duplicate_vertices: any;

  @prop({
    type: "bool",
    default: true,
    title: "Remove Degenerate Faces",
    description: "Drop triangles with repeated vertices or near-zero area"
  })
  declare remove_degenerate_faces: any;

  @prop({
    type: "float",
    default: 0.0001,
    title: "Position Tolerance",
    description: "Tolerance used for near-duplicate vertex welding and degenerate checks",
    min: 0
  })
  declare position_tolerance: any;

  protected transform(bytes: Uint8Array): Uint8Array | null {
    return repairGlb(bytes, {
      mergeDuplicateVertices: Boolean(this.merge_duplicate_vertices ?? true),
      removeDegenerateFaces: Boolean(this.remove_degenerate_faces ?? true),
      positionTolerance: Number(this.position_tolerance ?? 0.0001)
    });
  }
}
