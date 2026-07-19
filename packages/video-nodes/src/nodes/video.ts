import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import type {
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
import { loadMediaRefBytes, mapPromptAssetsToInputs } from "@nodetool-ai/runtime";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  audioBytesAsync,
  toBytes
} from "@nodetool-ai/audio-nodes";
import {
  MissingBinaryError,
  execFfmpeg,
  execFfprobe,
  videoRef,
  defaultVideoRef,
  filePath,
  folderPath,
  dateName,
  uniqueTargetPath,
  parseFrameRate,
  ffprobeDuration,
  withTempFile,
  coerceProviderBytes,
  FFMPEG_MAX_BUFFER
} from "./ffmpeg-helpers.js";

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
  if (!video || typeof video !== "object") return new Uint8Array();
  const bytes = await loadMediaRefBytes(video as VideoRefLike, context);
  return bytes ?? new Uint8Array();
}

async function imageBytesAsync(
  image: unknown,
  context?: ProcessingContext
): Promise<Uint8Array> {
  if (!image || typeof image !== "object") return new Uint8Array();
  const bytes = await loadMediaRefBytes(image as ImageRefLike, context);
  return bytes ?? new Uint8Array();
}

/**
 * Whether an image ref already points at a source (wired upstream, a stored
 * asset, or inline bytes) rather than the empty default — used to decide if an
 * inline `asset://` mention in the prompt should supply the input.
 */
function imageRefHasSource(image: unknown): boolean {
  if (!image || typeof image !== "object") return false;
  const ref = image as ImageRefLike & { asset_id?: unknown };
  if (typeof ref.uri === "string" && ref.uri.trim() !== "") return true;
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
 * Parse cropdetect's suggested crop from ffmpeg stderr. cropdetect logs one
 * `crop=w:h:x:y` per analyzed frame; the last suggestion reflects the full
 * analysis, so return that. Null when no suggestion is present.
 */
export function parseCropDetectCrop(stderr: string): string | null {
  const matches = stderr.match(/crop=(\d+:\d+:\d+:\d+)/g);
  if (!matches || matches.length === 0) return null;
  const last = matches[matches.length - 1];
  return last.slice("crop=".length);
}

/**
 * Encode a sequence of frame refs into an H.264 MP4.
 *
 * Frames arrive in one of two shapes and the demuxer differs for each:
 *   - In-flight **raw-RGBA** refs ({@link isRawRgbaImage}) carry uncompressed
 *     pixels in `data` plus `width`/`height`. These are NOT a decodable image —
 *     writing them to `frame_*.png` makes ffmpeg fail with "Invalid PNG
 *     signature". They must be fed through the `rawvideo` demuxer instead.
 *   - **Encoded** refs carry PNG/JPEG bytes (Uint8Array or base64 string),
 *     which the `image2` demuxer reads from numbered files.
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
    if (!f || typeof f !== "object") return false;
    if (isRawRgbaImage(f)) return f.data.length > 0;
    return toBytes((f as { data?: Uint8Array | string }).data).length > 0;
  };
  const first = frames.find(isUsable);
  if (!first) return new Uint8Array();

  const inputDir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-ftv-in-"));
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-ftv-out-"));
  const outputPath = path.join(outputDir, "output.mp4");
  try {
    if (isRawRgbaImage(first)) {
      const { width, height } = first;
      // Append each frame to the raw file as it is visited. 300 frames of 1080p
      // RGBA is ~2.5 GB — Buffer.concat'ing them all would blow up memory.
      const rawPath = path.join(inputDir, "frames.raw");
      const handle = await fs.open(rawPath, "w");
      let framesWritten = 0;
      try {
        for (const f of frames) {
          if (
            isRawRgbaImage(f) &&
            f.data.length > 0 &&
            f.width === width &&
            f.height === height
          ) {
            await handle.write(
              Buffer.from(f.data.buffer, f.data.byteOffset, f.data.byteLength)
            );
            framesWritten += 1;
          }
        }
      } finally {
        await handle.close();
      }
      if (framesWritten === 0) return new Uint8Array();
      await execFfmpeg(
        [
          "-y",
          "-f", "rawvideo",
          "-pixel_format", "rgba",
          "-video_size", `${width}x${height}`,
          "-framerate", String(fps),
          "-i", rawPath,
          "-c:v", "libx264",
          "-pix_fmt", "yuv420p",
          outputPath
        ],
        { maxBuffer: 50 * 1024 * 1024 }
      );
    } else {
      // Contiguous counter so skipped frames don't leave gaps in the numbered
      // sequence (ffmpeg's image2 demuxer stops at the first missing number).
      let written = 0;
      for (const f of frames) {
        if (!f || typeof f !== "object" || isRawRgbaImage(f)) continue;
        const frameBytes = toBytes((f as { data?: Uint8Array | string }).data);
        if (frameBytes.length === 0) continue;
        written += 1;
        await fs.writeFile(
          path.join(inputDir, `frame_${String(written).padStart(6, "0")}.png`),
          frameBytes
        );
      }
      if (written === 0) return new Uint8Array();
      await execFfmpeg(
        [
          "-y",
          "-framerate", String(fps),
          "-i", path.join(inputDir, "frame_%06d.png"),
          "-c:v", "libx264",
          "-pix_fmt", "yuv420p",
          outputPath
        ],
        { maxBuffer: 50 * 1024 * 1024 }
      );
    }
    return new Uint8Array(await fs.readFile(outputPath));
  } finally {
    // execFfmpeg already maps a missing binary to a clear error; a genuine
    // fs error (writing frames / reading output) propagates as itself rather
    // than being mislabeled.
    await fs.rm(inputDir, { recursive: true, force: true });
    await fs.rm(outputDir, { recursive: true, force: true });
  }
}

function modelConfig(props: Record<string, unknown>): {
  providerId: string;
  modelId: string;
} {
  const model = (props.model ?? {}) as Record<string, unknown>;
  return {
    providerId: typeof model.provider === "string" ? model.provider : "",
    modelId: typeof model.id === "string" ? model.id : ""
  };
}

function canUseProvider(
  context: ProcessingContext | undefined,
  providerId: string,
  modelId: string
): context is ProcessingContext & {
  runProviderPrediction: (req: Record<string, unknown>) => Promise<unknown>;
} {
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

interface FfmpegTransformOptions {
  /** Extra `-i` inputs appended after the main input, in order. */
  extraInputs?: Array<{ suffix: string; bytes: Uint8Array }>;
  /** Args placed BEFORE `-i` (e.g. input-side `-ss`/`-to` seeking). */
  preInputArgs?: string[];
  /**
   * When true, a genuine ffmpeg failure returns null so the caller can try the
   * next attempt in a chain. A missing binary still throws. When false/omitted
   * a failure throws with ffmpeg's stderr — never a silent input pass-through.
   */
  allowFallback?: boolean;
}

