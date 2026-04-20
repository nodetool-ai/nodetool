import { prop } from "@nodetool/node-sdk";

import { GlbTransformNode } from "./base.js";
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

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to transform"
  })
  declare model: any;

  @prop({ type: "float", default: 0, title: "Translate X", description: "Translation along X axis" })
  declare translate_x: any;

  @prop({ type: "float", default: 0, title: "Translate Y", description: "Translation along Y axis" })
  declare translate_y: any;

  @prop({ type: "float", default: 0, title: "Translate Z", description: "Translation along Z axis" })
  declare translate_z: any;

  @prop({ type: "float", default: 0, title: "Rotate X", description: "Rotation around X axis in degrees", min: -360, max: 360 })
  declare rotate_x: any;

  @prop({ type: "float", default: 0, title: "Rotate Y", description: "Rotation around Y axis in degrees", min: -360, max: 360 })
  declare rotate_y: any;

  @prop({ type: "float", default: 0, title: "Rotate Z", description: "Rotation around Z axis in degrees", min: -360, max: 360 })
  declare rotate_z: any;

  @prop({ type: "float", default: 1, title: "Scale X", description: "Scale factor along X axis" })
  declare scale_x: any;

  @prop({ type: "float", default: 1, title: "Scale Y", description: "Scale factor along Y axis" })
  declare scale_y: any;

  @prop({ type: "float", default: 1, title: "Scale Z", description: "Scale factor along Z axis" })
  declare scale_z: any;

  @prop({ type: "float", default: 1, title: "Uniform Scale", description: "Uniform scale factor (applied after axis scales)" })
  declare uniform_scale: any;

  protected transform(bytes: Uint8Array): Uint8Array | null {
    return transformGlb(bytes, {
      translateX: Number(this.translate_x ?? 0),
      translateY: Number(this.translate_y ?? 0),
      translateZ: Number(this.translate_z ?? 0),
      rotateXDeg: Number(this.rotate_x ?? 0),
      rotateYDeg: Number(this.rotate_y ?? 0),
      rotateZDeg: Number(this.rotate_z ?? 0),
      scaleX: Number(this.scale_x ?? 1),
      scaleY: Number(this.scale_y ?? 1),
      scaleZ: Number(this.scale_z ?? 1),
      uniformScale: Number(this.uniform_scale ?? 1)
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

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to center"
  })
  declare model: any;

  @prop({
    type: "bool",
    default: true,
    title: "Use Centroid",
    description: "Use geometric centroid (True) or bounding box center (False)"
  })
  declare use_centroid: any;

  protected transform(bytes: Uint8Array): Uint8Array | null {
    return centerGlb(bytes, { useCentroid: Boolean(this.use_centroid ?? true) });
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

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to normalize"
  })
  declare model: any;

  @prop({ type: "enum", default: "bounds", title: "Center Mode", description: "How to center the model before optional scaling", values: ["bounds", "centroid", "none"] })
  declare center_mode: any;

  @prop({ type: "enum", default: "keep", title: "Axis Preset", description: "Explicit orientation normalization preset", values: ["keep", "z_to_y", "y_to_z"] })
  declare axis_preset: any;

  @prop({ type: "bool", default: true, title: "Scale To Size", description: "Scale the model uniformly so its longest bounds dimension matches the target size" })
  declare scale_to_size: any;

  @prop({ type: "float", default: 1, title: "Target Size", description: "Longest bounds dimension after optional uniform scaling", min: 0.0001 })
  declare target_size: any;

  @prop({ type: "bool", default: true, title: "Place On Ground", description: "Translate the mesh so the chosen ground axis minimum becomes zero" })
  declare place_on_ground: any;

  @prop({ type: "enum", default: "y", title: "Ground Axis", description: "Axis treated as the up/ground direction for placement", values: ["y", "z"] })
  declare ground_axis: any;

  protected transform(bytes: Uint8Array): Uint8Array | null {
    return normalizeGlb(bytes, {
      centerMode: String(this.center_mode ?? "bounds") as "bounds" | "centroid" | "none",
      axisPreset: String(this.axis_preset ?? "keep") as "keep" | "z_to_y" | "y_to_z",
      scaleToSize: Boolean(this.scale_to_size ?? true),
      targetSize: Number(this.target_size ?? 1),
      placeOnGround: Boolean(this.place_on_ground ?? true),
      groundAxis: String(this.ground_axis ?? "y") as "y" | "z"
    });
  }
}
