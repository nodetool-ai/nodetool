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

export interface RenderAnimationParams extends CameraParams {
  width: number;
  height: number;
  /** First frame in the glTF timeline (`round(t * fps)` per animation channel). */
  frame_start: number;
  frame_end: number;
  fps: number;
  /** Orbit sweep in degrees across the range when glTF has no animation. */
  orbit_degrees: number;
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
      objects: z.number().int().optional()
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