async function ffmpegTransform(
  video: Uint8Array,
  args: string[],
  options?: Omit<FfmpegTransformOptions, "allowFallback"> & {
    allowFallback?: false;
  }
): Promise<Uint8Array>;
async function ffmpegTransform(
  video: Uint8Array,
  args: string[],
  options: FfmpegTransformOptions & { allowFallback: true }
): Promise<Uint8Array | null>;
async function ffmpegTransform(
  video: Uint8Array,
  args: string[],
  options: FfmpegTransformOptions = {}
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
    const inputArgs = ["-y", ...(options.preInputArgs ?? []), "-i", mainInput.path];
    for (const other of others) inputArgs.push("-i", other.path);
    await execFfmpeg([...inputArgs, ...args, outputPath], {
      maxBuffer: 10 * 1024 * 1024
    });
    return new Uint8Array(await fs.readFile(outputPath));
  } catch (error) {
    // A missing binary is unrecoverable — surface it. A genuine ffmpeg failure
    // returns null only when the caller allows a chained fallback; otherwise it
    // throws with stderr rather than silently passing the input through.
    if (error instanceof MissingBinaryError) throw error;
    if (options.allowFallback) return null;
    const stderr = (error as { stderr?: string }).stderr;
    const detail = (typeof stderr === "string" && stderr.trim()) || (error as Error).message;
    throw new Error(`ffmpeg failed: ${detail}`);
  } finally {
    await mainInput.cleanup();
    for (const other of others) await other.cleanup();
    await fs.rm(outputDir, { recursive: true, force: true });
  }
}

/**
 * Base for every ffmpeg-backed node. Carries only the runtime gate; each node
 * declares its own props and `process()`.
 */
abstract class VideoTransformNode extends BaseNode {
  static readonly requiredRuntimes = ["ffmpeg"];
}

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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const text = String(this.prompt ?? "");
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
      "Input image(s) to animate. The first image is the primary frame; additional images are used as references by providers that support multi-image input."
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
    description: "Optional text prompt to guide the video animation"
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
    type: "list[dict]",
    default: [],
    title: "Entities",
    description:
      "Consistency entities (characters, styles, locations) whose descriptors are injected into the prompt"
  })
  declare entities: unknown[];

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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
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
    if (typeof overrides.prompt === "string") prompt = overrides.prompt;
    if (overrides.image && images.length === 0) {
      images = [overrides.image as ImageRefLike];
    }

    const bytesList = (
      await Promise.all(images.map((img) => imageBytesAsync(img, context)))
    ).filter((b) => b.length > 0);
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
        images: bytesList,
        prompt,
        negative_prompt: this.negative_prompt,
        entities: this.entities,
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

