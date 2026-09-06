/**
 * `nodetool.blender.RenderPasses` — glTF scene + camera → control passes.
 *
 * Stage 2: the `render_passes` op over `LocalBlenderRunner` (D8). Takes a
 * `Model3DRef`, builds the versioned `BlenderJob` for the selected `passes`
 * subset, and returns inline image refs like `RenderToImage`, so downstream
 * save nodes decide persistence. Unselected passes come back as empty-data
 * refs and `depth_near`/`depth_far` as 0. Output contracts in D4.
 *
 * Every failure rethrows with the node name prefixed. An abort through
 * `context.signal` passes through unwrapped so the node rejects with the
 * abort reason and no partial output.
 */

import { prop } from "@nodetool-ai/node-sdk";
import { bytesToBase64, resolveModelBytes } from "@nodetool-ai/nodes-utils";
import type { ProcessingContext } from "@nodetool-ai/runtime";

import type { DepthFormat, RenderPass } from "../job.js";
import { BlenderJobError } from "../runner.js";
import { runBlenderJob } from "../run-job.js";
import { runBlenderNodeStep } from "./blender-error.js";
import { blenderProgressHandler } from "./progress.js";
import { BlenderRenderBase } from "./render-base.js";

const NODE_NAME = "nodetool.blender.RenderPasses";

const KNOWN_PASSES: readonly RenderPass[] = ["color", "depth", "normal", "mask"];

/** An inline `image` ref carrying PNG or EXR bytes, like `RenderToImage`'s. */
interface InlineImageRef {
  type: string;
  uri: string;
  asset_id: null;
  data: string;
}

/** Output handles RenderPassesNode.process() emits. */
type RenderPassesNodeOutputs = {
  color: InlineImageRef;
  depth: InlineImageRef;
  depth_near: number;
  depth_far: number;
  normal: InlineImageRef;
  mask: InlineImageRef;
};

/** Blender ran past its wall clock: point at the two knobs that fix it. */
function timeoutMessage(timeoutMs: number): string {
  return (
    `${NODE_NAME}: Blender passes render timed out after ${timeoutMs}ms. ` +
    `Lower the samples, use EEVEE, or raise the timeout.`
  );
}

function emptyImageRef(): InlineImageRef {
  return { type: "image", uri: "", asset_id: null, data: "" };
}

export class RenderPassesNode extends BlenderRenderBase {
  static readonly nodeType = "nodetool.blender.RenderPasses";
  static readonly title = "Render 3D Passes With Blender";
  static readonly description =
    "Render a 3D model (GLB/glTF) to control passes with Blender: beauty color, 16-bit or EXR depth with near/far range, camera-space normals, and a binary foreground mask.\n    3d, render, depth, normal, mask, passes, controlnet, blender, camera, light\n\n    Use cases:\n    - Feed video models with camera-consistent frames and control passes from the same scene\n    - Read per-pixel depth with a known near/far range\n    - Mask the foreground for compositing";
  static readonly metadataOutputTypes = {
    color: "image",
    depth: "image",
    depth_near: "float",
    depth_far: "float",
    normal: "image",
    mask: "image"
  };
  static readonly inlineFields = [];
  static readonly inputFields = ["model"];

  @prop({
    type: "list[str]",
    default: ["color", "depth", "normal", "mask"],
    title: "Passes",
    description:
      "Passes to produce: color (beauty), depth (view-axis distance), normal (camera-space), mask (binary foreground)"
  })
  declare passes: RenderPass[];

  @prop({
    type: "enum",
    default: "png16",
    title: "Depth Format",
    description:
      "Depth encoding: png16 (normalized between depth_near and depth_far, background 65535) or exr (raw float, background +inf)",
    values: ["png16", "exr"]
  })
  declare depth_format: DepthFormat;

  @prop({ type: "int", default: 600, title: "Timeout", description: "Maximum render time in seconds", min: 1, max: 3600 })
  declare timeout: number;

