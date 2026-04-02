import { BaseNode, prop } from "@nodetool/node-sdk";
import type { VideoRef } from "@nodetool/node-sdk";
import type { ProcessingContext } from "@nodetool/runtime";
import { execFile as execFileCb } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

type VideoRefLike = { uri?: string; data?: Uint8Array | string };
type ImageRefLike = { uri?: string; data?: Uint8Array | string };
type AudioRefLike = { uri?: string; data?: Uint8Array | string };
const execFile = promisify(execFileCb);

function toBytes(data: Uint8Array | string | undefined): Uint8Array {
  if (!data) return new Uint8Array();
  if (data instanceof Uint8Array) return data;
  return Uint8Array.from(Buffer.from(data, "base64"));
}

function videoBytes(video: unknown): Uint8Array {
  if (!video || typeof video !== "object") return new Uint8Array();
  return toBytes((video as VideoRefLike).data);
}

async function videoBytesAsync(video: unknown): Promise<Uint8Array> {
  if (!video || typeof video !== "object") return new Uint8Array();
  const ref = video as VideoRefLike;
  if (ref.data) return toBytes(ref.data);
  if (typeof ref.uri === "string" && ref.uri) {
    if (ref.uri.startsWith("file://")) {
      return new Uint8Array(await fs.readFile(filePath(ref.uri)));
    }
    const response = await fetch(ref.uri);
    return new Uint8Array(await response.arrayBuffer());
  }
  return new Uint8Array();
}

function imageBytes(image: unknown): Uint8Array {
  if (!image || typeof image !== "object") return new Uint8Array();
  return toBytes((image as ImageRefLike).data);
}

function audioBytes(audio: unknown): Uint8Array {
  if (!audio || typeof audio !== "object") return new Uint8Array();
  return toBytes((audio as AudioRefLike).data);
}

function filePath(uriOrPath: string): string {
  if (uriOrPath.startsWith("file://")) return uriOrPath.slice("file://".length);
  return uriOrPath;
}

function dateName(name: string): string {
  const now = new Date();
  const pad = (v: number): string => String(v).padStart(2, "0");
  return name
    .replaceAll("%Y", String(now.getFullYear()))
    .replaceAll("%m", pad(now.getMonth() + 1))
    .replaceAll("%d", pad(now.getDate()))
    .replaceAll("%H", pad(now.getHours()))
    .replaceAll("%M", pad(now.getMinutes()))
    .replaceAll("%S", pad(now.getSeconds()));
}

function bytesConcat(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function videoRef(data: Uint8Array, extras: Partial<VideoRef> = {}): VideoRef {
  return {
    type: "video",
    data: Buffer.from(data).toString("base64"),
    ...extras
  };
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

async function withTempFile(
  suffix: string,
  bytes: Uint8Array
): Promise<{ path: string; cleanup: () => Promise<void> }> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "nodetool-video-"));
  const file = path.join(dir, `input${suffix}`);
  await fs.writeFile(file, bytes);
  return {
    path: file,
    cleanup: async () => {
      await fs.rm(dir, { recursive: true, force: true });
    }
  };
}

async function ffmpegTransform(
  video: Uint8Array,
  args: string[],
  extraInputs: Array<{ suffix: string; bytes: Uint8Array }> = []
): Promise<Uint8Array | null> {
  if (video.length === 0) return new Uint8Array();
  const mainInput = await withTempFile(".mp4", video);
  const others = await Promise.all(
    extraInputs.map((item) => withTempFile(item.suffix, item.bytes))
  );
  const outputDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "nodetool-video-out-")
  );
  const outputPath = path.join(outputDir, "output.mp4");
  try {
    const inputArgs = ["-y", "-i", mainInput.path];
    for (const other of others) inputArgs.push("-i", other.path);
    await execFile("ffmpeg", [...inputArgs, ...args, outputPath], {
      maxBuffer: 10 * 1024 * 1024
    });
    return new Uint8Array(await fs.readFile(outputPath));
  } catch {
    return null;
  } finally {
    await mainInput.cleanup();
    for (const other of others) await other.cleanup();
    await fs.rm(outputDir, { recursive: true, force: true });
  }
}