export class LoadVideoFileNode extends BaseNode {
  static readonly nodeType = "nodetool.video.LoadVideoFile";
  static readonly title = "Load Video File";
  static readonly description =
    "Read a video file from disk.\n    video, input, load, file";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = [];

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to the video file to read"
  })
  declare path: string;

  async process(): Promise<Record<string, unknown>> {
    const p = filePath(String(this.path ?? "").trim());
    if (!p) throw new Error("No file path provided to Load Video File.");
    const data = new Uint8Array(await fs.readFile(p));
    return { output: videoRef(data, { uri: `file://${p}` }) };
  }
}

/**
 * Resolve the destination folder for a save node. An explicit folder wins;
 * otherwise fall back to the run's workspace directory rather than the server
 * process cwd (`.`), which is rarely where a user wants their output.
 */
function saveFolder(rawFolder: unknown, context?: ProcessingContext): string {
  return folderPath(rawFolder) || context?.workspaceDir || ".";
}

export class SaveVideoFileVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.SaveVideoFile";
  static readonly title = "Save Video File";
  static readonly description =
    "Write a video file to disk.\n    video, output, save, file\n\n    The filename can include time and date variables:\n    %Y - Year, %m - Month, %d - Day\n    %H - Hour, %M - Minute, %S - Second";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["video"];

  @prop({
    type: "video",
    default: defaultVideoRef(),
    title: "Video",
    description: "The video to save"
  })
  declare video: VideoRef;

  @prop({
    type: "str",
    default: "",
    title: "Folder",
    description: "Folder where the file will be saved"
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const folder = saveFolder(this.folder, context);
    const fname = dateName(String(this.filename || "video.mp4"));
    await fs.mkdir(path.resolve(folder), { recursive: true });
    // dateName resolves to second granularity, so two saves in the same second
    // collide — de-duplicate with a -1/-2/… suffix rather than overwrite.
    const p = await uniqueTargetPath(path.resolve(folder, fname));
    const bytes = await videoBytesAsync(this.video, context);
    await fs.writeFile(p, bytes);
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
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    video: { kind: "iteration", source: "__execution__", group: "items" },
    name: { kind: "iteration", source: "__execution__", group: "items" },
    videos: { kind: "single", source: "__execution__" },
    names: { kind: "single", source: "__execution__" }
  };

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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
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

export class ForEachFrameNode extends VideoTransformNode {
  static readonly nodeType = "nodetool.video.ForEachFrame";
  static readonly title = "For Each Frame";
  static readonly description =
    "Extract frames from a video file with ffmpeg.\n    video, frames, extract, sequence";
  static readonly metadataOutputTypes = {
    frame: "image",
    index: "int",
    fps: "float"
  };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["video"];

  static readonly inputMode: InputMode = "buffered";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    frame: { kind: "iteration", source: "video", group: "items" },
    index: { kind: "iteration", source: "video", group: "items" },
    fps: { kind: "single", source: "video" }
  };

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

  async *genProcess(context?: ProcessingContext): AsyncGenerator<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video, context);
    if (bytes.length === 0) return;

    const inputFile = await withTempFile(".mp4", bytes);
    const outputDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "nodetool-frames-out-")
    );
    try {
      let fps = 24;
      try {
        const { stdout } = await execFfprobe([
          "-v", "error",
          "-select_streams", "v:0",
          "-show_entries", "stream=r_frame_rate",
          "-of", "csv=p=0",
          inputFile.path
        ]);
        const parsed = parseFrameRate(stdout);
        if (parsed > 0) fps = parsed;
      } catch (error) {
        // Missing ffprobe is actionable; a genuine probe failure falls back to
        // 24 fps.
        if (error instanceof MissingBinaryError) throw error;
      }

      const start = Math.max(0, Number(this.start ?? 0));
      const end = Number(this.end ?? -1);

      const vfFilter =
        end >= 0
          ? `select='between(n,${start},${end})'`
          : `select='gte(n,${start})'`;

      // With a bounded range, cap decoding at the number of selected frames so
      // ffmpeg stops early instead of scanning to the end of the video.
      const frameLimit =
        end >= 0 ? ["-frames:v", String(end - start + 1)] : [];

      await execFfmpeg(
        [
          "-y",
          "-i", inputFile.path,
          "-vf", vfFilter,
          "-vsync", "vfr",
          ...frameLimit,
          path.join(outputDir, "frame_%d.png")
        ],
        { maxBuffer: FFMPEG_MAX_BUFFER }
      );

      const entries = await fs.readdir(outputDir);
      const frameFiles = entries
        .filter((f) => f.startsWith("frame_") && f.endsWith(".png"))
        .sort((a, b) => {
          const numA = parseInt(a.replace("frame_", "").replace(".png", ""), 10);
          const numB = parseInt(b.replace("frame_", "").replace(".png", ""), 10);
          return numA - numB;
        });

      for (let i = 0; i < frameFiles.length; i++) {
        const frameData = new Uint8Array(
          await fs.readFile(path.join(outputDir, frameFiles[i]))
        );
        yield {
          frame: {
            type: "image",
            data: Buffer.from(frameData).toString("base64")
          },
          index: start + i,
          fps
        };
      }
    } finally {
      await inputFile.cleanup();
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  }
}

