/**
 * `nodetool.blender.RenderImage` — glTF scene + camera → image via Blender.
 *
 * Stage 1b: the `render_image` op over `LocalBlenderRunner` (D8). Takes a
 * `Model3DRef`, builds the versioned `BlenderJob`, and returns an inline
 * image ref like `RenderToImage`, so downstream save nodes decide
 * persistence. Camera props reuse the `RenderToImage` vocabulary; the
 * background defaults to studio gray rather than white because a white
 * model on a white background renders invisible under a standard view
 * transform.
 *
 * Every failure rethrows with the node name prefixed. An abort through
 * `context.signal` passes through unwrapped so the node rejects with the
 * abort reason and no partial output.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { bytesToBase64, resolveModelBytes } from "@nodetool-ai/nodes-utils";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import type { BlenderEngine, CameraMode, LightingPreset } from "../job.js";
import { BlenderJobError } from "../runner.js";
import { runBlenderJob } from "../run-job.js";
import { DEFAULT_MODEL_3D } from "./defaults.js";

const NODE_NAME = "nodetool.blender.RenderImage";

/** Output handle RenderImageNode.process() emits. */
type RenderImageNodeOutputs = {
  image: { type: string; uri: string; asset_id: null; data: string };
};

/** Blender ran past its wall clock: point at the two knobs that fix it. */
function timeoutMessage(timeoutMs: number): string {
  return (
    `${NODE_NAME}: Blender render timed out after ${timeoutMs}ms. ` +
    `Lower the samples, use EEVEE, or raise the timeout.`
  );
}

export class RenderImageNode extends BaseNode {
  static readonly nodeType = "nodetool.blender.RenderImage";
  static readonly title = "Render 3D With Blender";
  static readonly description =
    "Render a 3D model (GLB/glTF) to an image with Blender (EEVEE or Cycles) — higher quality than the preview renderer, with scene cameras and lights honored.\n    3d, render, image, camera, light, blender, eevee, cycles, snapshot, thumbnail\n\n    Use cases:\n    - Turn generated 3D models into high-quality images\n    - Render a scene with its authored cameras and lights\n    - Feed rendered views into image models (img2img, upscaling)";
  static readonly metadataOutputTypes = {
    image: "image"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["model"];

  @prop({
    type: "model_3d",
    default: DEFAULT_MODEL_3D,
    title: "Model",
    description: "The 3D model to render (GLB or glTF with embedded buffers)"
  })
  declare model: any;

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

  @prop({ type: "int", default: 600, title: "Timeout", description: "Maximum render time in seconds", min: 1, max: 3600 })
  declare timeout: any;

  async process(context?: ProcessingContext): Promise<RenderImageNodeOutputs> {
    const bytes = await resolveModelBytes(
      (this.model ?? {}) as { data?: Uint8Array | string; uri?: string },
      context
    );
    if (bytes.length === 0) {
      throw new Error(
        `${NODE_NAME}: model input is empty — connect a 3D model (GLB)`
      );
    }

    const timeoutMs = Math.max(1, Number(this.timeout ?? 600)) * 1000;
    try {
      const result = await runBlenderJob(
        context,
        bytes,
        {
          op: "render_image",
          params: {
            camera_mode: String(this.camera_mode ?? "auto") as CameraMode,
            azimuth: Number(this.azimuth ?? 45),
            elevation: Number(this.elevation ?? 25),
            fov: Number(this.fov ?? 35),
            zoom: Number(this.zoom ?? 1),
            lighting: String(this.lighting ?? "studio") as LightingPreset,
            light_intensity: Number(this.light_intensity ?? 1),
            background_color: String(this.background_color ?? "#808080"),
            transparent: this.transparent === true,
            engine: String(this.engine ?? "eevee") as BlenderEngine,
            samples: Math.max(1, Math.round(Number(this.samples ?? 16))),
            denoise: this.denoise !== false,
            resolution_percentage: Math.max(
              1,
              Math.round(Number(this.resolution_percentage ?? 100))
            ),
            width: Math.max(1, Math.round(Number(this.width ?? 1024))),
            height: Math.max(1, Math.round(Number(this.height ?? 1024)))
          }
        },
        { image: "render.png" },
        { timeoutMs, signal: context?.signal }
      );
      const png = result.outputs["image"];
      if (!png || png.length === 0) {
        throw new BlenderJobError(
          "missing_output",
          "Blender produced no image bytes."
        );
      }
      return {
        image: {
          type: "image",
          uri: "",
          asset_id: null,
          data: bytesToBase64(png)
        }
      };
    } catch (err) {
      // Cancellation rejects with the abort reason: pass it through
      // unwrapped so the node rejects with the abort reason.
      if (context?.signal?.aborted) throw err;
      if (err instanceof BlenderJobError && err.code === "timeout") {
        throw new BlenderJobError("timeout", timeoutMessage(timeoutMs));
      }
      if (err instanceof BlenderJobError) {
        throw new BlenderJobError(err.code, `${NODE_NAME}: ${err.message}`);
      }
      if (err instanceof Error) {
        throw new Error(`${NODE_NAME}: ${err.message}`);
      }
      throw new Error(`${NODE_NAME}: ${String(err)}`);
    }
  }
}

export const BLENDER_RENDER_NODES = [RenderImageNode] as const;
