/**
 * @nodetool-ai/llm-nodes — Shot pipeline nodes.
 *
 * ShotBatch flattens a {@link Screenplay} into generation-ready shot specs (one
 * prompt + timing + optional keyframe per shot). ShotChain animates those specs
 * into clips sequentially, feeding each clip's last frame into the next shot's
 * first frame for cross-shot continuity. The pure helpers (toShotSpecs,
 * planShotChain) carry the logic so they can be unit-tested without a provider.
 */

import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type { ImageRef, VideoRef } from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import { loadMediaRefBytes } from "@nodetool-ai/runtime";
import type { Screenplay, Shot } from "@nodetool-ai/protocol";
import { isScreenplay } from "@nodetool-ai/protocol";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import { execFile as execFileCb } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { composeShotPrompt } from "./director.js";

const execFile = promisify(execFileCb);

/** Structural type for the `video_model` prop (provider + model id). */
interface VideoModelRef {
  type: "video_model";
  provider?: string;
  id?: string;
  name?: string;
  path?: string | null;
  supported_tasks?: unknown[];
}

const DEFAULT_VIDEO_MODEL: VideoModelRef = {
  type: "video_model",
  provider: "gemini",
  id: "veo-3.1-generate-preview",
  name: "Veo 3.1 Preview",
  path: null,
  supported_tasks: []
};

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested; no context / network dependency)
// ---------------------------------------------------------------------------

function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalStr(value: unknown): string | undefined {
  const s = str(value).trim();
  return s.length > 0 ? s : undefined;
}

function optionalNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function asImageRef(value: unknown): ImageRef | null {
  return value && typeof value === "object" ? (value as ImageRef) : null;
}

/** A generation-ready spec for one shot, produced by {@link toShotSpecs}. */
export interface ShotSpec {
  index: number;
  prompt: string;
  aspect_ratio: string;
  duration_seconds: number;
  keyframe: ImageRef | null;
}

/** Options controlling the fan-out in {@link toShotSpecs}. */
export interface ShotSpecOptions {
  aspectRatio?: string;
  defaultDuration?: number;
}

/** Coerce a screenplay-shaped value (typed or plain dict) to a {@link Shot}. */
function coerceShot(raw: unknown, index: number): Shot {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const shot: Shot = {
    type: "shot",
    id: str(obj.id) || `shot-${index}`,
    index: optionalNumber(obj.index) ?? index,
    action: str(obj.action),
    status: "planned"
  };
  if (obj.camera && typeof obj.camera === "object") {
    shot.camera = obj.camera as Shot["camera"];
  }
  const motion = optionalStr(obj.motion);
  if (motion) shot.motion = motion;
  const duration = optionalNumber(obj.duration_seconds);
  if (duration !== undefined) shot.duration_seconds = duration;
  const keyframe = asImageRef(obj.keyframe);
  if (keyframe) shot.keyframe = keyframe;
  return shot;
}

/**
 * Coerce any screenplay-shaped input (a typed {@link Screenplay} or a plain
 * dict) to a Screenplay, preserving each shot's keyframe. Unlike the Director's
 * `parseScreenplay`, this never clamps or drops keyframes — it feeds the shot
 * chain, which must keep the storyboard stills.
 */
function coerceScreenplay(raw: unknown): Screenplay {
  if (isScreenplay(raw)) return raw;
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const rawShots = Array.isArray(obj.shots) ? obj.shots : [];
  const screenplay: Screenplay = {
    type: "screenplay",
    id: str(obj.id) || "screenplay-1",
    title: str(obj.title) || "Untitled Screenplay",
    shots: rawShots.map((rawShot, i) => coerceShot(rawShot, i))
  };
  const styleBible = optionalStr(obj.style_bible);
  if (styleBible) screenplay.style_bible = styleBible;
  const aspectRatio = optionalStr(obj.aspect_ratio);
  if (aspectRatio) screenplay.aspect_ratio = aspectRatio;
  return screenplay;
}

/**
 * Flatten a screenplay into one generation-ready {@link ShotSpec} per shot:
 * a composed prompt, the shared aspect ratio, a per-shot (or default) duration,
 * and the shot's keyframe when it already has one.
 */