export class FpsNode extends VideoTransformNode {
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video, context);
    if (bytes.length === 0) return { output: 0 };

    const inputFile = await withTempFile(".mp4", bytes);
    try {
      const { stdout } = await execFfprobe([
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=r_frame_rate",
        "-of", "csv=p=0",
        inputFile.path
      ]);
      return { output: parseFrameRate(stdout) };
    } catch (error) {
      // Missing ffprobe is actionable; a genuine probe failure degrades to 0.
      if (error instanceof MissingBinaryError) throw error;
      return { output: 0 };
    } finally {
      await inputFile.cleanup();
    }
  }
}

export class FrameToVideoNode extends VideoTransformNode {
  static readonly nodeType = "nodetool.video.FrameToVideo";
  static readonly title = "Frame To Video";
  static readonly description =
    "Combine a sequence of frames into a single video file.\n    video, frames, combine, sequence";
  static readonly isStreamingInput = true;
  static readonly inputMode: InputMode = "stream";
  static readonly outputCorrelation: Record<string, OutputCorrelation> = {
    output: { kind: "aggregate", source: "frame", collapse: "innermost" }
  };

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

  async process(): Promise<Record<string, unknown>> {
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
  const { stdout } = await execFfprobe([
    "-v",
    "error",
    "-show_streams",
    "-show_format",
    "-of",
    "json",
    file
  ]);
  const info = JSON.parse(stdout) as {
    streams?: Array<{
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      r_frame_rate?: string;
    }>;
  };
  const streams = info.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video");
  return {
    codec: v?.codec_name ?? "",
    width: v?.width ?? 0,
    height: v?.height ?? 0,
    fps: v?.r_frame_rate ? parseFrameRate(v.r_frame_rate) : 0,
    hasAudio: streams.some((s) => s.codec_type === "audio")
  };
}

/**
 * Scale + pad to a uniform frame, normalize fps/pixel format, re-encode to
 * libx264 + AAC (adding silent audio when the source has none) so mismatched
 * segments can be concatenated losslessly with `-c copy`.
 */
async function normalizeConcatSegment(
  srcPath: string,
  segPath: string,
  width: number,
  height: number,
  fps: number,
  hasAudio: boolean
): Promise<void> {
  const filter =
    `scale=${width}:${height}:force_original_aspect_ratio=decrease,` +
    `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black,` +
    `fps=${fps},format=yuv420p`;
  const silent = [
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000"
  ];
  await execFfmpeg(
    [
      "-y",
      "-i",
      srcPath,
      ...(hasAudio ? [] : silent),
      "-filter_complex",
      `[0:v]${filter}[v]`,
      "-map",
      "[v]",
      "-map",
      hasAudio ? "0:a" : "1:a",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-c:a",
      "aac",
      "-ar",
      "48000",
      "-ac",
      "2",
      "-shortest",
      segPath
    ],
    { maxBuffer: FFMPEG_MAX_BUFFER }
  );
}

export class ConcatVideoNode extends VideoTransformNode {
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
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
    const listPath = path.join(concatDir, "list.txt");
    const outputPath = path.join(concatDir, "output.mp4");
    try {
      // Stream-copying heterogeneous inputs (different codec/size/fps) with the
      // concat demuxer produces corrupt output. Probe every input; only take
      // the fast `-c copy` path when they all match, else normalize each to a
      // uniform segment (first input's resolution/fps) before concatenating.
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

      let concatPaths: string[];
      if (uniform) {
        concatPaths = inputs.map((input) => input.path);
      } else {
        const width = first.width > 0 ? first.width : 1920;
        const height = first.height > 0 ? first.height : 1080;
        const fps = first.fps > 0 ? first.fps : 30;
        concatPaths = [];
        for (const [i, input] of inputs.entries()) {
          const segPath = path.join(concatDir, `seg_${i}.mp4`);
          await normalizeConcatSegment(
            input.path,
            segPath,
            width,
            height,
            fps,
            metas[i].hasAudio
          );
          concatPaths.push(segPath);
        }
      }

      const listEntries = concatPaths.map((p) => `file '${p}'`).join("\n");
      await fs.writeFile(listPath, `${listEntries}\n`);
      await execFfmpeg(
        ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", outputPath],
        { maxBuffer: FFMPEG_MAX_BUFFER }
      );
      const result = new Uint8Array(await fs.readFile(outputPath));
      return { output: videoRef(result) };
    } catch (error) {
      if (error instanceof MissingBinaryError) throw error;
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

export class TrimVideoNode extends VideoTransformNode {
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video, context);
    if (bytes.length === 0) return { output: videoRef(bytes) };

    const start = Math.max(0, Number(this.start_time ?? 0));
    const end = Number(this.end_time ?? -1);

    if (this.accurate) {
      // Output-side seek (after -i): ffmpeg decodes every frame up to `start`
      // and re-encodes, so the cut lands on the exact requested time instead of
      // the nearest keyframe. Slower, but frame-accurate.
      const seekArgs: string[] = ["-ss", String(start)];
      if (end >= 0) {
        seekArgs.push("-to", String(end));
      }
      const transformed = await ffmpegTransform(bytes, seekArgs);
      return { output: videoRef(transformed) };
    }

    // Input-side seek (before -i): ffmpeg jumps to the nearest keyframe instead
    // of decoding from the start, so trimming a long clip is near-instant.
    const preInputArgs: string[] = ["-ss", String(start)];
    if (end >= 0) {
      preInputArgs.push("-to", String(end));
    }

    const transformed = await ffmpegTransform(bytes, ["-c", "copy"], {
      preInputArgs
    });
    return { output: videoRef(transformed) };
  }
}

export class ResizeVideoNode extends VideoTransformNode {
  static readonly nodeType = "nodetool.video.Resize";
  static readonly title = "Resize";
  static readonly description =
    "Resize a video to a specific width and height.\n    video, resize, scale, dimensions";
  static readonly metadataOutputTypes = {
    output: "video"
  };
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video, context);
    const width = Number(this.width ?? -1);
    const height = Number(this.height ?? -1);
    const transformed =
      (await ffmpegTransform(bytes, [
        "-vf",
        `scale=${width}:${height}`,
        "-c:a",
        "copy"
      ]));
    return { output: videoRef(transformed) };
  }
}