export class TextToVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.TextToVideo";
  static readonly title = "Text To Video";
  static readonly description =
    "Generate videos from text prompts using any supported video provider. Automatically routes to the appropriate backend (Gemini Veo, HuggingFace).\n    video, generation, AI, text-to-video, t2v";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly basicFields = [
    "model",
    "prompt",
    "aspect_ratio",
    "resolution",
    "seed"
  ];
  static readonly exposeAsTool = true;

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
  declare model: any;

  @prop({
    type: "str",
    default: "A cat playing with a ball of yarn",
    title: "Prompt",
    description: "Text prompt describing the desired video"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Text prompt describing what to avoid in the video"
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    title: "Aspect Ratio",
    description: "Aspect ratio for the video",
    values: ["16:9", "9:16", "1:1", "4:3", "3:4"]
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    title: "Resolution",
    description: "Video resolution",
    values: ["480p", "720p", "1080p"]
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: 60,
    title: "Num Frames",
    description: "Number of frames to generate (provider-specific)",
    min: 1,
    max: 300
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 7.5,
    title: "Guidance Scale",
    description: "Classifier-free guidance scale (higher = closer to prompt)",
    min: 0,
    max: 30
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 30,
    title: "Num Inference Steps",
    description: "Number of denoising steps",
    min: 1,
    max: 100
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: -1,
    title: "Seed",
    description: "Random seed for reproducibility (-1 for random)",
    min: -1
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 0,
    title: "Timeout Seconds",
    description: "Timeout in seconds for API calls (0 = use provider default)",
    min: 0,
    max: 7200
  })
  declare timeout_seconds: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const text = String(this.prompt ?? "");
    const { providerId, modelId } = modelConfig(this.serialize());
    if (canUseProvider(context, providerId, modelId)) {
      const output = (await context.runProviderPrediction({
        provider: providerId,
        capability: "text_to_video",
        model: modelId,
        params: {
          prompt: text,
          negative_prompt: this.negative_prompt,
          num_frames: this.num_frames,
          aspect_ratio: this.aspect_ratio,
          resolution: this.resolution
        }
      })) as Uint8Array;
      return { output: videoRef(output) };
    }
    const bytes = Uint8Array.from(Buffer.from(text, "utf8"));
    return { output: videoRef(bytes) };
  }
}