  async process(context?: ProcessingContext): Promise<RenderPassesNodeOutputs> {
    const bytes = await resolveModelBytes(this.model, context);
    if (bytes.length === 0) {
      throw new Error(
        `${NODE_NAME}: model input is empty — connect a 3D model (GLB)`
      );
    }
    // A `passes` value that is not a list selects nothing, and the empty
    // selection below is the refusal the user sees.
    const requested = this.passes ?? KNOWN_PASSES;
    const passes = Array.isArray(requested)
      ? KNOWN_PASSES.filter((name) => requested.includes(name))
      : [];
    if (passes.length === 0) {
      throw new BlenderJobError(
        "bad_job",
        `${NODE_NAME}: select at least one pass (color, depth, normal, mask).`
      );
    }
    const depthFormat = this.depth_format ?? "png16";

    const outputs: Record<string, string> = {};
    if (passes.includes("color")) outputs["color"] = "color.png";
    if (passes.includes("depth")) {
      outputs["depth"] = depthFormat === "exr" ? "depth.exr" : "depth.png";
    }
    if (passes.includes("normal")) outputs["normal"] = "normal.png";
    if (passes.includes("mask")) outputs["mask"] = "mask.png";

    const timeoutMs = Math.max(1, Number(this.timeout ?? 600)) * 1000;
    return runBlenderNodeStep(
      {
        nodeName: NODE_NAME,
        timeoutMessage: timeoutMessage(timeoutMs),
        signal: context?.signal
      },
      async () => {
        const result = await runBlenderJob(
          context,
          bytes,
          {
            op: "render_passes",
            params: {
              camera_mode: this.camera_mode ?? "auto",
              azimuth: Number(this.azimuth ?? 45),
              elevation: Number(this.elevation ?? 25),
              fov: Number(this.fov ?? 35),
              zoom: Number(this.zoom ?? 1),
              lighting: this.lighting ?? "studio",
              light_intensity: Number(this.light_intensity ?? 1),
              background_color: String(this.background_color ?? "#808080"),
              transparent: this.transparent === true,
              engine: this.engine ?? "eevee",
              samples: Math.max(1, Math.round(Number(this.samples ?? 16))),
              denoise: this.denoise !== false,
              resolution_percentage: Math.max(
                1,
                Math.round(Number(this.resolution_percentage ?? 100))
              ),
              width: Math.max(1, Math.round(Number(this.width ?? 1024))),
              height: Math.max(1, Math.round(Number(this.height ?? 1024))),
              passes,
              depth_format: depthFormat
            }
          },
          outputs,
          {
            timeoutMs,
            signal: context?.signal,
            onProgress: blenderProgressHandler(context, this.__node_id)
          }
        );
        const imageOut = (name: RenderPass): InlineImageRef => {
          if (!passes.includes(name)) return emptyImageRef();
          const raw = result.outputs[name];
          if (!raw || raw.length === 0) {
            throw new BlenderJobError(
              "missing_output",
              `Blender produced no bytes for pass "${name}".`
            );
          }
          return {
            type: "image",
            uri: "",
            asset_id: null,
            data: bytesToBase64(raw)
          };
        };
        let depthNear = 0;
        let depthFar = 0;
        if (passes.includes("depth")) {
          // `blenderResultSchema` already parsed both as optional numbers,
          // so absent is the only failure left to report.
          const near = result.stats.depth_near;
          const far = result.stats.depth_far;
          if (near === undefined || far === undefined) {
            throw new BlenderJobError(
              "missing_output",
              "Blender produced no depth range (depth_near/depth_far)."
            );
          }
          depthNear = near;
          depthFar = far;
        }
        return {
          color: imageOut("color"),
          depth: imageOut("depth"),
          depth_near: depthNear,
          depth_far: depthFar,
          normal: imageOut("normal"),
          mask: imageOut("mask")
        };
      }
    );
  }
}

export const BLENDER_PASSES_NODES = [RenderPassesNode] as const;