export class RotateVideoNode extends VideoTransformNode {
  static readonly nodeType = "nodetool.video.Rotate";
  static readonly title = "Rotate";
  static readonly description =
    "Rotate a video by a specified angle.\n    video, rotate, orientation, transform";
  static readonly metadataOutputTypes = {
    output: "video"
  };
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video, context);
    const angle = Number(this.angle ?? 0);
    const radians = (angle * Math.PI) / 180;
    const transformed =
      (await ffmpegTransform(bytes, [
        "-vf",
        `rotate=${radians}:ow=rotw(${radians}):oh=roth(${radians})`,
        "-c:a",
        "copy"
      ]));
    return { output: videoRef(transformed) };
  }
}

export class SetSpeedVideoNode extends VideoTransformNode {
  static readonly nodeType = "nodetool.video.SetSpeed";
  static readonly title = "Set Speed";
  static readonly description =
    "Adjust the playback speed of a video.\n    video, speed, tempo, time";
  static readonly metadataOutputTypes = {
    output: "video"
  };
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
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
    const transformed =
      (await ffmpegTransform(
        bytes,
        [
          "-filter_complex",
          `[0:v]setpts=${1 / speed}*PTS[v];[0:a]${atempoChain}[a]`,
          "-map",
          "[v]",
          "-map",
          "[a]"
        ],
        { allowFallback: true }
      )) ??
      (await ffmpegTransform(bytes, ["-vf", `setpts=${1 / speed}*PTS`]));
    return { output: videoRef(transformed) };
  }
}

export class OverlayVideoNode extends VideoTransformNode {
  static readonly nodeType = "nodetool.video.Overlay";
  static readonly title = "Overlay";
  static readonly description =
    "Overlay one video on top of another, including audio overlay when available.\n    video, overlay, composite, picture-in-picture, audio";
  static readonly metadataOutputTypes = {
    output: "video"
  };
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const mainVideo = await videoBytesAsync(this.main_video, context);
    const overlayVideo = await videoBytesAsync(this.overlay_video, context);
    if (overlayVideo.length === 0) return { output: videoRef(mainVideo) };
    if (mainVideo.length === 0) return { output: videoRef(overlayVideo) };
    const x = Number(this.x ?? 0);
    const y = Number(this.y ?? 0);
    const scale = Math.max(0.01, Number(this.scale ?? 1));
    const vol = Math.max(0, Math.min(1, Number(this.overlay_audio_volume ?? 0.5)));

    // Try with audio mixing first, fall back to video-only overlay
    const filterWithAudio =
      `[1:v]scale=iw*${scale}:ih*${scale}[ov];[0:v][ov]overlay=${x}:${y}[outv];` +
      `[0:a]volume=1.0[a0];[1:a]volume=${vol}[a1];[a0][a1]amix=inputs=2:duration=first[outa]`;
    const transformed =
      (await ffmpegTransform(
        mainVideo,
        [
          "-filter_complex",
          filterWithAudio,
          "-map",
          "[outv]",
          "-map",
          "[outa]"
        ],
        {
          extraInputs: [{ suffix: ".mp4", bytes: overlayVideo }],
          allowFallback: true
        }
      )) ??
      // Fallback: video-only overlay (one or both inputs may lack audio).
      // Terminal attempt — throws with stderr if it also fails.
      (await ffmpegTransform(
        mainVideo,
        [
          "-filter_complex",
          `[1:v]scale=iw*${scale}:ih*${scale}[ov];[0:v][ov]overlay=${x}:${y}`
        ],
        { extraInputs: [{ suffix: ".mp4", bytes: overlayVideo }] }
      ));
    return { output: videoRef(transformed) };
  }
}