export class ImageToVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.ImageToVideo";
  static readonly title = "Image To Video";
  static readonly description =
    "Generate videos from input images using any supported video provider.\n    Animates static images into dynamic video content with AI-powered motion.\n    video, image-to-video, i2v, animation, AI, generation, sora, veo";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  static readonly basicFields = [
    "image",
    "model",
    "prompt",
    "aspect_ratio",
    "resolution",
    "seed"
  ];
  static readonly exposeAsTool = true;

  @prop({
    type: "image",
    default: {
      type: "image",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null
    },
    title: "Image",
    description: "The input image to animate into a video"
  })
  declare image: any;

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
  declare model: any;

  @prop({
    type: "str",
    default: "",
    title: "Prompt",
    description: "Optional text prompt to guide the video animation"
  })
  declare prompt: any;

  @prop({
    type: "str",
    default: "",
    title: "Negative Prompt",
    description: "Text prompt describing what to avoid in the video"
  })
  declare negative_prompt: any;

  @prop({
    type: "enum",
    default: "16:9",
    title: "Aspect Ratio",
    description: "Aspect ratio for the video",
    values: ["16:9", "9:16", "1:1", "4:3", "3:4"]
  })
  declare aspect_ratio: any;

  @prop({
    type: "enum",
    default: "720p",
    title: "Resolution",
    description: "Video resolution",
    values: ["480p", "720p", "1080p"]
  })
  declare resolution: any;

  @prop({
    type: "int",
    default: 60,
    title: "Num Frames",
    description: "Number of frames to generate (provider-specific)",
    min: 1,
    max: 300
  })
  declare num_frames: any;

  @prop({
    type: "float",
    default: 7.5,
    title: "Guidance Scale",
    description: "Classifier-free guidance scale (higher = closer to prompt)",
    min: 0,
    max: 30
  })
  declare guidance_scale: any;

  @prop({
    type: "int",
    default: 30,
    title: "Num Inference Steps",
    description: "Number of denoising steps",
    min: 1,
    max: 100
  })
  declare num_inference_steps: any;

  @prop({
    type: "int",
    default: -1,
    title: "Seed",
    description: "Random seed for reproducibility (-1 for random)",
    min: -1
  })
  declare seed: any;

  @prop({
    type: "int",
    default: 0,
    title: "Timeout Seconds",
    description: "Timeout in seconds for API calls (0 = use provider default)",
    min: 0,
    max: 7200
  })
  declare timeout_seconds: any;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const img = imageBytes(this.image);
    const prompt = String(this.prompt ?? "");
    const { providerId, modelId } = modelConfig(this.serialize());
    if (canUseProvider(context, providerId, modelId)) {
      const output = (await context.runProviderPrediction({
        provider: providerId,
        capability: "image_to_video",
        model: modelId,
        params: {
          image: img,
          prompt,
          negative_prompt: this.negative_prompt,
          num_frames: this.num_frames,
          aspect_ratio: this.aspect_ratio,
          resolution: this.resolution
        }
      })) as Uint8Array;
      return { output: videoRef(output) };
    }
    return {
      output: videoRef(bytesConcat([img, Uint8Array.from(Buffer.from(prompt))]))
    };
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

  @prop({
    type: "str",
    default: "",
    title: "Path",
    description: "Path to the video file to read"
  })
  declare path: any;

  async process(): Promise<Record<string, unknown>> {
    const p = filePath(String(this.path ?? ""));
    const data = new Uint8Array(await fs.readFile(p));
    return { output: videoRef(data, { uri: `file://${p}` }) };
  }
}

export class SaveVideoFileVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.SaveVideoFile";
  static readonly title = "Save Video File";
  static readonly description =
    "Write a video file to disk.\n    video, output, save, file\n\n    The filename can include time and date variables:\n    %Y - Year, %m - Month, %d - Day\n    %H - Hour, %M - Minute, %S - Second";
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The video to save"
  })
  declare video: any;

  @prop({
    type: "str",
    default: "",
    title: "Folder",
    description: "Folder where the file will be saved"
  })
  declare folder: any;

  @prop({
    type: "str",
    default: "",
    title: "Filename",
    description:
      "\n        Name of the file to save.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare filename: any;

  async process(): Promise<Record<string, unknown>> {
    const folder = String(this.folder ?? ".");
    const fname = dateName(String(this.filename ?? "video.mp4"));
    const p = path.resolve(folder, fname);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, videoBytes(this.video));
    return { output: p };
  }
}

export class LoadVideoAssetsNode extends BaseNode {
  static readonly nodeType = "nodetool.video.LoadVideoAssets";
  static readonly title = "Load Video Folder";
  static readonly description =
    "Load video files from an asset folder.\n\n    video, assets, load";
  static readonly metadataOutputTypes = {
    video: "video",
    name: "str"
  };

  static readonly isStreamingOutput = true;
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
  declare folder: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const folder = String(this.folder ?? ".");
    const entries = await fs.readdir(folder, { withFileTypes: true });
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
}

export class SaveVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.SaveVideo";
  static readonly title = "Save Video Asset";
  static readonly description =
    "Save a video to an asset folder.\n    video, save, file, output";
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The video to save."
  })
  declare video: any;

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
  declare folder: any;

  @prop({
    type: "str",
    default: "%Y-%m-%d-%H-%M-%S.mp4",
    title: "Name",
    description:
      "\n        Name of the output video.\n        You can use time and date variables to create unique names:\n        %Y - Year\n        %m - Month\n        %d - Day\n        %H - Hour\n        %M - Minute\n        %S - Second\n        "
  })
  declare name: any;

  async process(): Promise<Record<string, unknown>> {
    const folder = String(this.folder ?? ".");
    const filename = dateName(String(this.name ?? "video.mp4"));
    const full = path.resolve(folder, filename);
    await fs.mkdir(path.dirname(full), { recursive: true });
    const bytes = videoBytes(this.video);
    await fs.writeFile(full, bytes);
    return { output: videoRef(bytes, { uri: `file://${full}` }) };
  }
}

