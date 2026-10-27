import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type {
  Entity,
  InputMode,
  OutputCorrelation,
  FolderRef
} from "@nodetool-ai/protocol";
import { isRawRgbaImage } from "@nodetool-ai/protocol";
import type {
  VideoRef,
  ImageRef,
  AudioRef,
  StreamingInputs,
  StreamingOutputs
} from "@nodetool-ai/node-sdk";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import {
  loadMediaRefBytes,
  mapPromptAssetsToInputs,
  resolveEntities
} from "@nodetool-ai/runtime";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  audioBytesAsync,
  toBytes
} from "@nodetool-ai/audio-nodes";
import {
  concatCopy,
  concatSegments,
  convertAudioToWav,
  openFilterGraph,
  openVideoFrameEncoder,
  packetTimes,
  pngFrames,
  probeDurationSec,
  probeMedia,
  probeVideoStream,
  transformMedia,
  type StreamPlan
} from "@nodetool-ai/runtime/media";
import {
  videoRef,
  defaultVideoRef,
  filePath,
  folderPath,
  dateName,
  uniqueTargetPath,
  probeVideoInfo,
  withTempFile,
  coerceProviderBytes
} from "./video-helpers.js";
import {
  EASE_CURVE_PRESETS,
  easeCurveEasing,
  easeCurveFilterGraph,
  easeCurveSegments
} from "./easeCurve.js";
import {
  isObjectLike,
  isString
} from "@nodetool-ai/node-sdk";
import {
  writeSavedFile,
  VISIBLE_WHEN_NOT_SAVING_TO_WORKSPACE,
  SAVE_TO_WORKSPACE_DESCRIPTION,
  SAVE_TO_WORKSPACE_TITLE
} from "@nodetool-ai/nodes-utils";

type VideoRefLike = { uri?: string; data?: Uint8Array | string };
type ImageRefLike = { uri?: string; data?: Uint8Array | string };

/** Structural type for the `video_model` prop (provider + model id). */
interface VideoModelRef {
  type: "video_model";
  provider?: string;
  id?: string;
  name?: string;
  path?: string | null;
  supported_tasks?: unknown[];
}

/** Structural type for the `color` prop. */
interface ColorRef {
  type: "color";
  value?: string;
}

/** Structural type for the `font` prop. */
interface FontLike {
  type: "font";
  name?: string;
  source?: string;
  url?: string;
  weight?: string;
}

/** Structural type for a subtitle `audio_chunk`. */
interface SubtitleChunk {
  text?: string;
  content?: string;
  timestamp?: unknown[];
  start?: number;
  end?: number;
}

async function videoBytesAsync(video: unknown, context?: ProcessingContext): Promise<Uint8Array> {
  if (!isObjectLike(video)) return new Uint8Array();
  const bytes = await loadMediaRefBytes(video as VideoRefLike, context);
  return bytes ?? new Uint8Array();
}

async function imageBytesAsync(
  image: unknown,
  context?: ProcessingContext
): Promise<Uint8Array> {
  if (!isObjectLike(image)) return new Uint8Array();
  const bytes = await loadMediaRefBytes(image as ImageRefLike, context);
  return bytes ?? new Uint8Array();
}

/**
 * Whether an image ref already points at a source (wired upstream, a stored
 * asset, or inline bytes) rather than the empty default — used to decide if an
 * inline `asset://` mention in the prompt should supply the input.
 */
function imageRefHasSource(image: unknown): boolean {
  if (!isObjectLike(image)) return false;
  const ref = image as ImageRefLike & { asset_id?: unknown };
  if (isString(ref.uri) && ref.uri.trim() !== "") return true;
  if (ref.data != null && ref.data !== "") return true;
  return ref.asset_id != null && ref.asset_id !== "";
}

/**
 * Normalize an image input that may be a single ImageRef (legacy single-image
 * wiring) or a list of refs into an array, dropping non-object entries.
 */
function normalizeImageList(value: unknown): ImageRefLike[] {
  const items = Array.isArray(value) ? value : value != null ? [value] : [];
  return items.filter(
    (item): item is ImageRefLike => !!item && typeof item === "object"
  );
}

/**
 * Normalize a video input that may be a single VideoRef or a list of refs into
 * an array, dropping non-object entries. Lets a concat input accept either a
 * single wired video or a `list<video>` from an upstream loop/list node.
 */
function normalizeVideoList(value: unknown): VideoRefLike[] {
  const items = Array.isArray(value) ? value : value != null ? [value] : [];
  return items.filter(
    (item): item is VideoRefLike => !!item && typeof item === "object"
  );
}

/**
 * The crop cropdetect settles on over the whole clip after `filter`, as
 * `w:h:x:y`, or null when it suggests none. cropdetect tags every frame with
 * its running suggestion; the last frame's reflects the full analysis.
 */
async function detectCrop(filePath: string, filter: string): Promise<string | null> {
  const run = await openFilterGraph({ filePath, kind: "video", filter: `${filter},cropdetect=24:16:0` });
  if (!run) return null;
  let crop: string | null = null;
  try {
    for await (const frame of run.frames()) {
      try {
        const tags = frame.getMetadata().getAll();
        const [w, h, x, y] = ["w", "h", "x", "y"].map((key) => tags[`lavfi.cropdetect.${key}`]);
        if (w && h && x && y) crop = `${w}:${h}:${x}:${y}`;
      } finally {
        frame.free();
      }
    }
  } finally {
    await run.close();
  }
  return crop;
}

/**
 * Encode a sequence of frame refs into an H.264 MP4.
 *
 * Frames arrive in one of two shapes:
 *   - In-flight **raw-RGBA** refs ({@link isRawRgbaImage}) carry uncompressed
 *     pixels in `data` plus `width`/`height`. These are NOT a decodable image.
 *   - **Encoded** refs carry PNG, JPEG or WebP bytes (Uint8Array or base64
 *     string).
 *
 * A frame sequence from a single generator is homogeneous, so the encoding of
 * the first usable frame selects the path; stray frames of the other kind (or
 * with mismatched raw dimensions) are skipped.
 */
async function combineFramesToVideo(
  frames: unknown[],
  fps: number
): Promise<Uint8Array> {
  const isUsable = (f: unknown): boolean => {
    if (!isObjectLike(f)) return false;
    if (isRawRgbaImage(f)) return f.data.length > 0;
    return toBytes((f as { data?: Uint8Array | string }).data).length > 0;
  };
  const first = frames.find(isUsable);
  if (!first) return new Uint8Array();

  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-ftv-out-"));
  const outputPath = path.join(outputDir, "output.mp4");
  try {
    const size = isRawRgbaImage(first) ? { width: first.width, height: first.height } : null;
    const encoder = await openVideoFrameEncoder({
      outPath: outputPath,
      fps,
      input: size ? "rgba" : "png",
      width: size?.width,
      height: size?.height,
      spec: { codec: "libx264", pixelFormat: "yuv420p" }
    });
    let written = 0;
    try {
      for (const f of frames) {
        if (size) {
          // 300 frames of 1080p RGBA is ~2.5 GB, so each frame goes to the
          // encoder as it is visited rather than into one buffer.
          if (isRawRgbaImage(f) && f.data.length > 0 && f.width === size.width && f.height === size.height) {
            await encoder.write(f.data);
            written += 1;
          }
        } else if (isObjectLike(f) && !isRawRgbaImage(f)) {
          const frameBytes = toBytes((f as { data?: Uint8Array | string }).data);
          if (frameBytes.length === 0) continue;
          await encoder.write(frameBytes);
          written += 1;
        }
      }
      if (written === 0) {
        await encoder.abort();
        return new Uint8Array();
      }
      await encoder.finish();
    } catch (error) {
      await encoder.abort();
      throw error;
    }
    return new Uint8Array(await fs.readFile(outputPath));
  } finally {
    await fs.rm(outputDir, { recursive: true, force: true });
  }
}

function modelConfig(props: Record<string, unknown>) {
  const model = (props.model ?? {}) as Record<string, unknown>;
  return {
    providerId: isString(model.provider) ? model.provider : "",
    modelId: isString(model.id) ? model.id : ""
  };
}

function canUseProvider(
  context: ProcessingContext | undefined,
  providerId: string,
  modelId: string
): context is ProcessingContext {
  return (
    !!context &&
    typeof context.runProviderPrediction === "function" &&
    !!providerId &&
    !!modelId
  );
}

const VIDEO_ASPECT_RATIO_VALUES = [
  "21:9",
  "16:9",
  "4:3",
  "1:1",
  "9:16",
  "3:4"
];
const VIDEO_RESOLUTION_VALUES = ["720p", "1080p", "1440p", "4K"];
const VIDEO_DURATION_VALUES = [2, 3, 4, 5, 6, 8, 10, 12, 15];

/** The output streams of one edit, as `-vf`/`-af`/`-filter_complex` with `-map` named them. */
interface MediaEdit {
  video: StreamPlan | null;
  audio: StreamPlan | null;
  /** End the file with its first stream to end (`-shortest`). */
  shortest?: boolean;
}

interface MediaTransformOptions {
  /** Inputs after the main one, in order: `[1:v]`, `[2:a]` and so on. */
  extraInputs?: Array<{ suffix: string; bytes: Uint8Array }>;
  /** Source seconds the main input starts at (`-ss` before `-i`). */
  seekSec?: number;
  /** Source seconds the main input stops at (`-to` before `-i`). */
  toSec?: number;
  /**
   * When true, a failure returns null so the caller can try the next attempt
   * in a chain. When false/omitted it throws — never a silent input
   * pass-through.
   */
  allowFallback?: boolean;
}

/** Keep the main input's sound as it is, when it has any (`-c:a copy`). */
const COPY_AUDIO: StreamPlan = { copy: 0, optional: true };

/** Re-encode the main input's sound when it has any: the CLI's default stream selection. */
const KEEP_AUDIO: StreamPlan = { filter: "anull", optional: true };

/** A `-vf` edit that copies the sound. */
function videoFilter(filter: string): MediaEdit {
  return { video: { filter }, audio: COPY_AUDIO };
}