export class ColorBalanceVideoNode extends VideoTransformNode {
  static readonly nodeType = "nodetool.video.ColorBalance";
  static readonly title = "Color Balance";
  static readonly description =
    "Adjust the color balance of a video.\n    video, color, balance, adjustment";
  static readonly metadataOutputTypes = {
    output: "video"
  };
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video, context);
    // Props are 0-2 range where 1.0 = neutral; colorbalance expects -1 to 1
    const rs = Number(this.red_adjust ?? 1) - 1;
    const gs = Number(this.green_adjust ?? 1) - 1;
    const bs = Number(this.blue_adjust ?? 1) - 1;
    const transformed =
      (await ffmpegTransform(bytes, [
        "-vf",
        `colorbalance=rs=${rs}:gs=${gs}:bs=${bs}`,
        "-c:a",
        "copy"
      ]));
    return { output: videoRef(transformed) };
  }
}

export class DenoiseVideoNode extends VideoTransformNode {
  static readonly nodeType = "nodetool.video.Denoise";
  static readonly title = "Denoise";
  static readonly description =
    "Apply noise reduction to a video.\n    video, denoise, clean, enhance";
  static readonly metadataOutputTypes = {
    output: "video"
  };

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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video, context);
    const strength = Number(this.strength ?? 5);
    const transformed =
      (await ffmpegTransform(bytes, [
        "-vf",
        `nlmeans=s=${strength}`,
        "-c:a",
        "copy"
      ]));
    return { output: videoRef(transformed) };
  }
}

export class StabilizeVideoNode extends VideoTransformNode {
  static readonly nodeType = "nodetool.video.Stabilize";
  static readonly title = "Stabilize";
  static readonly description =
    "Apply video stabilization to reduce camera shake and jitter.\n    video, stabilize, smooth, shake-reduction";
  static readonly metadataOutputTypes = {
    output: "video"
  };

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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video, context);
    if (bytes.length === 0) return { output: videoRef(bytes) };
    const smoothing = Math.max(1, Number(this.smoothing ?? 10));
    const cropBlack = Boolean(this.crop_black ?? true);

    const deshake = `deshake=smooth=${smoothing}`;

    if (!cropBlack) {
      const transformed = await ffmpegTransform(bytes, [
        "-vf",
        deshake,
        "-c:a",
        "copy"
      ]);
      return { output: videoRef(transformed) };
    }

    // Pass 1: run deshake + cropdetect to the null muxer and read cropdetect's
    // suggested crop from stderr (a bare `crop` filter defaults to the full
    // frame and removes nothing — cropdetect only logs, it never crops).
    const probe = await withTempFile(".mp4", bytes);
    let crop: string | null = null;
    try {
      const { stderr } = await execFfmpeg(
        [
          "-y",
          "-i",
          probe.path,
          "-vf",
          `${deshake},cropdetect=24:16:0`,
          "-f",
          "null",
          "-"
        ],
        { maxBuffer: FFMPEG_MAX_BUFFER }
      );
      crop = parseCropDetectCrop(stderr);
    } finally {
      await probe.cleanup();
    }

    // Pass 2: apply the detected crop, or deshake alone when none was found.
    const vf = crop ? `${deshake},crop=${crop}` : deshake;
    const transformed = await ffmpegTransform(bytes, [
      "-vf",
      vf,
      "-c:a",
      "copy"
    ]);
    return { output: videoRef(transformed) };
  }
}

export class SharpnessVideoNode extends VideoTransformNode {
  static readonly nodeType = "nodetool.video.Sharpness";
  static readonly title = "Sharpness";
  static readonly description =
    "Adjust the sharpness of a video.\n    video, sharpen, enhance, detail";
  static readonly metadataOutputTypes = {
    output: "video"
  };

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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video, context);
    const lumaAmount = Number(this.luma_amount ?? 1);
    const chromaAmount = Number(this.chroma_amount ?? 0.5);
    const transformed =
      (await ffmpegTransform(bytes, [
        "-vf",
        `unsharp=5:5:${lumaAmount}:5:5:${chromaAmount}`,
        "-c:a",
        "copy"
      ]));
    return { output: videoRef(transformed) };
  }
}

export class BlurVideoNode extends VideoTransformNode {
  static readonly nodeType = "nodetool.video.Blur";
  static readonly title = "Blur";
  static readonly description =
    "Apply a blur effect to a video.\n    video, blur, smooth, soften";
  static readonly metadataOutputTypes = {
    output: "video"
  };
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video, context);
    const radius = Number(this.strength ?? 5);
    if (radius <= 0) return { output: videoRef(bytes) };
    const transformed =
      (await ffmpegTransform(bytes, [
        "-vf",
        `boxblur=${radius}:${radius}`,
        "-c:a",
        "copy"
      ]));
    return { output: videoRef(transformed) };
  }
}