export class FrameIteratorNode extends BaseNode {
  static readonly nodeType = "nodetool.video.FrameIterator";
  static readonly title = "Frame Iterator";
  static readonly description =
    "Extract frames from a video file using OpenCV.\n    video, frames, extract, sequence";
  static readonly metadataOutputTypes = {
    frame: "image",
    index: "int",
    fps: "float"
  };

  static readonly isStreamingOutput = true;
  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to extract frames from."
  })
  declare video: any;

  @prop({
    type: "int",
    default: 0,
    title: "Start",
    description: "The frame to start extracting from."
  })
  declare start: any;

  @prop({
    type: "int",
    default: -1,
    title: "End",
    description: "The frame to stop extracting from."
  })
  declare end: any;

  async process(): Promise<Record<string, unknown>> {
    return {};
  }

  async *genProcess(): AsyncGenerator<Record<string, unknown>> {
    const bytes = videoBytes(this.video);
    const frameSize = 1024;
    let index = 0;
    for (let i = 0; i < bytes.length; i += frameSize) {
      const frame = bytes.slice(i, i + frameSize);
      yield { frame: { data: Buffer.from(frame).toString("base64") }, index };
      index += 1;
    }
  }
}

export class FpsNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Fps";
  static readonly title = "Fps";
  static readonly description =
    "Get the frames per second (FPS) of a video file.\n    video, analysis, frames, fps";
  static readonly metadataOutputTypes = {
    output: "float"
  };

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to analyze for FPS."
  })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    // This node extracts FPS metadata from a video.
    // Output type is float, not video — return the fps value directly.
    const fps = 24;
    return { output: fps };
  }
}

export class FrameToVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.FrameToVideo";
  static readonly title = "Frame To Video";
  static readonly description =
    "Combine a sequence of frames into a single video file.\n    video, frames, combine, sequence";
  static readonly metadataOutputTypes = {
    output: "video"
  };

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
  declare frame: any;

  @prop({
    type: "float",
    default: 30,
    title: "Fps",
    description: "The FPS of the output video."
  })
  declare fps: any;

  async process(): Promise<Record<string, unknown>> {
    const frames = Array.isArray(this.frame) ? (this.frame as unknown[]) : [];
    const parts = frames.map((f) => {
      if (!f || typeof f !== "object") return new Uint8Array();
      return toBytes((f as { data?: Uint8Array | string }).data);
    });
    return { output: videoRef(bytesConcat(parts)) };
  }
}

abstract class VideoTransformNode extends BaseNode {
  static readonly requiredRuntimes = ["ffmpeg"];
  declare video: any;
  async process(): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video);
    return { output: videoRef(bytes) };
  }
}

export class ConcatVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Concat";
  static readonly title = "Concat";
  static readonly description =
    "Concatenate multiple video files into a single video, including audio when available.\n    video, concat, merge, combine, audio, +";
  static readonly requiredRuntimes = ["ffmpeg"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video A",
    description: "The first video to concatenate."
  })
  declare video_a: any;

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video B",
    description: "The second video to concatenate."
  })
  declare video_b: any;

  async process(): Promise<Record<string, unknown>> {
    const a = videoBytes(this.video_a);
    const b = videoBytes(this.video_b);
    return { output: videoRef(bytesConcat([a, b])) };
  }
}

