/**
 * The Blender job contract (D4).
 *
 * Every node produces a `BlenderJob`; the Python side consumes it and writes
 * a `BlenderResult`. Both are versioned so the TypeScript and Python halves
 * can drift by one version during an upgrade.
 *
 * The job names every file on both sides. The result never names a file: it
 * reports which declared outputs were produced, and the host reads only the
 * paths the job itself declared. A `produced` name the job did not declare
 * is ignored, and a path inside `result.json` is never opened.
 */

import { z } from "zod";

/** Version both halves agree on. `run_job.py` rejects anything else. */
export const BLENDER_JOB_VERSION = 1 as const;

/** A bare file name: no separator, no `..`, no leading dot. */
export const jobFileNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/);

export type CameraMode = "auto" | "scene" | "orbit";
export type BlenderEngine = "eevee" | "cycles";
export type LightingPreset = "studio" | "soft" | "flat";
export type RenderPass = "color" | "depth" | "normal" | "mask";
export type DepthFormat = "png16" | "exr";
export type BakeMode = "none" | "ao" | "normal" | "both";
export type ExportFormat = "fbx" | "obj" | "usd";

/**
 * Shared camera vocabulary. Reuses the `RenderToImage` prop names so a user
 * can swap the preview node for the Blender node without relearning.
 */
export interface CameraParams {
  /** Whose camera renders; `auto` is the scene's first camera when present. */
  camera_mode: CameraMode;
  azimuth: number;
  elevation: number;
  fov: number;
  zoom: number;
  lighting: LightingPreset;
  light_intensity: number;
  background_color: string;
  transparent: boolean;
  engine: BlenderEngine;
  samples: number;
  denoise: boolean;
  resolution_percentage: number;
}

export interface RenderImageParams extends CameraParams {
  width: number;
  height: number;
}

export interface RenderPassesParams extends CameraParams {
  width: number;
  height: number;
  passes: RenderPass[];
  depth_format: DepthFormat;
}

/**
 * One frame's camera in a sampled render (design §D6). `CameraParams` plus the
 * two things a timeline clip's camera carries that the DTO did not: which glTF
 * camera `scene` mode renders through, and where the orbit looks.
 */
export interface BakeCameraParams extends CameraParams {
  /** `scene` mode: the glTF camera by name; the first one when absent. */
  scene_camera_name?: string;
  /** Look-at offset from the bounding-sphere center, in world units. */
  target_offset?: [number, number, number];
}

export interface RenderAnimationParams extends CameraParams {
  width: number;
  height: number;
  /** First frame in the glTF timeline (`round(t * fps)` per animation channel). */
  frame_start: number;
  frame_end: number;
  fps: number;
  /** Orbit sweep in degrees across the range when glTF has no animation. */
  orbit_degrees: number;
  /**
   * Sampled mode (§D6): one model time in seconds per output frame. Present
   * turns the op into a still-per-entry render — the frame range, the orbit
   * sweep and the video writer are all unused — and it writes
   * `frame_%06d.png` for the caller to mux. Absent leaves the op exactly as
   * it was, which is what keeps `RenderAnimation` unchanged.
   */
  frame_times?: number[];
  /**
   * Which glTF animation plays in sampled mode. Absent leaves every action
   * playing, which is the default a `model3d` clip carries.
   */
  animation_name?: string;
  /** The camera of each `frame_times` entry. Must be the same length. */
  cameras?: BakeCameraParams[];
}

export interface PrepareForEngineParams {
  target_faces: number;
  unwrap: boolean;
  bake: BakeMode;
  bake_resolution: number;
  lod_count: number;
}

export interface ExportModelParams {
  format: ExportFormat;
}

export type BlenderOp =
  | { op: "render_image"; params: RenderImageParams }
  | { op: "render_passes"; params: RenderPassesParams }
  | { op: "render_animation"; params: RenderAnimationParams }
  | { op: "prepare_for_engine"; params: PrepareForEngineParams }
  | { op: "export_model"; params: ExportModelParams };

export interface BlenderJob {
  version: typeof BLENDER_JOB_VERSION;
  /** Logical input name -> bare file name. The runner writes these. */
  inputs: { model: string };
  /** Logical output name -> bare file name the op must write. */
  outputs: Record<string, string>;
  job: BlenderOp;
}

const blenderErrorCodes = [
  "import_failed",
  "no_geometry",
  "no_camera",
  "unsupported_format",
  "render_failed",
  "export_failed",
  "bake_failed",
  "bad_job"
] as const;

export type BlenderResultErrorCode = (typeof blenderErrorCodes)[number];

export const blenderResultSchema = z.discriminatedUnion("ok", [
  z.object({
    ok: z.literal(true),
    /** Logical output names the op wrote. Must be a subset of job.outputs. */
    produced: z.array(z.string()),
    stats: z.object({
      blender_version: z.string(),
      render_seconds: z.number(),
      frames: z.number().int().optional(),
      objects: z.number().int().optional(),
      /** `render_passes` with depth: min/max finite foreground depth (D4). */
      depth_near: z.number().optional(),
      depth_far: z.number().optional(),
      /**
       * Name of the camera that rendered (`render_image` only): the scene
       * camera's name, or the orbit camera the op created. Lets the
       * camera-mode test assert the selection without reading pixels.
       */
      camera: z.string().optional(),
      /**
       * Sampled `render_animation` only: the world-space location the camera
       * held for each rendered frame, in order. What a camera-move test reads
       * instead of comparing pixels.
       */
      frame_camera_locations: z
        .array(z.tuple([z.number(), z.number(), z.number()]))
        .optional()
    })
  }),
  z.object({
    ok: z.literal(false),
    error: z.object({
      code: z.enum(blenderErrorCodes),
      message: z.string()
    })
  })
]);

export type BlenderResult = z.infer<typeof blenderResultSchema>;
export type BlenderResultStats = Extract<BlenderResult, { ok: true }>["stats"];