async function mediaTransform(
  video: Uint8Array,
  edit: MediaEdit,
  options?: Omit<MediaTransformOptions, "allowFallback"> & {
    allowFallback?: false;
  }
): Promise<Uint8Array>;
async function mediaTransform(
  video: Uint8Array,
  edit: MediaEdit,
  options: MediaTransformOptions & { allowFallback: true }
): Promise<Uint8Array | null>;
async function mediaTransform(
  video: Uint8Array,
  edit: MediaEdit,
  options: MediaTransformOptions = {}
): Promise<Uint8Array | null> {
  if (video.length === 0) return new Uint8Array();
  const mainInput = await withTempFile(".mp4", video);
  const others = await Promise.all(
    (options.extraInputs ?? []).map((item) =>
      withTempFile(item.suffix, item.bytes)
    )
  );
  const outputDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "nodetool-video-out-")
  );
  const outputPath = path.join(outputDir, "output.mp4");
  try {
    await transformMedia({
      inputs: [
        { filePath: mainInput.path, seekSec: options.seekSec, toSec: options.toSec },
        ...others.map((other) => ({ filePath: other.path }))
      ],
      outPath: outputPath,
      video: edit.video,
      audio: edit.audio,
      shortest: edit.shortest
    });
    return new Uint8Array(await fs.readFile(outputPath));
  } catch (error) {
    // A failure returns null only when the caller allows a chained fallback;
    // otherwise it throws rather than silently passing the input through.
    if (options.allowFallback) return null;
    throw new Error(`Video processing failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await mainInput.cleanup();
    for (const other of others) await other.cleanup();
    await fs.rm(outputDir, { recursive: true, force: true });
  }
}

/**
 * Expand `entity://` and text-asset mentions in a prompt for a node that takes
 * no media input of its own. The Prompt composer writes mentions as tokens; a
 * node that sent them as-is handed the model the literal `entity://<id>`.
 */
async function expandPromptMentions(
  prompt: string,
  context?: ProcessingContext
): Promise<string> {
  const overrides = await mapPromptAssetsToInputs(
    [{ name: "prompt", value: prompt }],
    [],
    context
  );
  return isString(overrides.prompt) ? overrides.prompt : prompt;
}

/** Output handles TextToVideoNode.process() emits. */
type TextToVideoNodeOutputs = {
  output: VideoRef;
};

export class TextToVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.TextToVideo";
  static readonly body = "content_card";
  static readonly title = "Text To Video";
  static readonly description =
    "Generate videos from text prompts using any supported video provider. Automatically routes to the appropriate backend (Gemini Veo, HuggingFace).\n    video, generation, AI, text-to-video, t2v";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["prompt"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "video_model",
    default: {
      type: "video_model",
      provider: "gemini",
      id: "veo-3.1-generate-preview",
      name: "Veo 3.1 Preview",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "The video generation model to use"
  })
  declare model: VideoModelRef;

  @prop({
    type: "str",
    default: "A cat playing with a ball of yarn",
    title: "Prompt",
    description: "Text prompt describing the desired video"
  })
  declare prompt: string;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Text prompt describing what to avoid in the video"
  })
  declare negative_prompt: string;

  @prop({
    type: "list[entity]",
    default: [],
    title: "Entities",
    description:
      "Consistency entities (characters, styles, locations) whose descriptors are injected into the prompt"
  })
  declare entities: Entity[];

  @prop({
    type: "str",
    default: "16:9",
    title: "Aspect Ratio",
    description: "Aspect ratio for the video",
    values: VIDEO_ASPECT_RATIO_VALUES,
    json_schema_extra: { type: "media_aspect_ratio_video" }
  })
  declare aspect_ratio: string;

  @prop({
    type: "str",
    default: "1080p",
    title: "Resolution",
    description: "Video resolution",
    values: VIDEO_RESOLUTION_VALUES,
    json_schema_extra: { type: "media_resolution_video" }
  })
  declare resolution: string;

  @prop({
    type: "int",
    default: 8,
    title: "Duration",
    description: "Video duration in seconds",
    values: VIDEO_DURATION_VALUES,
    json_schema_extra: { type: "media_duration" }
  })
  declare duration: number;

  @prop({
    type: "int",
    default: 0,
    title: "Timeout Seconds",
    description: "Timeout in seconds for API calls (0 = use provider default)",
    min: 0,
    max: 7200
  })
  declare timeout_seconds: number;

  async process(context?: ProcessingContext): Promise<TextToVideoNodeOutputs> {
    const text = await expandPromptMentions(String(this.prompt ?? ""), context);
    const { providerId, modelId } = modelConfig(this.serialize());
    if (!canUseProvider(context, providerId, modelId)) {
      throw new Error("No provider available for text-to-video generation.");
    }
    const output = coerceProviderBytes(
      await context.runProviderPrediction({
      provider: providerId,
      capability: "text_to_video",
      model: modelId,
      params: {
        prompt: text,
        negative_prompt: this.negative_prompt,
        entities: await resolveEntities(this.entities, context),
        duration_seconds: Number(this.duration ?? 0) || undefined,
        aspect_ratio: this.aspect_ratio,
        resolution: this.resolution,
        timeout_seconds: Number(this.timeout_seconds ?? 0) || undefined
      }
    }),
      "Text To Video"
    );
    return { output: videoRef(output) };
  }
}

/** Output handles ImageToVideoNode.process() emits. */
type ImageToVideoNodeOutputs = {
  output: VideoRef;
};

export class ImageToVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.ImageToVideo";
  static readonly body = "content_card";
  static readonly title = "Image To Video";
  static readonly description =
    "Animate static images into video with AI-powered motion using any supported video provider.\n    video, image-to-video, i2v, animation, ai, generation, sora, veo";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["image", "prompt"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "list[image]",
    default: [],
    title: "Images",
    description:
      "Input image(s) to animate. Only the first non-empty image is used as the start frame. Use Reference To Video for reference media."
  })
  declare image: ImageRef[];

  @prop({
    type: "video_model",
    default: {
      type: "video_model",
      provider: "gemini",
      id: "veo-3.1-generate-preview",
      name: "Veo 3.1 Preview",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "The video generation model to use"
  })
  declare model: VideoModelRef;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description:
      "Text prompt to guide the video animation. Veo animates an image without one; Kling refuses an empty one. Leaving it blank ties the graph to the models that treat it as optional."
  })
  declare prompt: string;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Text prompt describing what to avoid in the video"
  })
  declare negative_prompt: string;

  @prop({
    type: "list[entity]",
    default: [],
    title: "Entities",
    description:
      "Consistency entities (characters, styles, locations) whose descriptors are injected into the prompt"
  })
  declare entities: Entity[];

  @prop({
    type: "str",
    default: "16:9",
    title: "Aspect Ratio",
    description: "Aspect ratio for the video",
    values: VIDEO_ASPECT_RATIO_VALUES,
    json_schema_extra: { type: "media_aspect_ratio_video" }
  })
  declare aspect_ratio: string;

  @prop({
    type: "str",
    default: "1080p",
    title: "Resolution",
    description: "Video resolution",
    values: VIDEO_RESOLUTION_VALUES,
    json_schema_extra: { type: "media_resolution_video" }
  })
  declare resolution: string;

  @prop({
    type: "int",
    default: 4,
    title: "Duration",
    description: "Video duration in seconds",
    values: VIDEO_DURATION_VALUES,
    json_schema_extra: { type: "media_duration" }
  })
  declare duration: number;

  @prop({
    type: "int",
    default: 0,
    title: "Timeout Seconds",
    description: "Timeout in seconds for API calls (0 = use provider default)",
    min: 0,
    max: 7200
  })
  declare timeout_seconds: number;

  async process(context?: ProcessingContext): Promise<ImageToVideoNodeOutputs> {
    let images = normalizeImageList(this.image);
    let prompt = String(this.prompt ?? "");

    // An `asset://` image mentioned inline in the prompt (e.g. from the Prompt
    // composer's @-mention) supplies the source frame when none is wired in,
    // and is stripped from the textual instruction. Same mechanism as the
    // image-to-image / provider video nodes.
    const overrides = await mapPromptAssetsToInputs(
      [{ name: "prompt", value: prompt }],
      [
        {
          name: "image",
          kind: "image",
          hasSource: images.some(imageRefHasSource)
        }
      ],
      context
    );
    if (isString(overrides.prompt)) prompt = overrides.prompt;
    if (overrides.image && images.length === 0) {
      images = [overrides.image as ImageRefLike];
    }

    let image: Uint8Array = new Uint8Array();
    for (const candidate of images) {
      const bytes = await imageBytesAsync(candidate, context);
      if (bytes.length > 0) {
        image = bytes;
        break;
      }
    }
    if (image.length === 0) {
      throw new Error("A non-empty input image is required for Image To Video.");
    }
    const { providerId, modelId } = modelConfig(this.serialize());
    if (!canUseProvider(context, providerId, modelId)) {
      throw new Error("No provider available for image-to-video generation.");
    }
    const output = coerceProviderBytes(
      await context.runProviderPrediction({
      provider: providerId,
      capability: "image_to_video",
      model: modelId,
      params: {
        image,
        prompt,
        negative_prompt: this.negative_prompt,
        entities: await resolveEntities(this.entities, context),
        duration_seconds: Number(this.duration ?? 0) || undefined,
        aspect_ratio: this.aspect_ratio,
        resolution: this.resolution,
        timeout_seconds: Number(this.timeout_seconds ?? 0) || undefined
      }
    }),
      "Image To Video"
    );
    return { output: videoRef(output) };
  }
}

/** Output handles ReferenceToVideoNode.process() emits. */
type ReferenceToVideoNodeOutputs = {
  output: VideoRef;
};