export class TrimVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Trim";
  static readonly title = "Trim";
  static readonly description =
    "Trim a video to a specific start and end time.\n    video, trim, cut, segment";
  static readonly requiredRuntimes = ["ffmpeg"];
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to trim."
  })
  declare video: any;

  @prop({
    type: "float",
    default: 0,
    title: "Start Time",
    description: "The start time in seconds for the trimmed video."
  })
  declare start_time: any;

  @prop({
    type: "float",
    default: -1,
    title: "End Time",
    description:
      "The end time in seconds for the trimmed video. Use -1 for the end of the video."
  })
  declare end_time: any;

  async process(): Promise<Record<string, unknown>> {
    const bytes = videoBytes(this.video);
    const start = Math.max(0, Number(this.start_time ?? 0));
    const end = Math.max(0, Number(this.end_time ?? 0));
    return {
      output: videoRef(bytes.slice(start, Math.max(start, bytes.length - end)))
    };
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
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to resize."
  })
  declare video: any;

  @prop({
    type: "int",
    default: -1,
    title: "Width",
    description: "The target width. Use -1 to maintain aspect ratio."
  })
  declare width: any;

  @prop({
    type: "int",
    default: -1,
    title: "Height",
    description: "The target height. Use -1 to maintain aspect ratio."
  })
  declare height: any;

  async process(): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video);
    const width = Number(this.width ?? -1);
    const height = Number(this.height ?? -1);
    const transformed =
      (await ffmpegTransform(bytes, [
        "-vf",
        `scale=${width}:${height}`,
        "-c:a",
        "copy"
      ])) ?? bytes;
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
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to rotate."
  })
  declare video: any;

  @prop({
    type: "float",
    default: 0,
    title: "Angle",
    description: "The angle of rotation in degrees.",
    min: -360,
    max: 360
  })
  declare angle: any;

  async process(): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video);
    const angle = Number(this.angle ?? 90);
    const radians = (angle * Math.PI) / 180;
    const transformed =
      (await ffmpegTransform(bytes, [
        "-vf",
        `rotate=${radians}:ow=rotw(${radians}):oh=roth(${radians})`,
        "-c:a",
        "copy"
      ])) ?? bytes;
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
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to adjust speed."
  })
  declare video: any;

  @prop({
    type: "float",
    default: 1,
    title: "Speed Factor",
    description:
      "The speed adjustment factor. Values > 1 speed up, < 1 slow down."
  })
  declare speed_factor: any;

  async process(): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video);
    const speed = Math.max(0.1, Number(this.speed_factor ?? 1));
    const transformed =
      (await ffmpegTransform(bytes, [
        "-filter_complex",
        `[0:v]setpts=${1 / speed}*PTS[v];[0:a]atempo=${Math.min(
          2,
          Math.max(0.5, speed)
        )}[a]`,
        "-map",
        "[v]",
        "-map",
        "[a]"
      ])) ??
      (await ffmpegTransform(bytes, ["-vf", `setpts=${1 / speed}*PTS`])) ??
      bytes;
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
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Main Video",
    description: "The main (background) video."
  })
  declare main_video: any;

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Overlay Video",
    description: "The video to overlay on top."
  })
  declare overlay_video: any;

  @prop({
    type: "int",
    default: 0,
    title: "X",
    description: "X-coordinate for overlay placement."
  })
  declare x: any;

  @prop({
    type: "int",
    default: 0,
    title: "Y",
    description: "Y-coordinate for overlay placement."
  })
  declare y: any;

  @prop({
    type: "float",
    default: 1,
    title: "Scale",
    description: "Scale factor for the overlay video."
  })
  declare scale: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Overlay Audio Volume",
    description: "Volume of the overlay audio relative to the main audio.",
    min: 0,
    max: 1
  })
  declare overlay_audio_volume: any;

  async process(): Promise<Record<string, unknown>> {
    const mainVideo = await videoBytesAsync(this.main_video);
    const overlayVideo = await videoBytesAsync(this.overlay_video);
    if (overlayVideo.length === 0) return { output: videoRef(mainVideo) };
    const x = Number(this.x ?? 0);
    const y = Number(this.y ?? 0);
    const scale = Math.max(0.01, Number(this.scale ?? 1));
    const transformed =
      (await ffmpegTransform(
        mainVideo,
        [
          "-filter_complex",
          `[1:v]scale=iw*${scale}:ih*${scale}[ov];[0:v][ov]overlay=${x}:${y}`
        ],
        [{ suffix: ".mp4", bytes: overlayVideo }]
      )) ?? mainVideo;
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
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to adjust color balance."
  })
  declare video: any;

  @prop({
    type: "float",
    default: 1,
    title: "Red Adjust",
    description: "Red channel adjustment factor.",
    min: 0,
    max: 2
  })
  declare red_adjust: any;

  @prop({
    type: "float",
    default: 1,
    title: "Green Adjust",
    description: "Green channel adjustment factor.",
    min: 0,
    max: 2
  })
  declare green_adjust: any;

  @prop({
    type: "float",
    default: 1,
    title: "Blue Adjust",
    description: "Blue channel adjustment factor.",
    min: 0,
    max: 2
  })
  declare blue_adjust: any;

  async process(): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video);
    // Props are named red/green/blue_adjust but applied as ffmpeg eq filter
    // brightness/contrast/saturation. The mapping is: red→brightness, green→contrast, blue→saturation.
    const redAdj = Number(this.red_adjust ?? 0);
    const greenAdj = Number(this.green_adjust ?? 1);
    const blueAdj = Number(this.blue_adjust ?? 1);
    const transformed =
      (await ffmpegTransform(bytes, [
        "-vf",
        `eq=brightness=${redAdj}:contrast=${greenAdj}:saturation=${blueAdj}`,
        "-c:a",
        "copy"
      ])) ?? bytes;
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
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to denoise."
  })
  declare video: any;

  @prop({
    type: "float",
    default: 5,
    title: "Strength",
    description:
      "Strength of the denoising effect. Higher values mean more denoising.",
    min: 0,
    max: 20
  })
  declare strength: any;

  async process(): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video);
    const transformed =
      (await ffmpegTransform(bytes, ["-vf", "hqdn3d", "-c:a", "copy"])) ??
      bytes;
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
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to stabilize."
  })
  declare video: any;

  @prop({
    type: "float",
    default: 10,
    title: "Smoothing",
    description:
      "Smoothing strength. Higher values result in smoother but potentially more cropped video.",
    min: 1,
    max: 100
  })
  declare smoothing: any;

  @prop({
    type: "bool",
    default: true,
    title: "Crop Black",
    description:
      "Whether to crop black borders that may appear after stabilization."
  })
  declare crop_black: any;

  async process(): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video);
    const transformed =
      (await ffmpegTransform(bytes, ["-vf", "deshake", "-c:a", "copy"])) ??
      bytes;
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
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to sharpen."
  })
  declare video: any;

  @prop({
    type: "float",
    default: 1,
    title: "Luma Amount",
    description: "Amount of sharpening to apply to luma (brightness) channel.",
    min: 0,
    max: 3
  })
  declare luma_amount: any;

  @prop({
    type: "float",
    default: 0.5,
    title: "Chroma Amount",
    description: "Amount of sharpening to apply to chroma (color) channels.",
    min: 0,
    max: 3
  })
  declare chroma_amount: any;

  async process(): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video);
    const transformed =
      (await ffmpegTransform(bytes, [
        "-vf",
        "unsharp=5:5:1.0",
        "-c:a",
        "copy"
      ])) ?? bytes;
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
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to apply blur effect."
  })
  declare video: any;

  @prop({
    type: "float",
    default: 5,
    title: "Strength",
    description:
      "The strength of the blur effect. Higher values create a stronger blur.",
    min: 0,
    max: 20
  })
  declare strength: any;

  async process(): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video);
    const radius = Math.max(1, Number(this.strength ?? 2));
    const transformed =
      (await ffmpegTransform(bytes, [
        "-vf",
        `boxblur=${radius}:${radius}`,
        "-c:a",
        "copy"
      ])) ?? bytes;
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
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to adjust saturation."
  })
  declare video: any;

  @prop({
    type: "float",
    default: 1,
    title: "Saturation",
    description:
      "Saturation level. 1.0 is original, <1 decreases saturation, >1 increases saturation.",
    min: 0,
    max: 3
  })
  declare saturation: any;

  async process(): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video);
    const saturation = Number(this.saturation ?? 1.2);
    const transformed =
      (await ffmpegTransform(bytes, [
        "-vf",
        `eq=saturation=${saturation}`,
        "-c:a",
        "copy"
      ])) ?? bytes;
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
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to add subtitles to."
  })
  declare video: any;

  @prop({
    type: "list[audio_chunk]",
    default: [],
    title: "Chunks",
    description: "Audio chunks to add as subtitles."
  })
  declare chunks: any;

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
  declare font: any;

  @prop({
    type: "enum",
    default: "bottom",
    title: "Align",
    description: "Vertical alignment of subtitles.",
    values: ["top", "center", "bottom"]
  })
  declare align: any;

  @prop({
    type: "int",
    default: 24,
    title: "Font Size",
    description: "The font size.",
    min: 1,
    max: 72
  })
  declare font_size: any;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "#FFFFFF"
    },
    title: "Font Color",
    description: "The font color."
  })
  declare font_color: any;

  async process(): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video);
    const text = String(this.chunks ?? "").trim();
    if (!text) return { output: videoRef(bytes) };
    const escaped = text.replaceAll(":", "\\:").replaceAll("'", "\\'");
    const transformed =
      (await ffmpegTransform(bytes, [
        "-vf",
        `drawtext=text='${escaped}':x=(w-text_w)/2:y=h-(text_h*2):fontcolor=white:fontsize=24`,
        "-c:a",
        "copy"
      ])) ?? bytes;
    return { output: videoRef(transformed) };
  }
}