export function toShotSpecs(
  screenplay: unknown,
  opts: ShotSpecOptions = {}
): ShotSpec[] {
  const sp = coerceScreenplay(screenplay);
  const aspectRatio = optionalStr(opts.aspectRatio) ?? sp.aspect_ratio ?? "16:9";
  const defaultDuration =
    optionalNumber(opts.defaultDuration) !== undefined
      ? (opts.defaultDuration as number)
      : 4;
  return sp.shots.map((shot) => ({
    index: shot.index,
    prompt: composeShotPrompt(shot, sp),
    aspect_ratio: aspectRatio,
    duration_seconds: shot.duration_seconds ?? defaultDuration,
    keyframe: shot.keyframe ?? null
  }));
}

/** Where a shot's first frame comes from when the chain generates it. */
export type ChainSeed = "keyframe" | "previous" | "none";

/** One ordered step in a shot chain: which shot, seeded from where. */
export interface ChainStep {
  index: number;
  seedFrom: ChainSeed;
}

/**
 * Plan the seeding order for a sequential shot chain: the first shot is seeded
 * from its own keyframe (or nothing when it has none); every later shot is
 * seeded from the previous clip's last frame for continuity.
 */
export function planShotChain(specs: ShotSpec[]): ChainStep[] {
  const list = Array.isArray(specs) ? specs : [];
  return list.map((spec, i) => ({
    index: spec.index ?? i,
    seedFrom: i === 0 ? (spec.keyframe ? "keyframe" : "none") : "previous"
  }));
}

// ---------------------------------------------------------------------------
// Nodes
// ---------------------------------------------------------------------------

export class ShotBatchNode extends BaseNode {
  static readonly nodeType = "nodetool.creative.ShotBatch";
  static readonly title = "Shot Batch";
  static readonly description =
    "Flatten a screenplay into generation-ready shot specs (prompt, timing, keyframe).\n    creative, shots, batch, screenplay, prompts\n\n    Use cases:\n    - Preparing a screenplay's shots for batch keyframe/clip generation\n    - Producing one prompt + duration per shot in a single list\n    - Feeding the Shot Chain node a ready-to-render spec list";
  static readonly metadataOutputTypes = {
    shots: "list[dict]"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["screenplay"];

  @prop({
    type: "dict",
    default: {},
    title: "Screenplay",
    description: "The screenplay to flatten into per-shot generation specs."
  })
  declare screenplay: Record<string, unknown>;

  @prop({
    type: "str",
    default: "16:9",
    title: "Aspect Ratio",
    description: "Aspect ratio applied to every shot spec (e.g. 16:9, 9:16, 1:1)."
  })
  declare aspect_ratio: string;

  @prop({
    type: "int",
    default: 4,
    title: "Default Duration",
    description: "Clip length in seconds for shots without their own duration.",
    min: 1,
    max: 60
  })
  declare default_duration: number;

  async process(): Promise<Record<string, unknown>> {
    const shots = toShotSpecs(this.screenplay, {
      aspectRatio: str(this.aspect_ratio ?? "").trim() || "16:9",
      defaultDuration: Number(this.default_duration ?? 4)
    });
    return { shots };
  }
}

export class ShotChainNode extends BaseNode {
  static readonly nodeType = "nodetool.creative.ShotChain";
  static readonly title = "Shot Chain";
  static readonly description =
    "Animate a list of shot specs into clips sequentially, seeding each shot's first frame from the previous clip's last frame for continuity.\n    creative, shots, video, continuity, chain\n\n    Use cases:\n    - Turning a storyboard's shots into a continuous animated sequence\n    - Keeping motion and framing consistent across generated clips\n    - Rendering a directed shot list into a cut-ready set of videos";
  static readonly requiredRuntimes = ["ffmpeg"];
  static readonly metadataOutputTypes = {
    videos: "list[video]"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields = ["shots"];

  @prop({
    type: "video_model",
    default: DEFAULT_VIDEO_MODEL,
    title: "Model",
    description: "The video generation model used to animate each shot."
  })
  declare model: VideoModelRef;

  @prop({
    type: "list[dict]",
    default: [],
    title: "Shots",
    description:
      "Shot specs (from Shot Batch): each with a prompt, optional keyframe, and duration."
  })
  declare shots: unknown[];

  @prop({
    type: "str",
    default: "16:9",
    title: "Aspect Ratio",
    description: "Aspect ratio for the generated clips (e.g. 16:9, 9:16, 1:1)."
  })
  declare aspect_ratio: string;

  @prop({
    type: "str",
    default: "720p",
    title: "Resolution",
    description: "Resolution for the generated clips (e.g. 720p, 1080p)."
  })
  declare resolution: string;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const specs = (Array.isArray(this.shots) ? this.shots : []).map((raw, i) =>
      coerceSpec(raw, i)
    );
    const plan = planShotChain(specs);

    const videos: VideoRef[] = [];
    let lastFrame: ImageRef | null = null;
    // plan[i] describes specs[i] positionally; step.index is the shot's own
    // label and must not be used as an array subscript (subset/reordered
    // lists would pair the wrong spec).
    for (let i = 0; i < plan.length; i += 1) {
      const step = plan[i];
      const spec = specs[i];
      if (!spec) continue;
      const startImage =
        step.seedFrom === "keyframe"
          ? spec.keyframe
          : step.seedFrom === "previous"
            ? lastFrame
            : null;
      const clip = await this.generateClip(context, spec, startImage);
      videos.push(clip);
      lastFrame = await this.extractLastFrame(clip, context);
    }
    return { videos };
  }