export class SaturationVideoNode extends VideoTransformNode {
  static readonly nodeType = "nodetool.video.Saturation";
  static readonly title = "Saturation";
  static readonly description =
    "Adjust the color saturation of a video.\n    video, saturation, color, enhance";
  static readonly metadataOutputTypes = {
    output: "video"
  };
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video, context);
    const saturation = Number(this.saturation ?? 1);
    const transformed =
      (await ffmpegTransform(bytes, [
        "-vf",
        `eq=saturation=${saturation}`,
        "-c:a",
        "copy"
      ]));
    return { output: videoRef(transformed) };
  }
}

export class AddSubtitlesVideoNode extends VideoTransformNode {
  static readonly nodeType = "nodetool.video.AddSubtitles";
  static readonly title = "Add Subtitles";
  static readonly description =
    "Add subtitles to a video.\n    video, subtitles, text, caption";
  static readonly metadataOutputTypes = {
    output: "video"
  };
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
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
      const transformed = await ffmpegTransform(bytes, [
        "-vf",
        vf,
        "-c:a",
        "copy"
      ]);
      return { output: videoRef(transformed) };
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  }
}

export class ReverseVideoNode extends VideoTransformNode {
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video, context);
    if (bytes.length === 0) return { output: videoRef(bytes) };

    // Reverse audio+video first (fails without an audio stream); the video-only
    // fallback is terminal and throws on failure.
    const transformed =
      (await ffmpegTransform(bytes, ["-vf", "reverse", "-af", "areverse"], {
        allowFallback: true
      })) ?? (await ffmpegTransform(bytes, ["-vf", "reverse"]));
    return { output: videoRef(transformed) };
  }
}

export class TransitionVideoNode extends VideoTransformNode {
  static readonly nodeType = "nodetool.video.Transition";
  static readonly title = "Transition";
  static readonly description =
    "Create a transition effect between two videos, including audio transition when available.\n    video, transition, effect, merge, audio";
  static readonly metadataOutputTypes = {
    output: "video"
  };
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
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
      const aDuration = await ffprobeDuration(tempA.path);
      offsetVal = Math.max(0, aDuration - duration);
    } finally {
      await tempA.cleanup();
    }

    // Try with audio crossfade first, then fall back to video-only
    const filterWithAudio =
      `[0:v][1:v]xfade=transition=${transitionType}:duration=${duration}:offset=${offsetVal}[outv];` +
      `[0:a][1:a]acrossfade=d=${duration}[outa]`;
    const transformed =
      (await ffmpegTransform(
        a,
        [
          "-filter_complex",
          filterWithAudio,
          "-map",
          "[outv]",
          "-map",
          "[outa]"
        ],
        { extraInputs: [{ suffix: ".mp4", bytes: b }], allowFallback: true }
      )) ??
      // Fallback: video-only xfade (inputs may lack audio). Terminal attempt —
      // throws with stderr if it also fails.
      (await ffmpegTransform(
        a,
        [
          "-filter_complex",
          `[0:v][1:v]xfade=transition=${transitionType}:duration=${duration}:offset=${offsetVal}`
        ],
        { extraInputs: [{ suffix: ".mp4", bytes: b }] }
      ));
    return { output: videoRef(transformed) };
  }
}

export class AddAudioVideoNode extends VideoTransformNode {
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const v = await videoBytesAsync(this.video, context);
    const a = await audioBytesAsync(this.audio, context);
    if (v.length === 0) return { output: videoRef(v) };
    if (a.length === 0) return { output: videoRef(v) };

    const videoInput = await withTempFile(".mp4", v);
    const audioInput = await withTempFile(".wav", a);
    const outputDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "nodetool-addaudio-out-")
    );
    const outputPath = path.join(outputDir, "output.mp4");
    try {
      const volume = Math.max(0, Number(this.volume ?? 1));
      const mix = Boolean(this.mix);

      const buildArgs = (useMix: boolean): string[] => {
        const args: string[] = [
          "-y",
          "-i", videoInput.path,
          "-i", audioInput.path
        ];
        if (useMix) {
          args.push(
            "-filter_complex",
            `[1:a]volume=${volume}[newaud];[0:a][newaud]amix=inputs=2:duration=first[aout]`,
            "-map", "0:v:0",
            "-map", "[aout]",
            "-c:v", "copy"
          );
        } else if (volume !== 1) {
          args.push(
            "-filter_complex", `[1:a]volume=${volume}[aout]`,
            "-map", "0:v:0",
            "-map", "[aout]",
            "-c:v", "copy",
            "-c:a", "aac"
          );
        } else {
          args.push(
            "-map", "0:v:0",
            "-map", "1:a:0",
            "-c:v", "copy",
            "-c:a", "aac"
          );
        }
        args.push(outputPath);
        return args;
      };

      try {
        await execFfmpeg(buildArgs(mix), { maxBuffer: FFMPEG_MAX_BUFFER });
      } catch (error) {
        if (error instanceof MissingBinaryError) throw error;
        // Mixing requires an existing audio stream ([0:a]); videos without one
        // make ffmpeg fail. Fall back to plain replacement — the terminal
        // attempt, which throws (with stderr) if it also fails.
        if (!mix) throw error;
        await execFfmpeg(buildArgs(false), { maxBuffer: FFMPEG_MAX_BUFFER });
      }
      const result = new Uint8Array(await fs.readFile(outputPath));
      return { output: videoRef(result) };
    } finally {
      await videoInput.cleanup();
      await audioInput.cleanup();
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  }
}