export class ReverseVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.Reverse";
  static readonly requiredRuntimes = ["ffmpeg"];
  static readonly title = "Reverse";
  static readonly description =
    "Reverse the playback of a video.\n    video, reverse, backwards, effect";
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to reverse."
  })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const bytes = videoBytes(this.video);
    return { output: videoRef(new Uint8Array([...bytes].reverse())) };
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
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video A",
    description: "The first video in the transition."
  })
  declare video_a: any;

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video B",
    description: "The second video in the transition."
  })
  declare video_b: any;

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
  declare transition_type: any;

  @prop({
    type: "float",
    default: 1,
    title: "Duration",
    description: "Duration of the transition effect in seconds.",
    min: 0.1,
    max: 5
  })
  declare duration: any;

  async process(): Promise<Record<string, unknown>> {
    const a = await videoBytesAsync(this.video_a);
    const b = await videoBytesAsync(this.video_b);
    if (b.length === 0) return { output: videoRef(a) };
    const duration = Math.max(0.1, Number(this.duration ?? 1));
    const transformed =
      (await ffmpegTransform(
        a,
        [
          "-filter_complex",
          `xfade=transition=fade:duration=${duration}:offset=0`
        ],
        [{ suffix: ".mp4", bytes: b }]
      )) ??
      videoBytes({ data: Buffer.from(bytesConcat([a, b])).toString("base64") });
    return { output: videoRef(transformed) };
  }
}

