/**
 * Shared props for the three Blender render nodes (`RenderImage`,
 * `RenderPasses`, `RenderAnimation`).
 *
 * The camera, lighting, and engine block is identical across the three
 * nodes, so it lives here once. Per-node wording stays on the node:
 * `RenderAnimation` re-declares `camera_mode`, `width`, `height`, and
 * `transparent` with its own descriptions, which override these through
 * the prototype chain (`collectDeclaredProps` merges base-first, so an
 * override keeps its base position and the prop order never changes).
 * `timeout` also stays per node: it is last everywhere, and inheriting it
 * would move it before `RenderPasses`' `passes`/`depth_format`.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ModelBytesRefLike } from "@nodetool-ai/nodes-utils";

import { DEFAULT_MODEL_3D } from "./defaults.js";

export abstract class BlenderRenderBase extends BaseNode {
  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to render (GLB or glTF with embedded buffers)"
  })
  declare model: ModelBytesRefLike;

  @prop({
    type: "enum",
    default: "auto",
    title: "Camera Mode",
    description:
      "Whose camera renders: auto (the scene's first camera when the model has one, else an orbit camera), scene (the scene's first camera; an error when the model has none), or orbit (always an orbit camera from the props below)",
    values: ["auto", "scene", "orbit"]
  })
  declare camera_mode: any;

  @prop({ type: "int", default: 1024, title: "Width", description: "Output image width in pixels", min: 16, max: 4096 })
  declare width: any;

  @prop({ type: "int", default: 1024, title: "Height", description: "Output image height in pixels", min: 16, max: 4096 })
  declare height: any;

  @prop({ type: "float", default: 45, title: "Azimuth", description: "Horizontal camera orbit angle in degrees (0 looks along -Z)", min: -360, max: 360 })
  declare azimuth: any;

  @prop({ type: "float", default: 25, title: "Elevation", description: "Camera angle above the horizon in degrees", min: -89, max: 89 })
  declare elevation: any;

  @prop({ type: "float", default: 35, title: "Field of View", description: "Vertical field of view in degrees", min: 5, max: 120 })
  declare fov: any;

  @prop({ type: "float", default: 1, title: "Zoom", description: "Distance multiplier on the auto-framed camera: above 1 moves closer, below 1 farther", min: 0.1, max: 10 })
  declare zoom: any;

  @prop({
    type: "enum",
    default: "studio",
    title: "Lighting",
    description: "Lighting preset used when the scene carries no lights of its own: studio (key/fill/rim), soft (hemisphere), or flat (ambient only)",
    values: ["studio", "soft", "flat"]
  })
  declare lighting: any;

  @prop({ type: "float", default: 1, title: "Light Intensity", description: "Multiplier applied to all lights in the preset; ignored when the scene carries its own lights", min: 0, max: 10 })
  declare light_intensity: any;

  @prop({ type: "str", default: "#808080", title: "Background Color", description: "Background color (hex); ignored when Transparent is on" })
  declare background_color: any;

  @prop({ type: "bool", default: false, title: "Transparent", description: "Render on a transparent background (PNG alpha)" })
  declare transparent: any;

  @prop({
    type: "enum",
    default: "eevee",
    title: "Engine",
    description: "Render engine: EEVEE (fast preview quality) or Cycles (slower, higher quality)",
    values: ["eevee", "cycles"]
  })
  declare engine: any;

  @prop({ type: "int", default: 16, title: "Samples", description: "Render samples per pixel; higher is cleaner and slower", min: 1, max: 4096 })
  declare samples: any;

  @prop({ type: "bool", default: true, title: "Denoise", description: "Denoise the render (Cycles; EEVEE ignores it)" })
  declare denoise: any;

  @prop({ type: "int", default: 100, title: "Resolution Percentage", description: "Render scale in percent of Width × Height", min: 1, max: 100 })
  declare resolution_percentage: any;
}