  /**
   * Wrap the same provider path ImageToVideo uses: dispatch the model's
   * `image_to_video` capability with the shot prompt, the seed image bytes, and
   * this node's aspect ratio / resolution / the shot's duration.
   */
  private async generateClip(
    context: ProcessingContext | undefined,
    spec: ShotSpec,
    startImage: ImageRef | null
  ): Promise<VideoRef> {
    const providerId = str(this.model?.provider);
    const modelId = str(this.model?.id);
    if (
      !context ||
      typeof context.runProviderPrediction !== "function" ||
      !providerId ||
      !modelId
    ) {
      throw new Error("No provider available for shot chain generation.");
    }

    const images: Uint8Array[] = [];
    if (startImage) {
      const bytes = await loadMediaRefBytes(startImage, context);
      if (bytes && bytes.length > 0) images.push(bytes);
    }

    const output = await context.runProviderPrediction({
      provider: providerId,
      capability: "image_to_video",
      model: modelId,
      params: {
        images,
        prompt: spec.prompt,
        aspect_ratio: str(this.aspect_ratio ?? "").trim() || spec.aspect_ratio,
        resolution: str(this.resolution ?? "").trim() || "720p",
        duration_seconds: Number(spec.duration_seconds) || undefined
      }
    });
    const bytes = coerceProviderBytes(output);
    return {
      type: "video",
      data: Buffer.from(bytes).toString("base64")
    };
  }

  /**
   * Extract the clip's last frame (the seed for the next shot). Mirrors the
   * ExtractFrame node's ffmpeg approach, seeking near the end and letting
   * `-update 1` leave the final decoded frame. Returns null when the frame
   * cannot be produced, so the chain simply drops continuity for that step.
   */
  private async extractLastFrame(
    clip: VideoRef,
    context: ProcessingContext | undefined
  ): Promise<ImageRef | null> {
    const bytes = await loadMediaRefBytes(clip, context);
    if (!bytes || bytes.length === 0) return null;

    const workDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "nodetool-shotchain-")
    );
    const inputPath = path.join(workDir, "clip.mp4");
    const outputPath = path.join(workDir, "last.png");
    try {
      await fs.writeFile(inputPath, bytes);
      await execFile(
        "ffmpeg",
        [
          "-y",
          "-sseof",
          "-1",
          "-i",
          inputPath,
          "-update",
          "1",
          "-frames:v",
          "1",
          outputPath
        ],
        { maxBuffer: 10 * 1024 * 1024 }
      );
      const frame = new Uint8Array(await fs.readFile(outputPath));
      return {
        type: "image",
        data: Buffer.from(frame).toString("base64")
      };
    } catch {
      // A frame we cannot extract just means this step loses continuity — the
      // next shot falls back to a text-only animation instead of failing.
      return null;
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  }
}

/** Coerce a raw list[dict] item into a {@link ShotSpec}. */
function coerceSpec(raw: unknown, index: number): ShotSpec {
  const obj =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    index: optionalNumber(obj.index) ?? index,
    prompt: str(obj.prompt),
    aspect_ratio: optionalStr(obj.aspect_ratio) ?? "16:9",
    duration_seconds: optionalNumber(obj.duration_seconds) ?? 4,
    keyframe: asImageRef(obj.keyframe)
  };
}

/** Normalize provider-prediction output to `Uint8Array`. */
function coerceProviderBytes(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) return value;
  if (value instanceof ArrayBuffer) return new Uint8Array(value);
  throw new Error(
    "Shot Chain: provider returned no video bytes (expected Uint8Array/Buffer)."
  );
}

export const SHOTS_NODES = tagAsServer([ShotBatchNode, ShotChainNode]);