export class ReferenceToVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.ReferenceToVideo";
  static readonly body = "content_card";
  static readonly title = "Reference To Video";
  static readonly description =
    "Generate video using ordered image and video references for identity, style, scene, motion, or audio conditioning.\n    video, reference-to-video, r2v, generation, ai";
  static readonly metadataOutputTypes = { output: "video" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["reference_images", "reference_videos", "prompt"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "list[image]",
    default: [],
    title: "Reference Images",
    description: "Ordered identity, style, subject, or scene image references."
  })
  declare reference_images: ImageRef[];

  @prop({
    type: "list[video]",
    default: [],
    title: "Reference Videos",
    description: "Ordered motion, scene, edit, or soundtrack video references."
  })
  declare reference_videos: VideoRef[];

  @prop({
    type: "video_model",
    default: {
      type: "video_model",
      provider: "",
      id: "",
      name: "",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "The reference-to-video model to use"
  })
  declare model: VideoModelRef;

  @prop({ type: "str", default: "", title: "Prompt", description: "Describe the video using image 1, image 2, video 1, and video 2 numbering in list order." })
  declare prompt: string;

  @prop({ type: "bool", default: false, title: "Use Reference Video Audio", description: "Use audio tracks carried by reference videos where supported." })
  declare use_reference_video_audio: boolean;

  @prop({ type: "str", default: "", title: "Negative Prompt", description: "Text prompt describing what to avoid in the video" })
  declare negative_prompt: string;

  @prop({ type: "list[entity]", default: [], title: "Entities", description: "Consistency entities whose descriptors are injected into the prompt" })
  declare entities: Entity[];

  @prop({ type: "str", default: "16:9", title: "Aspect Ratio", description: "Aspect ratio for the video", values: VIDEO_ASPECT_RATIO_VALUES, json_schema_extra: { type: "media_aspect_ratio_video" } })
  declare aspect_ratio: string;

  @prop({ type: "str", default: "1080p", title: "Resolution", description: "Video resolution", values: VIDEO_RESOLUTION_VALUES, json_schema_extra: { type: "media_resolution_video" } })
  declare resolution: string;

  @prop({ type: "int", default: 5, title: "Duration", description: "Video duration in seconds", values: VIDEO_DURATION_VALUES, json_schema_extra: { type: "media_duration" } })
  declare duration: number;

  @prop({ type: "int", default: 0, title: "Timeout Seconds", description: "Timeout in seconds for API calls (0 = use provider default)", min: 0, max: 7200 })
  declare timeout_seconds: number;

  async process(context?: ProcessingContext): Promise<ReferenceToVideoNodeOutputs> {
    const images = normalizeImageList(this.reference_images);
    const videos = normalizeVideoList(this.reference_videos);
    const [imageBytes, videoBytes] = await Promise.all([
      Promise.all(images.map((image) => imageBytesAsync(image, context))),
      Promise.all(videos.map((video) => videoBytesAsync(video, context)))
    ]);
    const referenceImages = imageBytes.filter((bytes) => bytes.length > 0);
    const referenceVideos = videoBytes.filter((bytes) => bytes.length > 0);
    if (referenceImages.length === 0 && referenceVideos.length === 0) {
      throw new Error("Reference To Video requires at least one reference image or video.");
    }
    const { providerId, modelId } = modelConfig(this.serialize());
    if (!canUseProvider(context, providerId, modelId)) {
      throw new Error("No provider available for reference-to-video generation.");
    }
    const output = coerceProviderBytes(
      await context.runProviderPrediction({
        provider: providerId,
        capability: "reference_to_video",
        model: modelId,
        params: {
          reference_images: referenceImages,
          reference_videos: referenceVideos,
          prompt: await expandPromptMentions(String(this.prompt ?? ""), context),
          use_reference_video_audio: this.use_reference_video_audio,
          negative_prompt: this.negative_prompt,
          entities: await resolveEntities(this.entities, context),
          duration_seconds: Number(this.duration ?? 0) || undefined,
          aspect_ratio: this.aspect_ratio,
          resolution: this.resolution,
          timeout_seconds: Number(this.timeout_seconds ?? 0) || undefined
        }
      }),
      "Reference To Video"
    );
    return { output: videoRef(output) };
  }
}

/** Output handles LoadVideoFileNode.process() emits. */
type LoadVideoFileNodeOutputs = {
  output: VideoRef;
};

export class LoadVideoFileNode extends BaseNode {
  static readonly nodeType = "nodetool.video.LoadVideoFile";
  static readonly title = "Load Video File";
  static readonly description =
    "Read a video file from disk.\n    video, input, load, file";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inlineFields: string[] = ["path"];
  static readonly inputFields: string[] = [];

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to the video file to read"
  })
  declare path: string;

  async process(): Promise<LoadVideoFileNodeOutputs> {
    const p = filePath(String(this.path ?? "").trim());
    if (!p) throw new Error("No file path provided to Load Video File.");
    const data = new Uint8Array(await fs.readFile(p));
    return { output: videoRef(data, { uri: `file://${p}` }) };
  }
}

/**
 * Resolve the destination folder for a save node. An explicit folder wins;
 * otherwise fall back to the run's workspace directory rather than the server
 * process cwd (`.`), which is rarely where a user wants their output. A
 * workspace with no directory (cloud storage) leaves only the cwd — the nodes
 * that can write through the workspace do so via `writeSavedFile` instead.
 */
function saveFolder(rawFolder: unknown, context?: ProcessingContext): string {
  return (
    folderPath(rawFolder) ||
    context?.workspace?.localDir ||
    context?.workspaceDir ||
    "."
  );
}

/** Output handles SaveVideoFileVideoNode.process() emits. */
type SaveVideoFileVideoNodeOutputs = {
  output: VideoRef;
};

export class SaveVideoFileVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.SaveVideoFile";
  static readonly title = "Save Video File";
  static readonly description =
    "Write a video file to disk.\n    video, output, save, file\n\n    The filename can include time and date variables:\n    %Y - Year, %m - Month, %d - Day\n    %H - Hour, %M - Minute, %S - Second";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inlineFields: string[] = ["save_to_workspace"];
  static readonly inputFields: string[] = ["video"];

  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The video to save"
  })
  declare video: VideoRef;

  @prop({
    type: "bool",
    default: true,
    title: SAVE_TO_WORKSPACE_TITLE,
    description: SAVE_TO_WORKSPACE_DESCRIPTION
  })
  declare save_to_workspace: boolean;

  @prop({
    type: "str",
    default: "",
    title: "Folder",
    description: "Folder where the file will be saved",
    json_schema_extra: VISIBLE_WHEN_NOT_SAVING_TO_WORKSPACE
  })
  declare folder: string;

  @prop({
    type: "str",
    default: "",
    title: "Filename",
    description:
      "\n        Name of the file to save.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare filename: string;

  async process(context?: ProcessingContext): Promise<SaveVideoFileVideoNodeOutputs> {
    // dateName resolves to second granularity, so two saves in the same second
    // collide — resolveSaveTarget numbers them rather than overwriting.
    const bytes = await videoBytesAsync(this.video, context);
    const p = await writeSavedFile({
      folder: this.folder,
      filename: dateName(String(this.filename || "video.mp4")),
      saveToWorkspace: this.save_to_workspace,
      workspace: context?.workspace,
      workspaceDir: context?.workspaceDir,
      bytes
    });
    return { output: videoRef(bytes, { uri: `file://${p}` }) };
  }
}

export class LoadVideoAssetsNode extends BaseNode {
  static readonly nodeType = "nodetool.video.LoadVideoAssets";
  static readonly title = "Load Video Folder";
  static readonly description =
    "Load video files from an asset folder.\n    load, video, file, import";
  static readonly metadataOutputTypes = {
    video: "video",
    name: "str",
    videos: "list",
    names: "list"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = [];

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation = {
    video: { kind: "iteration", source: "__execution__", group: "items" },
    name: { kind: "iteration", source: "__execution__", group: "items" },
    videos: { kind: "single", source: "__execution__" },
    names: { kind: "single", source: "__execution__" }
  } satisfies Record<string, OutputCorrelation>;

  @prop({
    type: "folder",
    default: {
      type: "folder",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Folder",
    description: "The asset folder to load the video files from."
  })
  declare folder: FolderRef;

  async process(): Promise<Record<string, unknown>> {
    const allVideos: unknown[] = [];
    const allNames: string[] = [];
    for await (const item of this._loadVideos()) {
      allVideos.push(item.video);
      allNames.push(item.name);
    }
    return {
      video: allVideos[0] ?? null,
      name: allNames[0] ?? "",
      videos: allVideos,
      names: allNames
    };
  }

  private async *_loadVideos(): AsyncGenerator<{
    video: unknown;
    name: string;
  }> {
    const folder = folderPath(this.folder);
    if (!folder) return;
    let entries;
    try {
      entries = await fs.readdir(folder, { withFileTypes: true });
    } catch {
      // folder does not exist or is not accessible
      return;
    }
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (![".mp4", ".mov", ".webm", ".mkv", ".avi"].includes(ext)) continue;
      const full = path.join(folder, entry.name);
      const data = new Uint8Array(await fs.readFile(full));
      yield {
        video: videoRef(data, { uri: `file://${full}` }),
        name: entry.name
      };
    }
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const allVideos: unknown[] = [];
    const allNames: string[] = [];
    for await (const item of this._loadVideos()) {
      allVideos.push(item.video);
      allNames.push(item.name);
      yield { video: item.video, name: item.name };
    }
    yield { videos: allVideos, names: allNames };
  }
}

/** Output handles SaveVideoNode.process() emits. */
type SaveVideoNodeOutputs = {
  output: VideoRef;
};

export class SaveVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.SaveVideo";
  static readonly title = "Save Video Asset";
  static readonly description =
    "Save a video to an asset folder.\n    video, save, file, output";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["video"];

  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The video to save."
  })
  declare video: VideoRef;

  @prop({
    type: "folder",
    default: {
      type: "folder",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Folder",
    description: "The asset folder to save the video in."
  })
  declare folder: FolderRef;

  @prop({
    type: "str",
    default: "%Y-%m-%d-%H-%M-%S.mp4",
    title: "Name",
    description:
      "\n        Name of the output video.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare name: string;

  async process(context?: ProcessingContext): Promise<SaveVideoNodeOutputs> {
    const folder = saveFolder(this.folder, context);
    const filename = dateName(String(this.name || "video.mp4"));
    await fs.mkdir(path.resolve(folder), { recursive: true });
    // dateName resolves to second granularity, so two saves in the same second
    // collide — de-duplicate with a -1/-2/… suffix rather than overwrite.
    const full = await uniqueTargetPath(path.resolve(folder, filename));
    const bytes = await videoBytesAsync(this.video, context);
    await fs.writeFile(full, bytes);
    return { output: videoRef(bytes, { uri: `file://${full}` }) };
  }
}

/** Output handles ForEachFrameNode.genProcess() emits. */
type ForEachFrameNodeStreamOutputs = {
  frame: { type: string; data: string };
  index: number;
  fps: number;
};

export class ForEachFrameNode extends BaseNode {
  static readonly nodeType = "nodetool.video.ForEachFrame";
  static readonly title = "For Each Frame";
  static readonly description =
    "Extract frames from a video file.\n    video, frames, extract, sequence";
  static readonly metadataOutputTypes = {
    frame: "image",
    index: "int",
    fps: "float"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["video"];

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation = {
    frame: { kind: "iteration", source: "video", group: "items" },
    index: { kind: "iteration", source: "video", group: "items" },
    fps: { kind: "single", source: "video" }
  } satisfies Record<string, OutputCorrelation>;

  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to extract frames from."
  })
  declare video: VideoRef;

  @prop({
    type: "int",
    default: 0,
    title: "Start",
    description: "The frame to start extracting from."
  })
  declare start: number;

  @prop({
    type: "int",
    default: -1,
    title: "End",
    description: "The frame to stop extracting from."
  })
  declare end: number;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    // Buffered fallback: surface the first frame instead of nothing.
    for await (const item of this.genProcess(context)) {
      return item;
    }
    return {};
  }

  async *genProcess(context?: ProcessingContext): AsyncGenerator<ForEachFrameNodeStreamOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    if (bytes.length === 0) return;

    const inputFile = await withTempFile(".mp4", bytes);
    try {
      // A file the probe cannot read falls back to 24 fps.
      const video = await probeVideoStream(inputFile.path);
      const parsed = video ? (video.nominalFps ?? video.averageFps) : 0;
      const fps = parsed > 0 ? parsed : 24;
      const alpha = video?.alpha ?? false;

      const start = Math.max(0, Number(this.start ?? 0));
      const end = Number(this.end ?? -1);

      const select =
        end >= 0
          ? `select='between(n,${start},${end})'`
          : `select='gte(n,${start})'`;

      // With a bounded range, stop after the selected frames instead of
      // scanning to the end of the video.
      let index = start;
      for await (const png of pngFrames({
        filePath: inputFile.path,
        filter: select,
        limit: end >= 0 ? end - start + 1 : undefined,
        alpha
      })) {
        yield {
          frame: {
            type: "image",
            data: Buffer.from(png).toString("base64")
          },
          index,
          fps
        };
        index += 1;
      }
    } finally {
      await inputFile.cleanup();
    }
  }
}

