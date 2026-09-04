/**
 * `nodetool.blender.RenderAnimation` — glTF scene + camera → video via Blender.
 *
 * Stage 2: the `render_animation` op over `LocalBlenderRunner` (D8). Takes
 * a `Model3DRef`, builds the versioned `BlenderJob` for the frame range at
 * `fps`, and returns an inline video ref like the video nodes, so
 * downstream save nodes decide persistence. The scene fps is set to `fps`
 * before import, so a glTF animation timestamp `t` seconds lands on frame
 * `round(t * fps)`; with no glTF animation under `camera_mode: orbit` the
 * orbit turns `orbit_degrees` across the range. Video comes from Blender's
 * own FFMPEG writer (MPEG-4, H.264, `yuv420p`), and per-frame `Fra:`
 * progress reaches the run as `node_progress` messages.
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
import { blenderProgressHandler } from "./progress.js";

const NODE_NAME = "nodetool.blender.RenderAnimation";

/** Output handle RenderAnimationNode.process() emits. */
type RenderAnimationNodeOutputs = {
  video: { type: string; uri: string; asset_id: null; data: string };
};

/** Blender ran past its wall clock: point at the two knobs that fix it. */
function timeoutMessage(timeoutMs: number): string {
  return (
    `${NODE_NAME}: Blender animation render timed out after ${timeoutMs}ms. ` +
    `Lower the samples, use EEVEE, shorten the range, or raise the timeout.`
  );
}

export class RenderAnimationNode extends BaseNode {
  static readonly nodeType = "nodetool.blender.RenderAnimation";
  static readonly title = "Render 3D Animation With Blender";
  static readonly description =
    "Render a 3D model (GLB/glTF) to a video with Blender: glTF animations play on their timeline, or the orbit camera sweeps across the frame range.\n    3d, render, animation, video, camera, orbit, blender, eevee, cycles\n\n    Use cases:\n    - Turn an animated 3D model into a video\n    - Sweep the camera around a static scene for a turntable clip\n    - Feed camera-consistent frames into video models";
  static readonly metadataOutputTypes = {
    video: "video"
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
      "Whose camera renders: auto (the scene's first camera when the model has one, else an orbit camera), scene (the scene's first camera; an error when the model has none), or orbit (always an orbit camera from the props below; with no glTF animation it sweeps orbit_degrees across the range)",
    values: ["auto", "scene", "orbit"]
  })
  declare camera_mode: any;

  @prop({ type: "int", default: 1024, title: "Width", description: "Output video width in pixels", min: 16, max: 4096 })
  declare width: any;

  @prop({ type: "int", default: 1024, title: "Height", description: "Output video height in pixels", min: 16, max: 4096 })
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

  @prop({ type: "bool", default: false, title: "Transparent", description: "Render on a transparent background (video alpha; container support varies)" })
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

  @prop({ type: "int", default: 1, title: "Frame Start", description: "First frame in the glTF timeline (timestamp t seconds lands on round(t * fps))", min: 0, max: 100000 })
  declare frame_start: any;

  @prop({ type: "int", default: 24, title: "Frame End", description: "Last frame rendered, inclusive", min: 0, max: 100000 })
  declare frame_end: any;

  @prop({ type: "int", default: 24, title: "FPS", description: "Scene frames per second; glTF animation timestamps map onto this timeline", min: 1, max: 120 })
  declare fps: any;

  @prop({ type: "float", default: 360, title: "Orbit Degrees", description: "Camera sweep in degrees across the range when the model has no animation and Camera Mode is orbit", min: -1080, max: 1080 })
  declare orbit_degrees: any;

  @prop({ type: "int", default: 600, title: "Timeout", description: "Maximum render time in seconds", min: 1, max: 3600 })
  declare timeout: any;

  async process(context?: ProcessingContext): Promise<RenderAnimationNodeOutputs> {
    const bytes = await resolveModelBytes(
      (this.model ?? {}) as { data?: Uint8Array | string; uri?: string },
      context
    );
    if (bytes.length === 0) {
      throw new Error(
        `${NODE_NAME}: model input is empty — connect a 3D model (GLB)`
      );
    }
    const frameStart = Math.max(0, Math.round(Number(this.frame_start ?? 1)));
    const frameEnd = Math.max(
      frameStart,
      Math.round(Number(this.frame_end ?? 24))
    );

    const timeoutMs = Math.max(1, Number(this.timeout ?? 600)) * 1000;
    try {
      const result = await runBlenderJob(
        context,
        bytes,
        {
          op: "render_animation",
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
            height: Math.max(1, Math.round(Number(this.height ?? 1024))),
            frame_start: frameStart,
            frame_end: frameEnd,
            fps: Math.max(1, Math.round(Number(this.fps ?? 24))),
            orbit_degrees: Number(this.orbit_degrees ?? 360)
          }
        },
        { video: "anim.mp4" },
        {
          timeoutMs,
          signal: context?.signal,
          onProgress: blenderProgressHandler(context, this.__node_id)
        }
      );
      const mp4 = result.outputs["video"];
      if (!mp4 || mp4.length === 0) {
        throw new BlenderJobError(
          "missing_output",
          "Blender produced no video bytes."
        );
      }
      return {
        video: {
          type: "video",
          uri: "",
          asset_id: null,
          data: bytesToBase64(mp4)
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

export const BLENDER_ANIMATION_NODES = [RenderAnimationNode] as const;