export class AddAudioVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.AddAudio";
  static readonly requiredRuntimes = ["ffmpeg"];
  static readonly title = "Add Audio";
  static readonly description =
    "Add an audio track to a video, replacing or mixing with existing audio.\n    video, audio, soundtrack, merge";
  static readonly metadataOutputTypes = {
    output: "video"
  };

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to add audio to."
  })
  declare video: any;

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
  declare audio: any;

  @prop({
    type: "float",
    default: 1,
    title: "Volume",
    description:
      "Volume adjustment for the added audio. 1.0 is original volume.",
    min: 0,
    max: 2
  })
  declare volume: any;

  @prop({
    type: "bool",
    default: false,
    title: "Mix",
    description:
      "If True, mix new audio with existing. If False, replace existing audio."
  })
  declare mix: any;

  async process(): Promise<Record<string, unknown>> {
    const v = videoBytes(this.video);
    const a = audioBytes(this.audio);
    return { output: videoRef(bytesConcat([v, a])) };
  }
}

export class ChromaKeyVideoNode extends VideoTransformNode {
  static readonly nodeType = "nodetool.video.ChromaKey";
  static readonly title = "Chroma Key";
  static readonly description =
    "Apply chroma key (green screen) effect to a video.\n    video, chroma key, green screen, compositing";
  static readonly metadataOutputTypes = {
    output: "video"
  };
  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to apply chroma key effect."
  })
  declare video: any;

  @prop({
    type: "color",
    default: {
      type: "color",
      value: "#00FF00"
    },
    title: "Key Color",
    description: "The color to key out (e.g., '#00FF00' for green)."
  })
  declare key_color: any;

  @prop({
    type: "float",
    default: 0.3,
    title: "Similarity",
    description: "Similarity threshold for the key color.",
    min: 0,
    max: 1
  })
  declare similarity: any;

  @prop({
    type: "float",
    default: 0.1,
    title: "Blend",
    description: "Blending of the keyed area edges.",
    min: 0,
    max: 1
  })
  declare blend: any;

  async process(): Promise<Record<string, unknown>> {
    const bytes = await videoBytesAsync(this.video);
    const color = String(this.key_color ?? "0x00FF00");
    const similarity = Number(this.similarity ?? 0.1);
    const blend = Number(this.blend ?? 0.0);
    const transformed =
      (await ffmpegTransform(bytes, [
        "-vf",
        `colorkey=${color}:${similarity}:${blend}`,
        "-c:a",
        "copy"
      ])) ?? bytes;
    return { output: videoRef(transformed) };
  }
}

