import { prop } from "@nodetool-ai/node-sdk";

import { GlbTransformNode } from "./base.js";
import type { Model3DRefLike } from "./types.js";
import { DEFAULT_MODEL_3D } from "./defaults.js";
import { centerGlb, normalizeGlb, transformGlb } from "./mesh-ops.js";

export class Transform3DNode extends GlbTransformNode {
  static readonly nodeType = "nodetool.model3d.Transform3D";
  static readonly title = "Transform 3D";
  static readonly description =
    "Apply translation, rotation, and scaling to a 3D model.\n    3d, mesh, model, transform, translate, rotate, scale, move\n\n    Use cases:\n    - Position models in 3D space\n    - Scale models to specific dimensions\n    - Rotate models for proper orientation";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["model"];

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to transform"
  })
  declare model: Model3DRefLike;

  @prop({ type: "float", default: 0, title: "Translate X", description: "Translation along X axis" })
  declare translate_x: number;

  @prop({ type: "float", default: 0, title: "Translate Y", description: "Translation along Y axis" })
  declare translate_y: number;

  @prop({ type: "float", default: 0, title: "Translate Z", description: "Translation along Z axis" })
  declare translate_z: number;

  @prop({ type: "float", default: 0, title: "Rotate X", description: "Rotation around X axis in degrees", min: -360, max: 360 })
  declare rotate_x: number;

  @prop({ type: "float", default: 0, title: "Rotate Y", description: "Rotation around Y axis in degrees", min: -360, max: 360 })
  declare rotate_y: number;

  @prop({ type: "float", default: 0, title: "Rotate Z", description: "Rotation around Z axis in degrees", min: -360, max: 360 })
  declare rotate_z: number;

  @prop({ type: "float", default: 1, title: "Scale X", description: "Scale factor along X axis" })
  declare scale_x: number;

  @prop({ type: "float", default: 1, title: "Scale Y", description: "Scale factor along Y axis" })
  declare scale_y: number;

  @prop({ type: "float", default: 1, title: "Scale Z", description: "Scale factor along Z axis" })
  declare scale_z: number;

  @prop({ type: "float", default: 1, title: "Uniform Scale", description: "Uniform scale factor (applied after axis scales)" })
  declare uniform_scale: number;

  protected transform(bytes: Uint8Array): Uint8Array | null {
    return transformGlb(bytes, {
      translateX: this.translate_x,
      translateY: this.translate_y,
      translateZ: this.translate_z,
      rotateXDeg: this.rotate_x,
      rotateYDeg: this.rotate_y,
      rotateZDeg: this.rotate_z,
      scaleX: this.scale_x,
      scaleY: this.scale_y,
      scaleZ: this.scale_z,
      uniformScale: this.uniform_scale
    });
  }
}

export class CenterMeshNode extends GlbTransformNode {
  static readonly nodeType = "nodetool.model3d.CenterMesh";
  static readonly title = "Center Mesh";
  static readonly description =
    "Center a mesh at the origin.\n    3d, mesh, model, center, origin, align\n\n    Use cases:\n    - Center models for consistent positioning\n    - Prepare models for rotation\n    - Align multiple models";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["model"];

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to center"
  })
  declare model: Model3DRefLike;

  @prop({
    type: "bool",
    default: true,
    title: "Use Centroid",
    description: "Use geometric centroid (True) or bounding box center (False)"
  })
  declare use_centroid: boolean;

  protected transform(bytes: Uint8Array): Uint8Array | null {
    return centerGlb(bytes, { useCentroid: this.use_centroid });
  }
}

export class NormalizeModel3DNode extends GlbTransformNode {
  static readonly nodeType = "nodetool.model3d.NormalizeModel3D";
  static readonly title = "Normalize Model 3D";
  static readonly description =
    "Normalize a 3D model with explicit axis cleanup, centering, optional uniform scaling, and optional ground placement.\n    3d, mesh, model, normalize, center, scale, orient, ground\n\n    Current limits:\n    - First honest pass supports GLB geometry cleanup only\n    - Axis normalization is explicit (`keep`, `z_to_y`, `y_to_z`), not auto-detected\n\n    Use cases:\n    - Standardize imported GLB orientation\n    - Fit meshes into a predictable size box\n    - Center models before downstream processing\n    - Place meshes onto a chosen ground axis";
  static readonly metadataOutputTypes = {
    output: "model_3d"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["model"];

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to normalize"
  })
  declare model: Model3DRefLike;

  @prop({ type: "enum", default: "bounds", title: "Center Mode", description: "How to center the model before optional scaling", values: ["bounds", "centroid", "none"] })
  declare center_mode: "bounds" | "centroid" | "none";

  @prop({ type: "enum", default: "keep", title: "Axis Preset", description: "Explicit orientation normalization preset", values: ["keep", "z_to_y", "y_to_z"] })
  declare axis_preset: "keep" | "z_to_y" | "y_to_z";

  @prop({ type: "bool", default: true, title: "Scale To Size", description: "Scale the model uniformly so its longest bounds dimension matches the target size" })
  declare scale_to_size: boolean;

  @prop({ type: "float", default: 1, title: "Target Size", description: "Longest bounds dimension after optional uniform scaling", min: 0.0001 })
  declare target_size: number;

  @prop({ type: "bool", default: true, title: "Place On Ground", description: "Translate the mesh so the chosen ground axis minimum becomes zero" })
  declare place_on_ground: boolean;

  @prop({ type: "enum", default: "y", title: "Ground Axis", description: "Axis treated as the up/ground direction for placement", values: ["y", "z"] })
  declare ground_axis: "y" | "z";

  protected transform(bytes: Uint8Array): Uint8Array | null {
    return normalizeGlb(bytes, {
      centerMode: this.center_mode,
      axisPreset: this.axis_preset,
      scaleToSize: this.scale_to_size,
      targetSize: this.target_size,
      placeOnGround: this.place_on_ground,
      groundAxis: this.ground_axis
    });
  }
}