export class ChromaKeyVideoNode extends VideoTransformNode {
  static readonly nodeType = "nodetool.video.ChromaKey";
  static readonly title = "Chroma Key";
  static readonly description =
    "Apply chroma key (green screen) effect to a video. The MP4 output has no alpha channel, so the keyed-out area renders black — composite it over a background with the Overlay node.\n    video, chroma key, green screen, compositing";
  static readonly metadataOutputTypes = {
    output: "video"
  };
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video, context);
    const keyColorObj = this.key_color as { value?: string } | undefined;
    const color = String(keyColorObj?.value ?? "#00FF00").replace("#", "0x");
    const similarity = Number(this.similarity ?? 0.3);
    const blend = Number(this.blend ?? 0.1);
    const transformed =
      (await ffmpegTransform(bytes, [
        "-vf",
        `colorkey=${color}:${similarity}:${blend}`,
        "-c:a",
        "copy"
      ]));
    return { output: videoRef(transformed) };
  }
}

export class ExtractAudioVideoNode extends VideoTransformNode {
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
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
      await execFfmpeg(
        ["-y", "-i", input.path, "-vn", "-acodec", "pcm_s16le", outputPath],
        { maxBuffer: FFMPEG_MAX_BUFFER }
      );
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

export class ExtractFrameVideoNode extends VideoTransformNode {
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video, context);
    if (bytes.length === 0) {
      return { output: { type: "image", data: null } };
    }

    const inputFile = await withTempFile(".mp4", bytes);
    const outputDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "nodetool-extract-frame-")
    );
    const outputPath = path.join(outputDir, "frame.png");
    try {
      const time = Math.max(0, Number(this.time ?? 0));
      await execFfmpeg(
        [
          "-y",
          "-ss", String(time),
          "-i", inputFile.path,
          "-frames:v", "1",
          "-f", "image2",
          outputPath
        ],
        { maxBuffer: 10 * 1024 * 1024 }
      );
      const frameData = new Uint8Array(await fs.readFile(outputPath));
      return {
        output: {
          type: "image",
          data: Buffer.from(frameData).toString("base64")
        }
      };
    } catch (error) {
      // A missing binary is unrecoverable — surface it. A genuine decode
      // failure (e.g. seeking past the end) yields an empty frame.
      if (error instanceof MissingBinaryError) throw error;
      return { output: { type: "image", data: null } };
    } finally {
      await inputFile.cleanup();
      await fs.rm(outputDir, { recursive: true, force: true });
    }
  }
}

export class GetVideoInfoNode extends VideoTransformNode {
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
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
      const { stdout } = await execFfprobe([
        "-v", "error",
        "-show_streams",
        "-show_format",
        "-of", "json",
        inputFile.path
      ]);
      const info = JSON.parse(stdout) as {
        streams?: Array<{
          codec_type?: string;
          codec_name?: string;
          width?: number;
          height?: number;
          r_frame_rate?: string;
          nb_frames?: string;
        }>;
        format?: {
          duration?: string;
        };
      };

      const videoStream = (info.streams ?? []).find(
        (s) => s.codec_type === "video"
      );
      const hasAudio = (info.streams ?? []).some(
        (s) => s.codec_type === "audio"
      );

      const fps = videoStream?.r_frame_rate
        ? parseFrameRate(videoStream.r_frame_rate)
        : 0;

      const duration = Number(info.format?.duration ?? 0) || 0;
      const frameCount = videoStream?.nb_frames
        ? Number(videoStream.nb_frames) || 0
        : Math.round(duration * fps);

      return {
        duration,
        width: videoStream?.width ?? 0,
        height: videoStream?.height ?? 0,
        fps,
        frame_count: frameCount,
        codec: videoStream?.codec_name ?? "",
        has_audio: hasAudio
      };
    } catch (error) {
      // Missing ffprobe is actionable; a genuine probe failure on corrupt
      // input degrades to the empty info result.
      if (error instanceof MissingBinaryError) throw error;
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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
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
        prompt: String(this.prompt ?? ""),
        negative_prompt: this.negative_prompt,
        strength: Number(this.strength ?? 0.6)
      }
    }),
      "Video To Video"
    );
    return { output: videoRef(output) };
  }
}

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

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
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