/** Output handles FpsNode.process() emits. */
type FpsNodeOutputs = {
  output: number;
};

export class FpsNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Fps";
  static readonly title = "Fps";
  static readonly description =
    "Get the frames per second (FPS) of a video file.\n    video, analysis, frames, fps";
  static readonly metadataOutputTypes = {
    output: "float"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["video"];

  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to analyze for FPS."
  })
  declare video: VideoRef;

  async process(context?: ProcessingContext): Promise<FpsNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    if (bytes.length === 0) return { output: 0 };

    const inputFile = await withTempFile(".mp4", bytes);
    try {
      return { output: (await probeVideoInfo(inputFile.path)).fps };
    } catch {
      // A probe failure on corrupt input degrades to 0.
      return { output: 0 };
    } finally {
      await inputFile.cleanup();
    }
  }
}

/** Output handles FrameToVideoNode.process() emits. */
type FrameToVideoNodeOutputs = {
  output: VideoRef;
};

export class FrameToVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.FrameToVideo";
  static readonly title = "Frame To Video";
  static readonly description =
    "Combine a sequence of frames into a single video file.\n    video, frames, combine, sequence";
  static readonly isStreamingInput = true;
  static readonly inputMode: InputMode = "stream";
  static readonly outputCorrelation = {
    output: { kind: "aggregate", source: "frame", collapse: "innermost" }
  } satisfies Record<string, OutputCorrelation>;

  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["frame", "fps"];

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Frame",
    description: "Collect input frames"
  })
  declare frame: ImageRef | ImageRef[];

  @prop({
    type: "float",
    default: 30,
    title: "Fps",
    description: "The FPS of the output video."
  })
  declare fps: number;

  async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs,
    _context?: ProcessingContext
  ): Promise<void> {
    const frames: unknown[] = [];
    let fps = Math.max(1, Number(this.fps ?? 30));
    for await (const [handle, item] of inputs.any()) {
      if (handle === "frame") {
        frames.push(item);
      } else if (handle === "fps") {
        fps = Math.max(1, Number(item ?? 30));
      }
    }

    if (frames.length === 0) {
      await outputs.emit("output", videoRef(new Uint8Array()));
      return;
    }

    try {
      const result = await combineFramesToVideo(frames, fps);
      await outputs.emit("output", videoRef(result));
    } catch (error) {
      throw new Error(
        `Combining frames into a video failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  async process(): Promise<FrameToVideoNodeOutputs> {
    // Legacy fallback for non-streaming usage (e.g., direct array input)
    const frames = Array.isArray(this.frame) ? (this.frame as unknown[]) : [];
    if (frames.length === 0) return { output: videoRef(new Uint8Array()) };

    const fps = Math.max(1, Number(this.fps ?? 30));
    try {
      const result = await combineFramesToVideo(frames, fps);
      return { output: videoRef(result) };
    } catch (error) {
      throw new Error(
        `Combining frames into a video failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }
}

interface ConcatMeta {
  codec: string;
  width: number;
  height: number;
  fps: number;
  hasAudio: boolean;
}

/** Probe a file's video codec/dimensions/fps and audio presence. */
async function probeConcatMeta(file: string): Promise<ConcatMeta> {
  const info = await probeVideoInfo(file);
  return {
    codec: info.codec,
    width: info.width,
    height: info.height,
    fps: info.fps,
    hasAudio: info.hasAudio
  };
}

/** Output handles ConcatVideoNode.process() emits. */
type ConcatVideoNodeOutputs = {
  output: VideoRef;
};

export class ConcatVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Concat";
  static readonly body = "content_card";
  static readonly title = "Concatenate Video";
  static readonly description =
    "Concatenate multiple video files into a single video, including audio when available. Add inputs dynamically with the “add video input” button, or wire a list of videos into a single input.\n    video, concat, merge, combine, audio, +";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = [];
  static readonly supportsDynamicInputs = true;

  async process(context?: ProcessingContext): Promise<ConcatVideoNodeOutputs> {
    const inputValues = Array.from(this.dynamicProps.values()).flatMap(
      (value) => normalizeVideoList(value)
    );
    const parts: Uint8Array[] = [];
    for (const input of inputValues) {
      const bytes = await videoBytesAsync(input, context);
      if (bytes.length > 0) {
        parts.push(bytes);
      }
    }

    if (parts.length === 0) return { output: videoRef(new Uint8Array()) };
    if (parts.length === 1) return { output: videoRef(parts[0]) };

    const inputs = await Promise.all(parts.map((bytes) => withTempFile(".mp4", bytes)));
    const concatDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "nodetool-concat-")
    );
    const outputPath = path.join(concatDir, "output.mp4");
    try {
      // Stream-copying heterogeneous inputs (different codec/size/fps) produces
      // corrupt output. Probe every input; only take the fast copy path when
      // they all match, else normalize each to a uniform segment (first
      // input's resolution/fps) while joining.
      const metas = await Promise.all(
        inputs.map((input) => probeConcatMeta(input.path))
      );
      const first = metas[0];
      const uniform = metas.every(
        (m) =>
          m.codec === first.codec &&
          m.width === first.width &&
          m.height === first.height &&
          m.fps === first.fps &&
          m.hasAudio === first.hasAudio
      );

      if (uniform) {
        await concatCopy({ inputPaths: inputs.map((input) => input.path), outPath: outputPath });
      } else {
        const width = first.width > 0 ? first.width : 1920;
        const height = first.height > 0 ? first.height : 1080;
        const fps = first.fps > 0 ? first.fps : 30;
        const durations = await Promise.all(inputs.map(async (input) => (await probeDurationSec(input.path)) ?? 0));
        // Scale + pad to a uniform frame at the first input's rate, H.264 and
        // 48 kHz stereo AAC, silence where an input has no sound.
        await concatSegments({
          outPath: outputPath,
          width,
          height,
          fps,
          segments: inputs.map((input, i) => ({
            kind: "video",
            filePath: input.path,
            durationSec: durations[i] ?? 0,
            withAudio: metas[i]!.hasAudio
          })),
          videoFilter:
            `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
            `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
          video: { codec: "libx264", pixelFormat: "yuv420p", options: { preset: "veryfast" } },
          audioCodec: "aac"
        });
      }
      const result = new Uint8Array(await fs.readFile(outputPath));
      return { output: videoRef(result) };
    } catch (error) {
      throw new Error(
        `Concatenating videos failed: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    } finally {
      for (const input of inputs) {
        await input.cleanup();
      }
      await fs.rm(concatDir, { recursive: true, force: true });
    }
  }
}

/** Output handles TrimVideoNode.process() emits. */
type TrimVideoNodeOutputs = {
  output: VideoRef;
};

export class TrimVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Trim";
  static readonly title = "Trim";
  static readonly description =
    "Trim a video to a specific start and end time.\n    video, trim, cut, segment";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inputFields: string[] = ["video"];


  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to trim."
  })
  declare video: VideoRef;

  @prop({
    type: "float",
    default: 0,
    title: "Start Time",
    description: "The start time in seconds for the trimmed video."
  })
  declare start_time: number;

  @prop({
    type: "float",
    default: -1,
    title: "End Time",
    description:
      "The end time in seconds for the trimmed video. Use -1 for the end of the video."
  })
  declare end_time: number;

  @prop({
    type: "bool",
    default: false,
    title: "Accurate",
    description:
      "Re-encode for frame-exact cuts. Off (default) stream-copies and snaps to the nearest keyframe — fast, but the cut points may be off by up to one GOP."
  })
  declare accurate: boolean;

  async process(context?: ProcessingContext): Promise<TrimVideoNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    if (bytes.length === 0) return { output: videoRef(bytes) };

    const start = Math.max(0, Number(this.start_time ?? 0));
    const end = Number(this.end_time ?? -1);

    const toSec = end >= 0 ? end : undefined;
    if (this.accurate) {
      // Decode from the keyframe before `start`, drop the frames before it and
      // re-encode, so the cut lands on the exact requested time instead of the
      // nearest keyframe. Slower, but frame-accurate.
      const transformed = await mediaTransform(
        bytes,
        { video: { filter: "null" }, audio: KEEP_AUDIO },
        { seekSec: start, toSec }
      );
      return { output: videoRef(transformed) };
    }

    // A stream copy jumps to the nearest keyframe instead of decoding from the
    // start, so trimming a long clip is near-instant.
    const transformed = await mediaTransform(
      bytes,
      { video: { copy: 0 }, audio: COPY_AUDIO },
      { seekSec: start, toSec }
    );
    return { output: videoRef(transformed) };
  }
}

/** Output handles ResizeVideoNode.process() emits. */
type ResizeVideoNodeOutputs = {
  output: VideoRef;
};

export class ResizeVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Resize";
  static readonly title = "Resize";
  static readonly description =
    "Resize a video to a specific width and height.\n    video, resize, scale, dimensions";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inputFields: string[] = ["video"];
  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to resize."
  })
  declare video: VideoRef;

  @prop({
    type: "int",
    default: -1,
    title: "Width",
    description: "The target width. Use -1 to maintain aspect ratio."
  })
  declare width: number;

  @prop({
    type: "int",
    default: -1,
    title: "Height",
    description: "The target height. Use -1 to maintain aspect ratio."
  })
  declare height: number;

  async process(context?: ProcessingContext): Promise<ResizeVideoNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    const width = Number(this.width ?? -1);
    const height = Number(this.height ?? -1);
    const transformed =
      (await mediaTransform(bytes, videoFilter(`scale=${width}:${height}`)));
    return { output: videoRef(transformed) };
  }
}

/** Output handles RotateVideoNode.process() emits. */
type RotateVideoNodeOutputs = {
  output: VideoRef;
};

export class RotateVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Rotate";
  static readonly title = "Rotate";
  static readonly description =
    "Rotate a video by a specified angle.\n    video, rotate, orientation, transform";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inputFields: string[] = ["video"];
  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to rotate."
  })
  declare video: VideoRef;

  @prop({
    type: "float",
    default: 0,
    title: "Angle",
    description: "The angle of rotation in degrees.",
    min: -360,
    max: 360
  })
  declare angle: number;

  async process(context?: ProcessingContext): Promise<RotateVideoNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    const angle = Number(this.angle ?? 0);
    const radians = (angle * Math.PI) / 180;
    const transformed =
      (await mediaTransform(bytes, videoFilter(`rotate=${radians}:ow=rotw(${radians}):oh=roth(${radians})`)));
    return { output: videoRef(transformed) };
  }
}

/** Output handles SetSpeedVideoNode.process() emits. */
type SetSpeedVideoNodeOutputs = {
  output: VideoRef;
};

export class SetSpeedVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.SetSpeed";
  static readonly title = "Set Speed";
  static readonly description =
    "Adjust the playback speed of a video.\n    video, speed, tempo, time";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inputFields: string[] = ["video"];
  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to adjust speed."
  })
  declare video: VideoRef;

  @prop({
    type: "float",
    default: 1,
    title: "Speed Factor",
    description:
      "The speed adjustment factor. Values > 1 speed up, < 1 slow down."
  })
  declare speed_factor: number;

  async process(context?: ProcessingContext): Promise<SetSpeedVideoNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    const speed = Math.max(0.1, Number(this.speed_factor ?? 1));

    // Build chained atempo filters for values outside 0.5-2.0 range
    // Each atempo filter is limited to 0.5-2.0, so we chain them
    const buildAtempo = (s: number): string => {
      const parts: string[] = [];
      let remaining = s;
      if (remaining > 1) {
        while (remaining > 2) {
          parts.push("atempo=2.0");
          remaining /= 2;
        }
        parts.push(`atempo=${remaining}`);
      } else {
        while (remaining < 0.5) {
          parts.push("atempo=0.5");
          remaining /= 0.5;
        }
        parts.push(`atempo=${remaining}`);
      }
      return parts.join(",");
    };

    const atempoChain = buildAtempo(speed);
    // First attempt retimes audio too (fails on videos with no audio stream);
    // the video-only fallback is the terminal attempt and throws on failure.
    const setpts = `setpts=${1 / speed}*PTS`;
    const transformed =
      (await mediaTransform(
        bytes,
        { video: { filter: setpts }, audio: { filter: atempoChain } },
        { allowFallback: true }
      )) ??
      (await mediaTransform(bytes, { video: { filter: setpts }, audio: null }));
    return { output: videoRef(transformed) };
  }
}

/** Output handles EaseCurveVideoNode.process() emits. */
type EaseCurveVideoNodeOutputs = {
  output: VideoRef;
};

const EASE_CURVE_CUSTOM_ONLY = {
  visible_when: { property: "easing", equals: "custom" }
} as const;

export class EaseCurveVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.EaseCurve";
  static readonly title = "Ease Curve";
  static readonly description =
    "Retime a video along an easing curve so playback speeds up or slows down smoothly. Ease in starts slow and ends fast, ease out the reverse. The whole source plays once, over the output duration.\n    video, speed, ramp, retime, ease, curve, slow motion, time remap";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inputFields: string[] = ["video"];
  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to retime."
  })
  declare video: VideoRef;

  @prop({
    type: "enum",
    default: "easeInOut",
    title: "Easing",
    description:
      "The speed curve. Choose custom to set cubic-bezier control points.",
    values: [...EASE_CURVE_PRESETS]
  })
  declare easing: string;

  @prop({
    type: "float",
    default: 0,
    title: "Duration",
    description:
      "Output length in seconds. 0 keeps the source length.",
    min: 0
  })
  declare duration: number;

  @prop({
    type: "float",
    default: 0.42,
    title: "X1",
    description: "First cubic-bezier control point, x (0 to 1).",
    min: 0,
    max: 1,
    json_schema_extra: EASE_CURVE_CUSTOM_ONLY
  })
  declare x1: number;

  @prop({
    type: "float",
    default: 0,
    title: "Y1",
    description: "First cubic-bezier control point, y (0 to 1).",
    min: 0,
    max: 1,
    json_schema_extra: EASE_CURVE_CUSTOM_ONLY
  })
  declare y1: number;

  @prop({
    type: "float",
    default: 0.58,
    title: "X2",
    description: "Second cubic-bezier control point, x (0 to 1).",
    min: 0,
    max: 1,
    json_schema_extra: EASE_CURVE_CUSTOM_ONLY
  })
  declare x2: number;

  @prop({
    type: "float",
    default: 1,
    title: "Y2",
    description: "Second cubic-bezier control point, y (0 to 1).",
    min: 0,
    max: 1,
    json_schema_extra: EASE_CURVE_CUSTOM_ONLY
  })
  declare y2: number;

  async process(context?: ProcessingContext): Promise<EaseCurveVideoNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    if (bytes.length === 0) return { output: videoRef(bytes) };
    const easing = easeCurveEasing(this.easing ?? "easeInOut", {
      x1: Number(this.x1 ?? 0.42),
      y1: Number(this.y1 ?? 0),
      x2: Number(this.x2 ?? 0.58),
      y2: Number(this.y2 ?? 1)
    });

    const probe = await withTempFile(".mp4", bytes);
    let sourceSec: number;
    let meta: ConcatMeta;
    try {
      sourceSec = (await probeDurationSec(probe.path)) ?? 0;
      meta = await probeConcatMeta(probe.path);
    } finally {
      await probe.cleanup();
    }
    if (!(sourceSec > 0)) {
      throw new Error("Ease Curve could not read the input video's duration.");
    }
    const requested = Number(this.duration ?? 0);
    const outputSec = requested > 0 ? requested : sourceSec;
    const segments = easeCurveSegments(sourceSec * 1000, outputSec * 1000, easing);
    const graphs = easeCurveFilterGraph({
      segments,
      outputDurationMs: outputSec * 1000,
      fps: meta.fps > 0 ? meta.fps : 30,
      withAudio: meta.hasAudio
    });
    const transformed = await mediaTransform(bytes, {
      video: { graph: graphs.video, output: "v" },
      audio: graphs.audio ? { graph: graphs.audio, output: "a" } : null
    });
    return { output: videoRef(transformed) };
  }
}

/** Output handles OverlayVideoNode.process() emits. */
type OverlayVideoNodeOutputs = {
  output: VideoRef;
};

export class OverlayVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Overlay";
  static readonly title = "Overlay";
  static readonly description =
    "Overlay one video on top of another, including audio overlay when available.\n    video, overlay, composite, picture-in-picture, audio";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inputFields: string[] = ["main_video", "overlay_video"];
  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Main Video",
    description: "The main (background) video."
  })
  declare main_video: VideoRef;

  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Overlay Video",
    description: "The video to overlay on top."
  })
  declare overlay_video: VideoRef;

  @prop({
    type: "int",
    default: 0,
    title: "X",
    description: "X-coordinate for overlay placement."
  })
  declare x: number;

  @prop({
    type: "int",
    default: 0,
    title: "Y",
    description: "Y-coordinate for overlay placement."
  })
  declare y: number;

  @prop({
    type: "float",
    default: 1,
    title: "Scale",
    description: "Scale factor for the overlay video."
  })
  declare scale: number;

  @prop({
    type: "float",
    default: 0.5,
    title: "Overlay Audio Volume",
    description: "Volume of the overlay audio relative to the main audio.",
    min: 0,
    max: 1
  })
  declare overlay_audio_volume: number;

  async process(context?: ProcessingContext): Promise<OverlayVideoNodeOutputs> {
    const mainVideo = await videoBytesAsync(this.main_video, context);
    const overlayVideo = await videoBytesAsync(this.overlay_video, context);
    if (overlayVideo.length === 0) return { output: videoRef(mainVideo) };
    if (mainVideo.length === 0) return { output: videoRef(overlayVideo) };
    const x = Number(this.x ?? 0);
    const y = Number(this.y ?? 0);
    const scale = Math.max(0.01, Number(this.scale ?? 1));
    const vol = Math.max(0, Math.min(1, Number(this.overlay_audio_volume ?? 0.5)));

    // Try with audio mixing first, fall back to video-only overlay
    const picture: StreamPlan = {
      graph: `[1:v]scale=iw*${scale}:ih*${scale}[ov];[0:v][ov]overlay=${x}:${y}[outv]`,
      output: "outv"
    };
    const extraInputs = [{ suffix: ".mp4", bytes: overlayVideo }];
    const transformed =
      (await mediaTransform(
        mainVideo,
        {
          video: picture,
          audio: {
            graph: `[0:a]volume=1.0[a0];[1:a]volume=${vol}[a1];[a0][a1]amix=inputs=2:duration=first[outa]`,
            output: "outa"
          }
        },
        { extraInputs, allowFallback: true }
      )) ??
      // Fallback: video-only overlay (one or both inputs may lack audio), with
      // the main video's sound when it has any. Terminal attempt — throws if
      // it also fails.
      (await mediaTransform(mainVideo, { video: picture, audio: KEEP_AUDIO }, { extraInputs }));
    return { output: videoRef(transformed) };
  }
}

/** Output handles ColorBalanceVideoNode.process() emits. */
type ColorBalanceVideoNodeOutputs = {
  output: VideoRef;
};

export class ColorBalanceVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.ColorBalance";
  static readonly title = "Color Balance";
  static readonly description =
    "Adjust the color balance of a video.\n    video, color, balance, adjustment";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inputFields: string[] = ["video"];
  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to adjust color balance."
  })
  declare video: VideoRef;

  @prop({
    type: "float",
    default: 1,
    title: "Red Adjust",
    description: "Red channel adjustment factor.",
    min: 0,
    max: 2
  })
  declare red_adjust: number;

  @prop({
    type: "float",
    default: 1,
    title: "Green Adjust",
    description: "Green channel adjustment factor.",
    min: 0,
    max: 2
  })
  declare green_adjust: number;

  @prop({
    type: "float",
    default: 1,
    title: "Blue Adjust",
    description: "Blue channel adjustment factor.",
    min: 0,
    max: 2
  })
  declare blue_adjust: number;

  async process(context?: ProcessingContext): Promise<ColorBalanceVideoNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    // Props are 0-2 range where 1.0 = neutral; colorbalance expects -1 to 1
    const rs = Number(this.red_adjust ?? 1) - 1;
    const gs = Number(this.green_adjust ?? 1) - 1;
    const bs = Number(this.blue_adjust ?? 1) - 1;
    const transformed =
      (await mediaTransform(bytes, videoFilter(`colorbalance=rs=${rs}:gs=${gs}:bs=${bs}`)));
    return { output: videoRef(transformed) };
  }
}

/** Output handles DenoiseVideoNode.process() emits. */
type DenoiseVideoNodeOutputs = {
  output: VideoRef;
};

export class DenoiseVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Denoise";
  static readonly title = "Denoise";
  static readonly description =
    "Apply noise reduction to a video.\n    video, denoise, clean, enhance";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inputFields: string[] = ["video"];

  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to denoise."
  })
  declare video: VideoRef;

  @prop({
    type: "float",
    default: 5,
    title: "Strength",
    description:
      "Strength of the denoising effect. Higher values mean more denoising.",
    min: 0,
    max: 20
  })
  declare strength: number;

  async process(context?: ProcessingContext): Promise<DenoiseVideoNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    const strength = Number(this.strength ?? 5);
    const transformed =
      (await mediaTransform(bytes, videoFilter(`nlmeans=s=${strength}`)));
    return { output: videoRef(transformed) };
  }
}

/** Output handles StabilizeVideoNode.process() emits. */
type StabilizeVideoNodeOutputs = {
  output: VideoRef;
};

export class StabilizeVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Stabilize";
  static readonly title = "Stabilize";
  static readonly description =
    "Apply video stabilization to reduce camera shake and jitter.\n    video, stabilize, smooth, shake-reduction";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inputFields: string[] = ["video"];

  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to stabilize."
  })
  declare video: VideoRef;

  @prop({
    type: "float",
    default: 10,
    title: "Smoothing",
    description:
      "Smoothing strength. Higher values result in smoother but potentially more cropped video.",
    min: 1,
    max: 100
  })
  declare smoothing: number;

  @prop({
    type: "bool",
    default: true,
    title: "Crop Black",
    description:
      "Whether to crop black borders that may appear after stabilization."
  })
  declare crop_black: boolean;

  async process(context?: ProcessingContext): Promise<StabilizeVideoNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    if (bytes.length === 0) return { output: videoRef(bytes) };
    const smoothing = Math.max(1, Number(this.smoothing ?? 10));
    const cropBlack = Boolean(this.crop_black ?? true);

    // ffmpeg's `deshake` filter has no `smooth` option. Passing one fails the
    // whole filtergraph with "Error applying option 'smooth' to filter
    // 'deshake': Option not found", so this node could never run. `smooth`
    // belongs to vidstabtransform, which needs a libvidstab-enabled ffmpeg we
    // cannot assume is present. Map the smoothing dial onto deshake's actual
    // control — the rx/ry search range, which sets how much motion it can
    // track between frames. deshake rejects a range that is not a multiple of
    // 16 ("rx must be a multiple of 16"), so snap to the nearest legal step and
    // keep at least one: rx=0 disables the search entirely.
    const searchRange = Math.min(
      64,
      Math.max(16, Math.round(smoothing / 16) * 16)
    );
    const deshake = `deshake=rx=${searchRange}:ry=${searchRange}`;

    if (!cropBlack) {
      const transformed = await mediaTransform(bytes, videoFilter(deshake));
      return { output: videoRef(transformed) };
    }

    // Pass 1: run deshake + cropdetect and read cropdetect's suggested crop
    // (a bare `crop` filter defaults to the full frame and removes nothing —
    // cropdetect only measures, it never crops).
    const probe = await withTempFile(".mp4", bytes);
    let crop: string | null;
    try {
      crop = await detectCrop(probe.path, deshake);
    } finally {
      await probe.cleanup();
    }

    // Pass 2: apply the detected crop, or deshake alone when none was found.
    const vf = crop ? `${deshake},crop=${crop}` : deshake;
    const transformed = await mediaTransform(bytes, videoFilter(vf));
    return { output: videoRef(transformed) };
  }
}

/** Output handles SharpnessVideoNode.process() emits. */
type SharpnessVideoNodeOutputs = {
  output: VideoRef;
};

export class SharpnessVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Sharpness";
  static readonly title = "Sharpness";
  static readonly description =
    "Adjust the sharpness of a video.\n    video, sharpen, enhance, detail";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inputFields: string[] = ["video"];

  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to sharpen."
  })
  declare video: VideoRef;

  @prop({
    type: "float",
    default: 1,
    title: "Luma Amount",
    description: "Amount of sharpening to apply to luma (brightness) channel.",
    min: 0,
    max: 3
  })
  declare luma_amount: number;

  @prop({
    type: "float",
    default: 0.5,
    title: "Chroma Amount",
    description: "Amount of sharpening to apply to chroma (color) channels.",
    min: 0,
    max: 3
  })
  declare chroma_amount: number;

  async process(context?: ProcessingContext): Promise<SharpnessVideoNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    const lumaAmount = Number(this.luma_amount ?? 1);
    const chromaAmount = Number(this.chroma_amount ?? 0.5);
    const transformed =
      (await mediaTransform(bytes, videoFilter(`unsharp=5:5:${lumaAmount}:5:5:${chromaAmount}`)));
    return { output: videoRef(transformed) };
  }
}

/** Output handles BlurVideoNode.process() emits. */
type BlurVideoNodeOutputs = {
  output: VideoRef;
};

export class BlurVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Blur";
  static readonly title = "Blur";
  static readonly description =
    "Apply a blur effect to a video.\n    video, blur, smooth, soften";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inputFields: string[] = ["video"];
  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to apply blur effect."
  })
  declare video: VideoRef;

  @prop({
    type: "float",
    default: 5,
    title: "Strength",
    description:
      "The strength of the blur effect. Higher values create a stronger blur.",
    min: 0,
    max: 20
  })
  declare strength: number;

  async process(context?: ProcessingContext): Promise<BlurVideoNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    const radius = Number(this.strength ?? 5);
    if (radius <= 0) return { output: videoRef(bytes) };
    const transformed =
      (await mediaTransform(bytes, videoFilter(`boxblur=${radius}:${radius}`)));
    return { output: videoRef(transformed) };
  }
}

/** Output handles SaturationVideoNode.process() emits. */
type SaturationVideoNodeOutputs = {
  output: VideoRef;
};

export class SaturationVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Saturation";
  static readonly title = "Saturation";
  static readonly description =
    "Adjust the color saturation of a video.\n    video, saturation, color, enhance";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inputFields: string[] = ["video"];
  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to adjust saturation."
  })
  declare video: VideoRef;

  @prop({
    type: "float",
    default: 1,
    title: "Saturation",
    description:
      "Saturation level. 1.0 is original, <1 decreases saturation, >1 increases saturation.",
    min: 0,
    max: 3
  })
  declare saturation: number;

  async process(context?: ProcessingContext): Promise<SaturationVideoNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    const saturation = Number(this.saturation ?? 1);
    const transformed =
      (await mediaTransform(bytes, videoFilter(`eq=saturation=${saturation}`)));
    return { output: videoRef(transformed) };
  }
}

/** Output handles AddSubtitlesVideoNode.process() emits. */
type AddSubtitlesVideoNodeOutputs = {
  output: VideoRef;
};

export class AddSubtitlesVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.AddSubtitles";
  static readonly title = "Add Subtitles";
  static readonly description =
    "Add subtitles to a video.\n    video, subtitles, text, caption";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inputFields: string[] = ["video", "chunks"];
  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to add subtitles to."
  })
  declare video: VideoRef;

  @prop({
    type: "list[audio_chunk]",
    default: [],
    title: "Chunks",
    description: "Audio chunks to add as subtitles."
  })
  declare chunks: SubtitleChunk[];

  @prop({
    type: "font",
    default: {
      type: "font",
      name: "",
      source: "system",
      url: "",
      weight: "regular"
    },
    title: "Font",
    description: "The font to use."
  })
  declare font: FontLike;

  @prop({
    type: "enum",
    default: "bottom",
    title: "Align",
    description: "Vertical alignment of subtitles.",
    values: ["top", "center", "bottom"]
  })
  declare align: string;

  @prop({
    type: "int",
    default: 24,
    title: "Font Size",
    description: "The font size.",
    min: 1,
    max: 72
  })
  declare font_size: number;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "#FFFFFF"
    },
    title: "Font Color",
    description: "The font color."
  })
  declare font_color: ColorRef;

  async process(context?: ProcessingContext): Promise<AddSubtitlesVideoNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    const chunks = Array.isArray(this.chunks) ? this.chunks : [];
    if (chunks.length === 0) return { output: videoRef(bytes) };

    const fontSize = Math.max(1, Number(this.font_size ?? 24));
    const fontColorObj = this.font_color as { value?: string } | undefined;
    const fontColor = String(fontColorObj?.value ?? "#FFFFFF").replace("#", "0x");
    // `||` (not `??`): the default font ref has name "", which must also
    // fall back rather than producing drawtext's font=''. Strip filtergraph-
    // significant characters \u2014 a font family name never contains them, and
    // leaving them in would let a crafted name break the -vf argument.
    const fontName = String(
      (this.font as { name?: string } | undefined)?.name || "Sans"
    ).replace(/['\\:,;[\]%]/g, "");
    const align = String(this.align ?? "bottom");

    let yExpr: string;
    if (align === "top") {
      yExpr = "text_h";
    } else if (align === "center") {
      yExpr = "(h-text_h)/2";
    } else {
      // bottom
      yExpr = "h-(text_h*2)";
    }

    // Write each chunk's text to a temp file and reference it with drawtext's
    // `textfile=` option. Inline `text='...'` breaks on ordinary punctuation:
    // a comma or semicolon ends the filter, `[`/`]` are stream-label syntax,
    // and the two-level filtergraph escaping is easy to get subtly wrong. A
    // file sidesteps all of it \u2014 arbitrary subtitle text stays literal.
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-subs-"));
    try {
      const drawFilters: string[] = [];
      let idx = 0;
      for (const chunk of chunks as SubtitleChunk[]) {
        const text = String(chunk.text ?? chunk.content ?? "").trim();
        if (!text) continue;
        const ts = Array.isArray(chunk.timestamp) ? chunk.timestamp : [];
        const start = Number(ts[0] ?? chunk.start ?? 0);
        const end = Number(ts[1] ?? chunk.end ?? start + 5);
        const textPath = path.join(dir, `sub_${idx}.txt`);
        await fs.writeFile(textPath, text, "utf8");
        idx += 1;
        drawFilters.push(
          `drawtext=textfile='${textPath}':expansion=none` +
            `:x=(w-text_w)/2:y=${yExpr}` +
            `:fontcolor=${fontColor}:fontsize=${fontSize}` +
            `:font='${fontName}'` +
            `:enable='between(t,${start},${end})'`
        );
      }

      if (drawFilters.length === 0) return { output: videoRef(bytes) };

      const vf = drawFilters.join(",");
      const transformed = await mediaTransform(bytes, videoFilter(vf));
      return { output: videoRef(transformed) };
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
}

/** Output handles ReverseVideoNode.process() emits. */
type ReverseVideoNodeOutputs = {
  output: VideoRef;
};

export class ReverseVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Reverse";
  static readonly title = "Reverse";
  static readonly description =
    "Reverse the playback of a video.\n    video, reverse, backwards, effect";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inputFields: string[] = ["video"];


  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to reverse."
  })
  declare video: VideoRef;

  async process(context?: ProcessingContext): Promise<ReverseVideoNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    if (bytes.length === 0) return { output: videoRef(bytes) };

    // Reverse audio+video first (fails without an audio stream); the video-only
    // fallback is terminal and throws on failure.
    const transformed =
      (await mediaTransform(
        bytes,
        { video: { filter: "reverse" }, audio: { filter: "areverse" } },
        { allowFallback: true }
      )) ?? (await mediaTransform(bytes, { video: { filter: "reverse" }, audio: null }));
    return { output: videoRef(transformed) };
  }
}

/** Output handles TransitionVideoNode.process() emits. */
type TransitionVideoNodeOutputs = {
  output: VideoRef;
};

export class TransitionVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Transition";
  static readonly title = "Transition";
  static readonly description =
    "Create a transition effect between two videos, including audio transition when available.\n    video, transition, effect, merge, audio";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inputFields: string[] = ["video_a", "video_b"];
  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video A",
    description: "The first video in the transition."
  })
  declare video_a: VideoRef;

  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video B",
    description: "The second video in the transition."
  })
  declare video_b: VideoRef;

  @prop({
    type: "enum",
    default: "fade",
    title: "Transition Type",
    description: "Type of transition effect",
    values: [
      "fade",
      "wipeleft",
      "wiperight",
      "wipeup",
      "wipedown",
      "slideleft",
      "slideright",
      "slideup",
      "slidedown",
      "circlecrop",
      "rectcrop",
      "distance",
      "fadeblack",
      "fadewhite",
      "radial",
      "smoothleft",
      "smoothright",
      "smoothup",
      "smoothdown",
      "circleopen",
      "circleclose",
      "vertopen",
      "vertclose",
      "horzopen",
      "horzclose",
      "dissolve",
      "pixelize",
      "diagtl",
      "diagtr",
      "diagbl",
      "diagbr",
      "hlslice",
      "hrslice",
      "vuslice",
      "vdslice",
      "hblur",
      "fadegrays",
      "wipetl",
      "wipetr",
      "wipebl",
      "wipebr",
      "squeezeh",
      "squeezev",
      "zoomin",
      "fadefast",
      "fadeslow",
      "hlwind",
      "hrwind",
      "vuwind",
      "vdwind",
      "coverleft",
      "coverright",
      "coverup",
      "coverdown",
      "revealleft",
      "revealright",
      "revealup",
      "revealdown"
    ]
  })
  declare transition_type: string;

  @prop({
    type: "float",
    default: 1,
    title: "Duration",
    description: "Duration of the transition effect in seconds.",
    min: 0.1,
    max: 5
  })
  declare duration: number;

  async process(context?: ProcessingContext): Promise<TransitionVideoNodeOutputs> {
    const a = await videoBytesAsync(this.video_a, context);
    const b = await videoBytesAsync(this.video_b, context);
    if (b.length === 0) return { output: videoRef(a) };
    if (a.length === 0) return { output: videoRef(b) };
    const duration = Math.max(0.1, Number(this.duration ?? 1));
    const transitionType = String(this.transition_type ?? "fade");

    // Probe video_a duration to compute offset (transition starts at end of video_a)
    const tempA = await withTempFile(".mp4", a);
    let offsetVal: number;
    try {
      const aDuration = (await probeDurationSec(tempA.path)) ?? 0;
      offsetVal = Math.max(0, aDuration - duration);
    } finally {
      await tempA.cleanup();
    }

    // Try with audio crossfade first, then fall back to video-only
    const picture: StreamPlan = {
      graph: `[0:v][1:v]xfade=transition=${transitionType}:duration=${duration}:offset=${offsetVal}[outv]`,
      output: "outv"
    };
    const extraInputs = [{ suffix: ".mp4", bytes: b }];
    const transformed =
      (await mediaTransform(
        a,
        { video: picture, audio: { graph: `[0:a][1:a]acrossfade=d=${duration}[outa]`, output: "outa" } },
        { extraInputs, allowFallback: true }
      )) ??
      // Fallback: video-only xfade (inputs may lack audio), with the first
      // video's sound when it has any. Terminal attempt — throws if it also
      // fails.
      (await mediaTransform(a, { video: picture, audio: KEEP_AUDIO }, { extraInputs }));
    return { output: videoRef(transformed) };
  }
}

/** Output handles AddAudioVideoNode.process() emits. */
type AddAudioVideoNodeOutputs = {
  output: VideoRef;
};

export class AddAudioVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.AddAudio";
  static readonly title = "Add Audio";
  static readonly description =
    "Add an audio track to a video, replacing or mixing with existing audio.\n    video, audio, soundtrack, merge";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inputFields: string[] = ["video", "audio"];


  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to add audio to."
  })
  declare video: VideoRef;

  @prop({
    type: "audio",
    default: {
      type: "audio",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Audio",
    description: "The audio file to add to the video."
  })
  declare audio: AudioRef;

  @prop({
    type: "float",
    default: 1,
    title: "Volume",
    description:
      "Volume adjustment for the added audio. 1.0 is original volume.",
    min: 0,
    max: 2
  })
  declare volume: number;

  @prop({
    type: "bool",
    default: false,
    title: "Mix",
    description:
      "If True, mix new audio with existing. If False, replace existing audio."
  })
  declare mix: boolean;

  @prop({
    type: "enum",
    default: "video",
    title: "Output Length",
    description:
      "How long the output is. 'video' matches the picture: a longer audio track is trimmed, a shorter one padded with silence. 'longest' keeps both streams whole, so a track that outruns the picture leaves the output playing over nothing.",
    values: ["video", "longest"]
  })
  declare output_length: string;

  async process(context?: ProcessingContext): Promise<AddAudioVideoNodeOutputs> {
    const v = await videoBytesAsync(this.video, context);
    const a = await audioBytesAsync(this.audio, context);
    if (v.length === 0) return { output: videoRef(v) };
    if (a.length === 0) return { output: videoRef(v) };

    const volume = Math.max(0, Number(this.volume ?? 1));
    const mix = Boolean(this.mix);
    // Left to the muxer the file is as long as the *longer* stream, so a
    // music model that ignores the requested duration turns a 25-second clip
    // into a four-minute one. `apad` makes the audio endless and `shortest`
    // then ends the file with the picture, which also stops a short audio
    // track from cutting the picture off.
    const trimToVideo = String(this.output_length ?? "video") !== "longest";
    const pad = trimToVideo ? ",apad" : "";

    const editFor = (useMix: boolean): MediaEdit => {
      let audio: StreamPlan;
      if (useMix) {
        audio = {
          graph: `[1:a]volume=${volume}[newaud];[0:a][newaud]amix=inputs=2:duration=longest${pad}[aout]`,
          output: "aout"
        };
      } else if (volume !== 1 || trimToVideo) {
        audio = { graph: `[1:a]volume=${volume}${pad}[aout]`, output: "aout" };
      } else {
        audio = { filter: "anull", input: 1 };
      }
      return { video: { copy: 0 }, audio, shortest: trimToVideo };
    };

    const extraInputs = [{ suffix: ".wav", bytes: a }];
    // Mixing requires an existing audio stream ([0:a]); a video without one
    // fails. Fall back to plain replacement — the terminal attempt, which
    // throws if it also fails.
    const result =
      (mix ? await mediaTransform(v, editFor(true), { extraInputs, allowFallback: true }) : null) ??
      (await mediaTransform(v, editFor(false), { extraInputs }));
    return { output: videoRef(result) };
  }
}

/** Output handles ChromaKeyVideoNode.process() emits. */
type ChromaKeyVideoNodeOutputs = {
  output: VideoRef;
};

export class ChromaKeyVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.ChromaKey";
  static readonly title = "Chroma Key";
  static readonly description =
    "Apply chroma key (green screen) effect to a video. The MP4 output has no alpha channel, so the keyed-out area renders black — composite it over a background with the Overlay node.\n    video, chroma key, green screen, compositing";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inputFields: string[] = ["video"];
  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to apply chroma key effect."
  })
  declare video: VideoRef;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "#00FF00"
    },
    title: "Key Color",
    description: "The color to key out (e.g., '#00FF00' for green)."
  })
  declare key_color: ColorRef;

  @prop({
    type: "float",
    default: 0.3,
    title: "Similarity",
    description: "Similarity threshold for the key color.",
    min: 0,
    max: 1
  })
  declare similarity: number;

  @prop({
    type: "float",
    default: 0.1,
    title: "Blend",
    description: "Blending of the keyed area edges.",
    min: 0,
    max: 1
  })
  declare blend: number;

  async process(context?: ProcessingContext): Promise<ChromaKeyVideoNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    const keyColorObj = this.key_color as { value?: string } | undefined;
    const color = String(keyColorObj?.value ?? "#00FF00").replace("#", "0x");
    const similarity = Number(this.similarity ?? 0.3);
    const blend = Number(this.blend ?? 0.1);
    const transformed =
      (await mediaTransform(bytes, videoFilter(`colorkey=${color}:${similarity}:${blend}`)));
    return { output: videoRef(transformed) };
  }
}

/** Output handles ExtractAudioVideoNode.process() emits. */
type ExtractAudioVideoNodeOutputs = {
  output: { type: string; data: null; uri: string; asset_id: null; metadata: null } | { type: string; data: string; uri: string; asset_id: null; metadata: null };
};

export class ExtractAudioVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.ExtractAudio";
  static readonly title = "Extract Audio";
  static readonly description =
    "Separate and extract audio track from a video file.\n    video, audio, extract, separate, split";
  static readonly metadataOutputTypes = {
    output: "audio"
  };
  static readonly inputFields: string[] = ["video"];


  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to separate."
  })
  declare video: VideoRef;

  async process(context?: ProcessingContext): Promise<ExtractAudioVideoNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    if (bytes.length === 0) {
      return {
        output: {
          type: "audio",
          data: null,
          uri: "",
          asset_id: null,
          metadata: null
        }
      };
    }

    const input = await withTempFile(".mp4", bytes);
    const outputDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "nodetool-audio-out-")
    );
    const outputPath = path.join(outputDir, "output.wav");
    try {
      await convertAudioToWav(input.path, outputPath);
      const audioBytes = new Uint8Array(await fs.readFile(outputPath));
      const b64 = Buffer.from(audioBytes).toString("base64");
      return {
        output: {
          type: "audio",
          data: b64,
          uri: "",
          asset_id: null,
          metadata: null
        }
      };
    } finally {
      await input.cleanup();
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  }
}

/** Output handles ExtractFrameVideoNode.process() emits. */
type ExtractFrameVideoNodeOutputs = {
  output: { type: string; data: null } | { type: string; data: string };
};

export class ExtractFrameVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.ExtractFrame";
  static readonly title = "Extract Video Frame";
  static readonly description =
    "Extract a single frame from a video at a specific time position.\n    video, frame, extract, screenshot, thumbnail, capture";
  static readonly metadataOutputTypes = {
    output: "image"
  };
  static readonly inputFields: string[] = ["video"];


  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to extract a frame from."
  })
  declare video: VideoRef;

  @prop({
    type: "float",
    default: 0,
    title: "Time",
    description: "Time position in seconds to extract the frame from.",
    min: 0
  })
  declare time: number;

  async process(context?: ProcessingContext): Promise<ExtractFrameVideoNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    if (bytes.length === 0) {
      return { output: { type: "image", data: null } };
    }

    const inputFile = await withTempFile(".mp4", bytes);
    try {
      const time = Math.max(0, Number(this.time ?? 0));
      const alpha = (await probeMedia(inputFile.path)).video?.alpha ?? false;
      for await (const png of pngFrames({ filePath: inputFile.path, seekSec: time, limit: 1, alpha })) {
        return {
          output: {
            type: "image",
            data: Buffer.from(png).toString("base64")
          }
        };
      }
      // Seeking past the end leaves no frame.
      return { output: { type: "image", data: null } };
    } catch {
      // A genuine decode failure yields an empty frame.
      return { output: { type: "image", data: null } };
    } finally {
      await inputFile.cleanup();
    }
  }
}

/** Output handles GetVideoInfoNode.process() emits. */
type GetVideoInfoNodeOutputs = {
  duration: number;
  width: number;
  height: number;
  fps: number;
  frame_count: number;
  codec: string;
  has_audio: boolean;
};

export class GetVideoInfoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.GetVideoInfo";
  static readonly title = "Get Video Info";
  static readonly description =
    "Get metadata about a video file including duration, resolution, frame rate, and codec.\n    video, info, metadata, duration, resolution, fps, codec, analysis";
  static readonly metadataOutputTypes = {
    duration: "float",
    width: "int",
    height: "int",
    fps: "float",
    frame_count: "int",
    codec: "str",
    has_audio: "bool"
  };
  static readonly inputFields: string[] = ["video"];


  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to analyze."
  })
  declare video: VideoRef;

  async process(context?: ProcessingContext): Promise<GetVideoInfoNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    if (bytes.length === 0) {
      return {
        duration: 0,
        width: 0,
        height: 0,
        fps: 0,
        frame_count: 0,
        codec: "",
        has_audio: false
      };
    }

    const inputFile = await withTempFile(".mp4", bytes);
    try {
      const info = await probeVideoInfo(inputFile.path);
      const frameCount = info.width > 0 ? ((await packetTimes(inputFile.path))?.length ?? 0) : 0;
      return {
        duration: info.durationSec,
        width: info.width,
        height: info.height,
        fps: info.fps,
        frame_count: frameCount,
        codec: info.codec,
        has_audio: info.hasAudio
      };
    } catch {
      // A probe failure on corrupt input degrades to the empty info result.
      return {
        duration: 0,
        width: 0,
        height: 0,
        fps: 0,
        frame_count: 0,
        codec: "",
        has_audio: false
      };
    } finally {
      await inputFile.cleanup();
    }
  }
}

/** Output handles VideoToVideoNode.process() emits. */
type VideoToVideoNodeOutputs = {
  output: VideoRef;
};

export class VideoToVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.VideoToVideo";
  static readonly body = "content_card";
  static readonly title = "Video To Video";
  static readonly description =
    "Restyle or edit an existing video with a text prompt using any supported video provider.\n    video, video-to-video, v2v, restyle, style-transfer, AI";
  static readonly metadataOutputTypes = { output: "video" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["video", "prompt"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "video_model",
    default: {
      type: "video_model",
      provider: "fal_ai",
      id: "fal-ai/ltx-2-19b/distilled/video-to-video",
      name: "LTX Video To Video",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "The video-to-video model to use"
  })
  declare model: VideoModelRef;

  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video to transform"
  })
  declare video: VideoRef;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Text prompt describing the desired transformation"
  })
  declare prompt: string;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Text prompt describing what to avoid"
  })
  declare negative_prompt: string;

  @prop({
    type: "float",
    default: 0.6,
    title: "Strength",
    description: "How much to transform the input video",
    min: 0,
    max: 1
  })
  declare strength: number;

  @prop({
    type: "list[entity]",
    default: [],
    title: "Entities",
    description:
      "Consistency entities whose descriptors are injected into the prompt and whose reference images guide the edit"
  })
  declare entities: Entity[];

  async process(context?: ProcessingContext): Promise<VideoToVideoNodeOutputs> {
    const bytes = await videoBytesAsync(this.video, context);
    if (bytes.length === 0) throw new Error("The input video is empty.");
    const { providerId, modelId } = modelConfig(this.serialize());
    if (!canUseProvider(context, providerId, modelId)) {
      throw new Error("No provider available for video-to-video generation.");
    }
    const output = coerceProviderBytes(
      await context.runProviderPrediction({
      provider: providerId,
      capability: "video_to_video",
      model: modelId,
      params: {
        video: bytes,
        prompt: await expandPromptMentions(String(this.prompt ?? ""), context),
        negative_prompt: this.negative_prompt,
        entities: await resolveEntities(this.entities, context),
        strength: Number(this.strength ?? 0.6)
      }
    }),
      "Video To Video"
    );
    return { output: videoRef(output) };
  }
}

/** Output handles LipSyncNode.process() emits. */
type LipSyncNodeOutputs = {
  output: VideoRef;
};

export class LipSyncNode extends BaseNode {
  static readonly nodeType = "nodetool.video.LipSync";
  static readonly body = "content_card";
  static readonly title = "Lip Sync";
  static readonly description =
    "Drive a face in a video to match speech in an audio track using any supported lip-sync provider.\n    video, lip-sync, lipsync, talking-head, dubbing, AI";
  static readonly metadataOutputTypes = { output: "video" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["video", "audio"];
  static readonly autoSaveAsset = true;

  @prop({
    type: "video_model",
    default: {
      type: "video_model",
      provider: "fal_ai",
      id: "fal-ai/sync-lipsync/v2",
      name: "Sync Lipsync V2",
      path: null,
      supported_tasks: []
    },
    title: "Model",
    description: "The lip-sync model to use"
  })
  declare model: VideoModelRef;

  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The input video containing the face to drive"
  })
  declare video: VideoRef;

  @prop({
    type: "audio",
    default: { type: "audio", uri: "", asset_id: null, data: null, metadata: null },
    title: "Audio",
    description: "The audio track the mouth motion should follow"
  })
  declare audio: AudioRef;

  async process(context?: ProcessingContext): Promise<LipSyncNodeOutputs> {
    const video = await videoBytesAsync(this.video, context);
    if (video.length === 0) throw new Error("The input video is empty.");
    const audio = await audioBytesAsync(this.audio, context);
    if (audio.length === 0) throw new Error("The input audio is empty.");
    const { providerId, modelId } = modelConfig(this.serialize());
    if (!canUseProvider(context, providerId, modelId)) {
      throw new Error("No provider available for lip sync.");
    }
    const output = coerceProviderBytes(
      await context.runProviderPrediction({
      provider: providerId,
      capability: "lip_sync",
      model: modelId,
      params: { video, audio }
    }),
      "Lip Sync"
    );
    return { output: videoRef(output) };
  }
}

export const VIDEO_NODES = [
  TextToVideoNode,
  ImageToVideoNode,
  ReferenceToVideoNode,
  LoadVideoFileNode,
  SaveVideoFileVideoNode,
  LoadVideoAssetsNode,
  SaveVideoNode,
  ForEachFrameNode,
  FpsNode,
  FrameToVideoNode,
  ConcatVideoNode,
  TrimVideoNode,
  ResizeVideoNode,
  RotateVideoNode,
  SetSpeedVideoNode,
  EaseCurveVideoNode,
  OverlayVideoNode,
  ColorBalanceVideoNode,
  DenoiseVideoNode,
  StabilizeVideoNode,
  SharpnessVideoNode,
  BlurVideoNode,
  SaturationVideoNode,
  AddSubtitlesVideoNode,
  ReverseVideoNode,
  TransitionVideoNode,
  AddAudioVideoNode,
  ChromaKeyVideoNode,
  ExtractAudioVideoNode,
  ExtractFrameVideoNode,
  GetVideoInfoNode,
  VideoToVideoNode,
  LipSyncNode
] as const;