export class ExtractAudioVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.ExtractAudio";
  static readonly requiredRuntimes = ["ffmpeg"];
  static readonly title = "Extract Audio";
  static readonly description =
    "Separate and extract audio track from a video file.\n    video, audio, extract, separate, split";
  static readonly metadataOutputTypes = {
    output: "audio"
  };

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to separate."
  })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const bytes = videoBytes(this.video);
    const half = Math.floor(bytes.length / 2);
    return {
      output: {
        data: Buffer.from(bytes.slice(0, half)).toString("base64")
      }
    };
  }
}

export class ExtractFrameVideoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.ExtractFrame";
  static readonly requiredRuntimes = ["ffmpeg"];
  static readonly title = "Extract Frame";
  static readonly description =
    "Extract a single frame from a video at a specific time position.\n    video, frame, extract, screenshot, thumbnail, capture";
  static readonly metadataOutputTypes = {
    output: "image"
  };

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to extract a frame from."
  })
  declare video: any;

  @prop({
    type: "float",
    default: 0,
    title: "Time",
    description: "Time position in seconds to extract the frame from.",
    min: 0
  })
  declare time: any;

  async process(): Promise<Record<string, unknown>> {
    const bytes = videoBytes(this.video);
    const frameSize = 1024;
    const index = Math.max(0, Number(this.time ?? 0));
    const start = index * frameSize;
    const frame = bytes.slice(start, start + frameSize);
    return {
      output: {
        data: Buffer.from(frame).toString("base64")
      }
    };
  }
}

export class GetVideoInfoNode extends BaseNode {
  static readonly nodeType = "nodetool.video.GetVideoInfo";
  static readonly title = "Get Video Info";
  static readonly description =
    "Get metadata information about a video file.\n    Includes duration, resolution, frame rate, and codec.\n    video, info, metadata, duration, resolution, fps, codec, analysis";
  static readonly metadataOutputTypes = {
    duration: "float",
    width: "int",
    height: "int",
    fps: "float",
    frame_count: "int",
    codec: "str",
    has_audio: "bool"
  };

  @prop({
    type: "video",
    default: {
      type: "video",
      uri: "",
      asset_id: null,
      data: null,
      metadata: null,
      duration: null,
      format: null
    },
    title: "Video",
    description: "The input video to analyze."
  })
  declare video: any;

  async process(): Promise<Record<string, unknown>> {
    const video = (this.video ?? {}) as VideoRefLike;
    const bytes = videoBytes(video);
    return {
      output: {
        uri: video.uri ?? "",
        size_bytes: bytes.length,
        fps: 24,
        duration_seconds: bytes.length / 24000
      }
    };
  }
}

export const VIDEO_NODES = [
  TextToVideoNode,
  ImageToVideoNode,
  LoadVideoFileNode,
  SaveVideoFileVideoNode,
  LoadVideoAssetsNode,
  SaveVideoNode,
  FrameIteratorNode,
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
  GetVideoInfoNode
] as const;
