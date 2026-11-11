/**
 * Comfy Provider — every model behind one `COMFY_API_KEY`.
 *
 * GPU models run official ComfyUI templates through the Comfy API v2 job and
 * asset endpoints. The generated `comfy-gpu-catalog.json` supplies templates
 * and provider tasks. Cloud's node schemas drive saved-workflow conversion.
 *
 * Partner models use the Comfy Router (https://api.comfy.org/v2/models).
 * Their request bodies follow the published input schemas, and their generated
 * catalog is intersected with the live Router listing when available.
 *
 * Running an arbitrary ComfyUI graph on Comfy Cloud stays with the `lib.comfy`
 * nodes; the same key authenticates partner API nodes inside those graphs.
 *
 * Billing: the Router reports credits per run in `X-Comfy-Credits-Used`; this
 * provider does not convert them into a dollar cost record.
 *
 * API keys: https://platform.comfy.org
 */

import { BaseProvider, type ProviderCapability } from "./base-provider.js";
import { ComfyGpuClient, comfyGpuTemplate, comfyGpuTemplateFits, listedComfyGpuTemplates, type ComfyGpuInput } from "./comfy-gpu-models.js";
import type { MusicModel, TextToMusicParams, AudioToAudioModel, AudioToAudioParams, Model3D, TextTo3DParams, ImageTo3DParams } from "./types.js";
import { comfyTemplate, listedComfyTemplates, runComfyTemplate } from "./comfy-template-models.js";
import {
  COMFY_RESTRICTED_MODELS_ENV,
  comfyWorkflowModel,
  listedComfyWorkflowModels,
  runComfyWorkflowModel
} from "./comfy-workflow-models.js";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import {
  ComfyRouterClient,
  RouterArgsBuilder,
  dataUri,
  sniffMime,
  type MediaInput
} from "./comfy-router.js";
import {
  COMFY_ROUTER_CATALOG,
  routerModelName,
  type RouterCatalogEntry,
  type RouterTask
} from "./comfy-router-catalog.js";
import {
  acceptedDuration,
  acceptedSize,
  acceptedValue,
  announcedOptions
} from "./comfy-router-constraints.js";
import type {
  EncodedAudioResult,
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  LanguageModel,
  Message,
  ProviderStreamItem,
  ProviderTool,
  ReferenceToVideoInputs,
  ReferenceToVideoParams,
  TextToImageParams,
  TextToSpeechParams,
  TextToVideoParams,
  ToolCall,
  TTSModel,
  VideoModel,
  VideoToVideoParams
} from "./types.js";

const PROMPT_FIELDS = [
  "prompt", "text_prompt", "prompt_text", "promptText", "positivePrompt", "text", "instruction", "description"
] as const;
const NEGATIVE_FIELDS = ["negative_prompt", "negativePrompt", "negative_text"] as const;
const IMAGE_FIELDS = [
  "image_url", "img_url", "image", "input_image", "image_urls", "images", "input_images", "init_image",
  "imageUrl", "image_base64", "input_image_url", "first_frame_image", "first_frame",
  "start_image", "start_image_url", "first_frame_url", "image_input", "reference_image",
  "reference_images", "promptImage", "prompt_image", "source_image", "image_prompt"
] as const;
const END_IMAGE_FIELDS = ["end_image_url", "end_image", "last_frame_image", "last_frame", "tail_image_url", "image_tail", "last_frame_url"] as const;
const REFERENCE_FIELDS = ["reference_images", "reference_image_urls", "image_urls", "images", "references", "subject_images", "reference_image"] as const;
const VIDEO_FIELDS = ["video_url", "video", "input_video", "video_urls", "source_video", "videoUri", "video_base64"] as const;
const AUDIO_FIELDS = ["audio_url", "audio", "input_audio", "audio_urls"] as const;
const DURATION_FIELDS = ["duration", "duration_seconds", "durationSeconds", "seconds", "video_length", "length"] as const;
const ASPECT_FIELDS = ["aspect_ratio", "aspectRatio", "ratio"] as const;
const RESOLUTION_FIELDS = ["resolution", "quality_resolution", "output_resolution"] as const;
const SEED_FIELDS = ["seed", "random_seed"] as const;
const STEPS_FIELDS = ["num_inference_steps", "steps"] as const;
const GUIDANCE_FIELDS = ["guidance_scale", "guidance", "cfg_scale", "cfg"] as const;
const FRAMES_FIELDS = ["num_frames", "frames", "frame_count"] as const;
const QUALITY_FIELDS = ["quality"] as const;
const STRENGTH_FIELDS = ["strength", "image_strength", "prompt_strength"] as const;
const SPEECH_TEXT_FIELDS = ["text", "text_prompt", "input", "prompt"] as const;
const VOICE_FIELDS = ["voice_id", "voice", "speaker", "voice_type"] as const;

const SIZE_FIELDS = ["size", "image_size"] as const;

const IMAGE_SIZES: Record<string, string> = {
  "1:1": "1024x1024",
  "16:9": "1536x864",
  "9:16": "864x1536",
  "4:3": "1152x864",
  "3:4": "864x1152",
  "3:2": "1216x832",
  "2:3": "832x1216"
};

const base64 = (media: MediaInput): string => Buffer.from(media.bytes).toString("base64");

/** A premade ElevenLabs voice, used when the caller names none. */
const ELEVENLABS_DEFAULT_VOICE = "21m00Tcm4TlvDq8ikWAM";

/** Duration of an MP4/MOV from its `mvhd` box, or undefined if absent. */
export function mp4DurationSeconds(bytes: Uint8Array): number | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let i = 4; i + 32 <= bytes.length; i++) {
    if (bytes[i] !== 0x6d || bytes[i + 1] !== 0x76 || bytes[i + 2] !== 0x68 || bytes[i + 3] !== 0x64) continue;
    const version = bytes[i + 4];
    const timescale = view.getUint32(i + (version === 1 ? 24 : 16));
    const duration =
      version === 1 ? Number(view.getBigUint64(i + 28)) : view.getUint32(i + 20);
    return timescale > 0 ? duration / timescale : undefined;
  }
  return undefined;
}

interface PresetInput {
  task: RouterTask;
  images: MediaInput[];
  video?: MediaInput;
}

/**
 * Request fields a schema requires but cannot describe: free-text strings
 * whose allowed values sit only in the field description, and inputs under
 * names no generic rule maps. A preset returns true when it placed the
 * request's media itself.
 */
const MODEL_PRESETS: Record<string, (b: RouterArgsBuilder, input: PresetInput) => boolean> = {
  "krea/krea-3": (b) => {
    if (!b.isSet("resolution")) b.put("resolution", "1k");
    return false;
  },
  "fal/h3-max": (b) => {
    b.put("prompt_expansion_mode", "balanced");
    return false;
  },
  "fal/h3-max-turbo": (b) => {
    b.put("prompt_expansion_mode", "balanced");
    return false;
  },
  "bfl/flux-3-video": (b, { task, images }) => {
    b.put("mode", task === "image_to_video" ? "i2v" : "t2v");
    if (images.length === 0) return false;
    b.put("keyframes", images.length === 1 ? base64(images[0]) : images.map(base64));
    return true;
  },
  "bfl/vto-v1": (b, { images }) => {
    if (images[0]) b.put("person", base64(images[0]));
    if (images[1]) b.put("garment", base64(images[1]));
    return images.length > 0;
  },
  "wavespeed/flashvsr": (b, { video }) => {
    const seconds = video ? mp4DurationSeconds(video.bytes) : undefined;
    if (seconds !== undefined) b.put("duration", Math.round(seconds * 100) / 100);
    return false;
  },
  "bria/video-edit-replace-background": (b, { images }) => {
    if (images[0]) b.put("background_url", dataUri(images[0]));
    return false;
  },
  "elevenlabs/eleven_sfx_v2": (b) => {
    if (!b.isSet("duration_seconds")) b.put("duration_seconds", null);
    return false;
  },
  "beeble/switchx": (b, { images, video }) => {
    b.put("generation_type", "video");
    if (!b.isSet("alpha_mode")) b.put("alpha_mode", "auto");
    if (video) b.put("source_uri", dataUri(video));
    if (images[0]) b.put("reference_image_uri", dataUri(images[0]));
    return video !== undefined;
  }
};

/**
 * Wan and HappyHorse (DashScope). The Router bills by `resolution`, so one is
 * always sent, and `ratio` exists only on Wan 2.7 and 3.0. Those two and
 * HappyHorse take images as typed `input.media` items (`first_frame`,
 * `reference_image`); Wan 2.5 and 2.6 take the first frame in `img_url`.
 */
function wanPreset(modelId: string): (b: RouterArgsBuilder, input: PresetInput) => boolean {
  const typedMedia = /^wan\/(happyhorse-|wan2\.7-|wan3\.0-)/.test(modelId);
  const takesRatio = /^wan\/(wan2\.7-|wan3\.0-)/.test(modelId);
  return (b, { task, images }) => {
    if (b.declares("resolution") && !b.isSet("resolution")) b.set("resolution", "720P");
    const params = b.body.parameters;
    if (!takesRatio && isRecord(params)) delete params.ratio;
    if (!typedMedia || images.length === 0 || !b.declares("media")) return false;
    const type = task === "image_to_video" ? "first_frame" : "reference_image";
    b.put("media", images.map((img) => ({ type, url: dataUri(img) })));
    return true;
  };
}

function presetFor(modelId: string): ((b: RouterArgsBuilder, input: PresetInput) => boolean) | undefined {
  if (MODEL_PRESETS[modelId]) return MODEL_PRESETS[modelId];
  if (/^wan\/(happyhorse-|wan\d)/.test(modelId)) return wanPreset(modelId);
  return undefined;
}

function textOf(content: Message["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseArgs(raw: unknown): Record<string, unknown> {
  if (isRecord(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed: unknown = JSON.parse(raw);
      return isRecord(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

export class ComfyCloudProvider extends BaseProvider {
  private readonly apiKey: string;
  private router: ComfyRouterClient | null = null;
  private liveIds: Promise<Set<string> | null> | null = null;

  private gpuClient: ComfyGpuClient | undefined;

  protected createGpuClient(): ComfyGpuClient {
    return new ComfyGpuClient(this.requireApiKey());
  }

  private gpuRun(id: string, task: string, input: ComfyGpuInput): Promise<EncodedAudioResult> | undefined {
    const template = comfyGpuTemplate(id);
    if (!template) {
      if (id.startsWith("comfyui-gpu/")) { throw new Error(`Unknown Comfy GPU model: ${id}`); }
      return undefined;
    }
    if (template.task !== task) { throw new Error(`${template.name} supports ${template.task}, not ${task}`); }
    this.gpuClient ??= this.createGpuClient();
    return this.gpuClient.run(template, input);
  }

  private gpuModels(task: string) {
    return listedComfyGpuTemplates().filter((entry) => entry.task === task && comfyGpuTemplateFits(entry)).map((entry) => {
      const model: { id: string; name: string; provider: string; supportedTasks: string[]; inputs?: typeof entry.inputs } = {
        id: entry.id, name: `${entry.name} (Comfy GPU)`, provider: PROVIDER_IDS.COMFY_CLOUD, supportedTasks: [entry.task]
      };
      if (entry.inputs) { model.inputs = entry.inputs; }
      return model;
    });
  }

  static override requiredSecrets(): string[] {
    return ["COMFY_API_KEY"];
  }

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return [
      "text_to_image",
      "image_to_image",
      "text_to_video",
      "image_to_video",
      "reference_to_video",
      "video_to_video",
      "text_to_speech",
      "text_to_music",
      "audio_to_audio",
      "text_to_3d",
      "image_to_3d"
    ];
  }

  constructor(secrets: Record<string, unknown> = {}) {
    super(PROVIDER_IDS.COMFY_CLOUD);
    this.apiKey = (secrets["COMFY_API_KEY"] as string) ?? "";
  }

  override getContainerEnv(): Record<string, string> {
    return { COMFY_API_KEY: this.apiKey };
  }

  private requireApiKey(): string {
    const apiKey = this.apiKey.trim();
    if (!apiKey) {
      throw new Error(
        "COMFY_API_KEY is required for Comfy models. Add it in Settings; get a key at https://platform.comfy.org."
      );
    }
    return apiKey;
  }

  /** Split out so tests can inject a client with a fake `fetch`. */
  protected createRouter(): ComfyRouterClient {
    const apiKey = this.apiKey.trim();
    if (!apiKey) {
      throw new Error(
        "COMFY_API_KEY is required for Comfy models. Add it in Settings; get a key at https://platform.comfy.org."
      );
    }
    return new ComfyRouterClient({ apiKey });
  }

  protected getRouter(): ComfyRouterClient {
    this.router ??= this.createRouter();
    return this.router;
  }

  // ── Catalog ────────────────────────────────────────────────────────────────

  /** The live listing, or null when it cannot be read (offline, no key). */
  private liveModelIds(): Promise<Set<string> | null> {
    this.liveIds ??= (async () => {
      if (!this.apiKey.trim()) return null;
      try {
        return new Set(await this.getRouter().listModels(AbortSignal.timeout(10_000)));
      } catch {
        return null;
      }
    })();
    return this.liveIds;
  }

  private async entries(kind: RouterCatalogEntry["kind"]): Promise<RouterCatalogEntry[]> {
    const live = await this.liveModelIds();
    return COMFY_ROUTER_CATALOG.filter(
      (entry) => entry.kind === kind && (live === null || live.has(entry.id))
    );
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    const templates: ImageModel[] = listedComfyTemplates(process.env)
      .filter((template) => template.task === "text_to_image")
      .map((template) => ({
        id: template.id,
        name: `${template.name} (ComfyUI workflow)`,
        provider: PROVIDER_IDS.COMFY_CLOUD,
        supportedTasks: ["text_to_image"]
      }));
    const router = (await this.entries("image")).map((entry) => ({
      id: entry.id,
      name: routerModelName(entry.id),
      provider: PROVIDER_IDS.COMFY_CLOUD,
      supportedTasks: [...entry.tasks],
      ...announcedOptions(entry.id)
    }));
    return [...templates, ...this.gpuModels("text_to_image"), ...this.gpuModels("image_to_image"), ...router];
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    const workflowModels: VideoModel[] = listedComfyWorkflowModels(process.env).map((model) => ({
      id: model.id,
      name: model.name,
      provider: PROVIDER_IDS.COMFY_CLOUD,
      supportedTasks: ["image_to_video"]
    }));
    const router = (await this.entries("video")).map((entry) => ({
      id: entry.id,
      name: routerModelName(entry.id),
      provider: PROVIDER_IDS.COMFY_CLOUD,
      supportedTasks: [...entry.tasks],
      ...announcedOptions(entry.id)
    }));
    const templates: VideoModel[] = listedComfyTemplates(process.env)
      .filter((template) => template.task === "text_to_video")
      .map((template) => ({
        id: template.id,
        name: `${template.name} (ComfyUI workflow)`,
        provider: PROVIDER_IDS.COMFY_CLOUD,
        supportedTasks: ["text_to_video"]
      }));
    return [...workflowModels, ...templates, ...["text_to_video", "image_to_video", "reference_to_video", "video_to_video"].flatMap((task) => this.gpuModels(task)), ...router];
  }

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return [...this.gpuModels("text_to_speech"), ...(await this.entries("speech")).map((entry) => ({
      id: entry.id,
      name: routerModelName(entry.id),
      provider: PROVIDER_IDS.COMFY_CLOUD
    }))];
  }

  override async getAvailableMusicModels(): Promise<MusicModel[]> { return this.gpuModels("text_to_music"); }

  override async getAvailableAudioToAudioModels(): Promise<AudioToAudioModel[]> { return this.gpuModels("audio_to_audio"); }

  override async getAvailable3DModels(): Promise<Model3D[]> { return [...this.gpuModels("text_to_3d"), ...this.gpuModels("image_to_3d")]; }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return [...this.gpuModels("generate_message"), ...(await this.entries("text")).map((entry) => ({
      id: entry.id,
      name: routerModelName(entry.id),
      provider: PROVIDER_IDS.COMFY_CLOUD
    }))];
  }

  override async hasToolSupport(model: string): Promise<boolean> {
    return comfyGpuTemplate(model) === undefined;
  }

  // ── Request building ───────────────────────────────────────────────────────

  private async builder(modelId: string, signal?: AbortSignal): Promise<RouterArgsBuilder> {
    return new RouterArgsBuilder(await this.getRouter().inputSchema(modelId, signal));
  }

  /** Run the model's preset, if any. True when the preset placed the media. */
  private applyPreset(b: RouterArgsBuilder, modelId: string, input: PresetInput): boolean {
    return presetFor(modelId)?.(b, input) ?? false;
  }

  private finish(b: RouterArgsBuilder, modelId: string): Record<string, unknown> {
    b.fillRequiredDefaults();
    const missing = b.missingRequired();
    if (missing.length > 0) {
      throw new Error(
        `Comfy model ${modelId} needs ${missing.join(", ")}, which this request does not provide.`
      );
    }
    return b.body;
  }

  /**
   * Put the prompt and input images where this model's schema wants them:
   * a `content[]` part list (Seedance, MiniMax), Gemini `contents[]`, or a
   * named image field. Returns whether the images found a home.
   */
  private attachPromptAndImages(
    b: RouterArgsBuilder,
    prompt: string | null | undefined,
    images: MediaInput[],
    names: readonly string[] = IMAGE_FIELDS
  ): boolean {
    if (images.length > 0 && b.schema.inputModalities && !b.schema.inputModalities.includes("image")) {
      return false;
    }
    const content = b.field("content");
    if (content?.type === "array" && content.items && !b.firstDeclared(PROMPT_FIELDS)) {
      const parts: unknown[] = [];
      if (prompt) parts.push({ type: "text", text: prompt });
      images.forEach((img, i) =>
        parts.push({
          type: "image_url",
          image_url: { url: dataUri(img) },
          ...(i === 0 && images.length === 1 ? { role: "first_frame" } : { role: "reference_image" })
        })
      );
      b.put("content", parts);
      return true;
    }
    const contents = b.field("contents");
    if (contents?.type === "array" && !b.firstDeclared(PROMPT_FIELDS)) {
      const parts: unknown[] = [];
      if (prompt) parts.push({ text: prompt });
      for (const img of images) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: Buffer.from(img.bytes).toString("base64") } });
      }
      b.put("contents", [{ role: "user", parts }]);
      return true;
    }
    // Vertex predict shape (Veo): `instances: [{ prompt, image }]`.
    const instances = b.field("instances");
    if (instances?.type === "array" && isRecord(instances.items?.properties) && "prompt" in instances.items.properties) {
      const item: Record<string, unknown> = {};
      if (prompt) item.prompt = prompt;
      if (images[0]) item.image = { bytesBase64Encoded: base64(images[0]), mimeType: images[0].mimeType };
      b.put("instances", [item]);
      return true;
    }
    // DashScope multimodal shape (Qwen image): `input.messages[0].content`.
    const messages = b.field("messages");
    if (messages?.type === "array" && messages.path.length > 1) {
      const content: unknown[] = images.map((img) => ({ image: dataUri(img) }));
      if (prompt) content.push({ text: prompt });
      b.put("messages", [{ role: "user", content }]);
      return true;
    }
    // Gemini Interactions: `input` is a prompt string or typed content parts.
    const input = b.field("input");
    if (input && input.type === undefined && input.path.length === 1 && !b.firstDeclared(PROMPT_FIELDS)) {
      if (images.length === 0) {
        b.put("input", prompt ?? "");
      } else {
        const parts: unknown[] = prompt ? [{ type: "text", text: prompt }] : [];
        for (const img of images) parts.push({ type: "image", data: base64(img), mime_type: img.mimeType });
        b.put("input", parts);
      }
      return true;
    }
    if (prompt) b.setFirst(PROMPT_FIELDS, prompt);
    if (images.length === 0) return true;
    if (b.attachMedia(names, images)) return true;
    // Last resort: a declared field whose name says it takes an input image.
    const guess = [...b.schema.fields.values()].find(
      (f) =>
        /(^|_|[a-z])(img|image|images|frame|media)(_|$|[A-Z]|s$)/i.test(f.name) &&
        !/mask|end|last|tail|size|count|num|format|strength|weight|prompt|aspect|resolution|type/i.test(f.name) &&
        (f.type === "string" || f.type === "array" || f.type === undefined)
    );
    return guess ? b.attachMedia([guess.name], images) !== undefined : false;
  }

  private image(bytes: Uint8Array): MediaInput {
    return { bytes, mimeType: sniffMime(bytes, "image/png") };
  }

  private setCommon(
    b: RouterArgsBuilder,
    modelId: string,
    params: {
      prompt?: string | null;
      negativePrompt?: string | null;
      aspectRatio?: string | null;
      resolution?: string | null;
      seed?: number | null;
      numInferenceSteps?: number | null;
      guidanceScale?: number | null;
    }
  ): void {
    this.attachPromptAndImages(b, params.prompt, []);
    b.setFirst(NEGATIVE_FIELDS, params.negativePrompt);
    b.setFirst(ASPECT_FIELDS, acceptedValue(modelId, "aspectRatio", params.aspectRatio));
    b.setFirst(RESOLUTION_FIELDS, acceptedValue(modelId, "resolution", params.resolution));
    if (typeof params.seed === "number" && params.seed >= 0) b.setFirst(SEED_FIELDS, params.seed);
    b.setFirst(STEPS_FIELDS, params.numInferenceSteps);
    b.setFirst(GUIDANCE_FIELDS, params.guidanceScale);
  }

  private setImageSize(b: RouterArgsBuilder, modelId: string, width?: number | null, height?: number | null, aspect?: string | null): void {
    if (width && height) {
      if (b.declares("width") && b.declares("height")) {
        b.set("width", width).set("height", height);
        return;
      }
      b.setFirst(SIZE_FIELDS, acceptedSize(modelId, width, height));
      return;
    }
    if (aspect && !b.firstDeclared(ASPECT_FIELDS) && IMAGE_SIZES[aspect]) {
      const [w, h] = IMAGE_SIZES[aspect].split("x").map(Number);
      b.setFirst(SIZE_FIELDS, acceptedSize(modelId, w, h));
    }
  }

  private setVideoTiming(b: RouterArgsBuilder, modelId: string, durationSeconds?: number | null, numFrames?: number | null): void {
    if (durationSeconds && durationSeconds > 0) {
      const name = b.firstDeclared(DURATION_FIELDS);
      if (name) {
        const duration = acceptedDuration(modelId, durationSeconds);
        b.set(name, duration);
        // Enum durations are often strings such as "5s".
        if (!b.isSet(name)) b.set(name, `${duration}s`);
      }
    }
    if (numFrames && numFrames > 0) b.setFirst(FRAMES_FIELDS, numFrames);
  }

  // ── Image ──────────────────────────────────────────────────────────────────

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const modelId = params.model.id;
    const gpu = this.gpuRun(modelId, "text_to_image", params);
    if (gpu) { return (await gpu).data; }
    const template = comfyTemplate(modelId);
    if (template) {
      if (template.task !== "text_to_image") {
        throw new Error(`${template.name} does not support text-to-image`);
      }
      return runComfyTemplate(template, this.requireApiKey(), params);
    }
    const b = await this.builder(modelId, params.signal);
    this.setCommon(b, modelId, params);
    this.setImageSize(b, modelId, params.width, params.height, params.aspectRatio);
    b.setFirst(QUALITY_FIELDS, params.quality);
    this.applyPreset(b, modelId, { task: "text_to_image", images: [] });
    const result = await this.getRouter().run(modelId, this.finish(b, modelId), "image", {
      signal: params.signal
    });
    return result.bytes;
  }

  override async imageToImage(images: Uint8Array[], params: ImageToImageParams): Promise<Uint8Array> {
    const modelId = params.model.id;
    const gpu = this.gpuRun(modelId, "image_to_image", { ...params, images, width: params.targetWidth, height: params.targetHeight });
    if (gpu) { return (await gpu).data; }
    if (images.length === 0) throw new Error("imageToImage needs at least one image");
    const b = await this.builder(modelId, params.signal);
    this.setCommon(b, modelId, params);
    this.setImageSize(b, modelId, params.targetWidth, params.targetHeight, params.aspectRatio);
    b.setFirst(QUALITY_FIELDS, params.quality);
    b.setFirst(STRENGTH_FIELDS, params.strength);
    const media = images.map((img) => this.image(img));
    if (
      !this.applyPreset(b, modelId, { task: "image_to_image", images: media }) &&
      !this.attachPromptAndImages(b, params.prompt, media)
    ) {
      throw new Error(`Comfy model ${modelId} takes no input image`);
    }
    const result = await this.getRouter().run(modelId, this.finish(b, modelId), "image", {
      signal: params.signal
    });
    return result.bytes;
  }

  // ── Video ──────────────────────────────────────────────────────────────────

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    const modelId = params.model.id;
    const gpu = this.gpuRun(modelId, "text_to_video", params);
    if (gpu) { return (await gpu).data; }
    const template = comfyTemplate(modelId);
    if (template) {
      if (template.task !== "text_to_video") {
        throw new Error(`${template.name} does not support text-to-video`);
      }
      return runComfyTemplate(template, this.requireApiKey(), params);
    }
    const b = await this.builder(modelId, params.signal);
    this.setCommon(b, modelId, params);
    this.setVideoTiming(b, modelId, params.durationSeconds, params.numFrames);
    this.applyPreset(b, modelId, { task: "text_to_video", images: [] });
    const result = await this.getRouter().run(modelId, this.finish(b, modelId), "video", {
      signal: params.signal,
      timeoutSeconds: params.timeoutSeconds
    });
    return result.bytes;
  }

  override async imageToVideo(image: Uint8Array, params: ImageToVideoParams): Promise<Uint8Array> {
    const modelId = params.model.id;
    const gpu = this.gpuRun(modelId, "image_to_video", { ...params, images: params.endImage ? [image, params.endImage] : [image] });
    if (gpu) { return (await gpu).data; }
    const workflowModel = comfyWorkflowModel(modelId);
    if (workflowModel) {
      // A pinned ComfyUI graph, not a Comfy Router model.
      if (!listedComfyWorkflowModels(process.env).includes(workflowModel)) {
        throw new Error(
          `${workflowModel.name} is off. ${workflowModel.licenseNote ?? ""} Set ${COMFY_RESTRICTED_MODELS_ENV}=1 on the server only where its license permits use.`
        );
      }
      if (params.endImage?.length) {
        throw new Error(`${workflowModel.name} takes no end frame`);
      }
      return runComfyWorkflowModel(workflowModel, {
        apiKey: this.requireApiKey(),
        image,
        imageMime: sniffMime(image, "image/png"),
        prompt: params.prompt ?? "",
        seed: params.seed,
        durationSeconds: params.durationSeconds,
        aspectRatio: params.aspectRatio,
        timeoutSeconds: params.timeoutSeconds,
        signal: params.signal
      });
    }
    const b = await this.builder(modelId, params.signal);
    this.setCommon(b, modelId, params);
    this.setVideoTiming(b, modelId, params.durationSeconds, params.numFrames);
    const start = [this.image(image)];
    if (
      !this.applyPreset(b, modelId, { task: "image_to_video", images: start }) &&
      !this.attachPromptAndImages(b, params.prompt, start)
    ) {
      throw new Error(`Comfy model ${modelId} takes no start image`);
    }
    // A last frame the model cannot take would be dropped without a word, and
    // the caller would get a clip that never reaches the frame it asked for.
    if (params.endImage?.length && !b.attachMedia(END_IMAGE_FIELDS, [this.image(params.endImage)])) {
      throw new Error(`Comfy model ${modelId} takes no end frame`);
    }
    const result = await this.getRouter().run(modelId, this.finish(b, modelId), "video", {
      signal: params.signal,
      timeoutSeconds: params.timeoutSeconds
    });
    return result.bytes;
  }

  override async referenceToVideo(
    inputs: ReferenceToVideoInputs,
    params: ReferenceToVideoParams
  ): Promise<Uint8Array> {
    const modelId = params.model.id;
    const gpu = this.gpuRun(modelId, "reference_to_video", { ...params, images: inputs.images, videos: inputs.videos, audios: inputs.audios ?? [] });
    if (gpu) { return (await gpu).data; }
    const b = await this.builder(modelId, params.signal);
    this.setCommon(b, modelId, params);
    this.setVideoTiming(b, modelId, params.durationSeconds, params.numFrames);
    const references = inputs.images.map((img) => this.image(img));
    if (
      !this.applyPreset(b, modelId, { task: "reference_to_video", images: references }) &&
      references.length > 0
    ) {
      b.attachMedia(REFERENCE_FIELDS, references);
    }
    if (inputs.videos.length > 0) {
      b.attachMedia(VIDEO_FIELDS, inputs.videos.map((bytes) => ({ bytes, mimeType: sniffMime(bytes, "video/mp4") })));
    }
    if (inputs.audios?.length) {
      b.attachMedia(AUDIO_FIELDS, inputs.audios.map((bytes) => ({ bytes, mimeType: "audio/mpeg" })));
    }
    const result = await this.getRouter().run(modelId, this.finish(b, modelId), "video", {
      signal: params.signal,
      timeoutSeconds: params.timeoutSeconds
    });
    return result.bytes;
  }

  override async videoToVideo(video: Uint8Array, params: VideoToVideoParams): Promise<Uint8Array> {
    const modelId = params.model.id;
    const gpu = this.gpuRun(modelId, "video_to_video", { ...params, videos: [video], images: params.referenceImages ?? [] });
    if (gpu) { return (await gpu).data; }
    const b = await this.builder(modelId, params.signal);
    this.setCommon(b, modelId, { ...params, prompt: params.prompt ?? undefined });
    const source = { bytes: video, mimeType: sniffMime(video, "video/mp4") };
    const references = (params.referenceImages ?? []).map((img) => this.image(img));
    if (!this.applyPreset(b, modelId, { task: "video_to_video", images: references, video: source })) {
      if (!b.attachMedia(VIDEO_FIELDS, [source], "video")) {
        throw new Error(`Comfy model ${modelId} takes no input video`);
      }
      if (references.length) b.attachMedia(REFERENCE_FIELDS, references);
    }
    const result = await this.getRouter().run(modelId, this.finish(b, modelId), "video", {
      signal: params.signal
    });
    return result.bytes;
  }

  // ── Speech ─────────────────────────────────────────────────────────────────

  override async textToSpeechEncoded(args: TextToSpeechParams): Promise<EncodedAudioResult | null> {
    const modelId = args.model;
    const gpu = this.gpuRun(modelId, "text_to_speech", { prompt: args.text, audios: args.referenceAudio ? [args.referenceAudio] : [], signal: args.signal });
    if (gpu) { return gpu; }
    const b = await this.builder(modelId, args.signal);
    const voice = args.voice || (modelId.startsWith("elevenlabs/") ? ELEVENLABS_DEFAULT_VOICE : undefined);
    const inputs = b.field("inputs");
    if (inputs?.type === "array" && isRecord(inputs.items?.properties) && "text" in inputs.items.properties) {
      // ElevenLabs v3+ dialogue shape: one `{ text, voice_id }` turn.
      const turn: Record<string, string> = { text: args.text };
      if (voice) turn.voice_id = voice;
      b.put("inputs", [turn]);
    } else {
      b.setFirst(SPEECH_TEXT_FIELDS, args.text);
      b.setFirst(VOICE_FIELDS, voice);
    }
    b.setFirst(["speed"], args.speed);
    b.setFirst(["language_code", "language"], args.language);
    b.setFirst(["instructions", "style"], args.instructions);
    if (args.referenceAudio) {
      b.attachMedia(["reference_audio", "audio_prompt", ...AUDIO_FIELDS], [
        { bytes: args.referenceAudio, mimeType: "audio/wav" }
      ]);
    }
    this.applyPreset(b, modelId, { task: "text_to_speech", images: [] });
    const result = await this.getRouter().run(modelId, this.finish(b, modelId), "audio", {
      signal: args.signal
    });
    return { data: result.bytes, mimeType: result.mimeType };
  }

  override async textToMusic(params: TextToMusicParams): Promise<EncodedAudioResult> {
    const result = this.gpuRun(params.model.id, "text_to_music", params);
    if (!result) { throw new Error(`Comfy model ${params.model.id} does not support music generation`); }
    return result;
  }

  override async audioToAudio(audio: Uint8Array, params: AudioToAudioParams): Promise<EncodedAudioResult> {
    const result = this.gpuRun(params.model.id, "audio_to_audio", { ...params, audios: [audio] });
    if (!result) { throw new Error(`Comfy model ${params.model.id} does not support audio transformation`); }
    return result;
  }

  override async textTo3D(params: TextTo3DParams): Promise<Uint8Array> {
    const result = this.gpuRun(params.model.id, "text_to_3d", params);
    if (!result) { throw new Error(`Comfy model ${params.model.id} does not support text-to-3D`); }
    return (await result).data;
  }

  override async imageTo3D(image: Uint8Array, params: ImageTo3DParams): Promise<Uint8Array> {
    const result = this.gpuRun(params.model.id, "image_to_3d", { ...params, images: [image] });
    if (!result) { throw new Error(`Comfy model ${params.model.id} does not support image-to-3D`); }
    return (await result).data;
  }

  // ── Chat ───────────────────────────────────────────────────────────────────

  /**
   * Native request shapes differ by provider: Anthropic Messages for
   * `anthropic/*`, Gemini `contents` when the schema declares it, and OpenAI
   * chat completions otherwise.
   */
  private async chatRequest(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    signal?: AbortSignal;
  }): Promise<{ shape: "anthropic" | "gemini" | "openai"; body: Record<string, unknown> }> {
    const schema = await this.getRouter().inputSchema(args.model, args.signal);
    const declares = (name: string): boolean => schema.open || schema.fields.has(name);
    const system = args.messages.filter((m) => m.role === "system").map((m) => textOf(m.content)).join("\n\n");
    const turns = args.messages.filter((m) => m.role !== "system");

    if (schema.fields.has("contents")) {
      const body: Record<string, unknown> = {
        contents: turns.map((m) => {
          if (m.role === "tool") {
            return {
              role: "user",
              parts: [{ functionResponse: { name: m.toolCallId ?? "tool", response: { content: textOf(m.content) } } }]
            };
          }
          const parts: unknown[] = [];
          const text = textOf(m.content);
          if (text) parts.push({ text });
          for (const call of m.toolCalls ?? []) parts.push({ functionCall: { name: call.name, args: call.args } });
          return { role: m.role === "assistant" ? "model" : "user", parts };
        })
      };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      if (args.tools?.length) {
        body.tools = [{ functionDeclarations: args.tools.map((t) => ({ name: t.name, description: t.description, parameters: t.inputSchema })) }];
      }
      const generationConfig: Record<string, unknown> = {};
      if (args.maxTokens) generationConfig.maxOutputTokens = args.maxTokens;
      if (args.temperature !== undefined) generationConfig.temperature = args.temperature;
      if (Object.keys(generationConfig).length > 0) body.generationConfig = generationConfig;
      return { shape: "gemini", body };
    }

    if (args.model.startsWith("anthropic/")) {
      const body: Record<string, unknown> = {
        max_tokens: args.maxTokens ?? 4096,
        messages: turns.map((m) => {
          if (m.role === "tool") {
            return {
              role: "user",
              content: [{ type: "tool_result", tool_use_id: m.toolCallId ?? "", content: textOf(m.content), is_error: m.isError ?? false }]
            };
          }
          const blocks: unknown[] = [];
          const text = textOf(m.content);
          if (text) blocks.push({ type: "text", text });
          for (const call of m.toolCalls ?? []) blocks.push({ type: "tool_use", id: call.id, name: call.name, input: call.args });
          return { role: m.role, content: blocks };
        })
      };
      if (declares("model")) body.model = args.model.slice("anthropic/".length);
      if (system) body.system = system;
      if (args.temperature !== undefined) body.temperature = args.temperature;
      if (args.tools?.length) {
        body.tools = args.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.inputSchema ?? { type: "object" } }));
      }
      return { shape: "anthropic", body };
    }

    const messages: unknown[] = [];
    if (system) messages.push({ role: "system", content: system });
    for (const m of turns) {
      if (m.role === "tool") {
        messages.push({ role: "tool", tool_call_id: m.toolCallId ?? "", content: textOf(m.content) });
        continue;
      }
      const msg: Record<string, unknown> = { role: m.role, content: textOf(m.content) };
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map((c) => ({
          id: c.id,
          type: "function",
          function: { name: c.name, arguments: JSON.stringify(c.args) }
        }));
      }
      messages.push(msg);
    }
    const body: Record<string, unknown> = { messages };
    if (declares("model")) body.model = args.model.slice(args.model.indexOf("/") + 1);
    if (args.maxTokens) body[declares("max_completion_tokens") ? "max_completion_tokens" : "max_tokens"] = args.maxTokens;
    if (args.temperature !== undefined) body.temperature = args.temperature;
    if (args.topP !== undefined) body.top_p = args.topP;
    if (args.tools?.length) {
      body.tools = args.tools.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.inputSchema ?? { type: "object" } }
      }));
    }
    return { shape: "openai", body };
  }

  /** Token counts from whichever native usage block the result carries. */
  private recordUsage(model: string, result: unknown): void {
    if (!isRecord(result)) return;
    const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);
    const usage = isRecord(result.usage) ? result.usage : isRecord(result.usageMetadata) ? result.usageMetadata : null;
    if (!usage) return;
    const cached = num(usage.cache_read_input_tokens) + num(usage.cache_creation_input_tokens);
    const inputTokens =
      num(usage.input_tokens) + cached || num(usage.prompt_tokens) || num(usage.promptTokenCount);
    const outputTokens = num(usage.output_tokens) || num(usage.completion_tokens) || num(usage.candidatesTokenCount);
    this.trackUsage(model, { inputTokens, outputTokens, cachedTokens: num(usage.cache_read_input_tokens) });
  }

  private parseChat(shape: "anthropic" | "gemini" | "openai", result: unknown): Message {
    const toolCalls: ToolCall[] = [];
    let text = "";
    if (shape === "anthropic" && isRecord(result) && Array.isArray(result.content)) {
      for (const block of result.content) {
        if (!isRecord(block)) continue;
        if (block.type === "text" && typeof block.text === "string") text += block.text;
        if (block.type === "tool_use") {
          toolCalls.push({ id: String(block.id), name: String(block.name), args: parseArgs(block.input) });
        }
      }
    } else if (shape === "gemini" && isRecord(result) && Array.isArray(result.candidates)) {
      const first = result.candidates[0];
      const parts = isRecord(first) && isRecord(first.content) && Array.isArray(first.content.parts) ? first.content.parts : [];
      parts.forEach((part, i) => {
        if (!isRecord(part)) return;
        if (typeof part.text === "string" && part.thought !== true) text += part.text;
        if (isRecord(part.functionCall)) {
          toolCalls.push({ id: `call_${i}`, name: String(part.functionCall.name), args: parseArgs(part.functionCall.args) });
        }
      });
    } else if (isRecord(result) && Array.isArray(result.choices)) {
      const first = result.choices[0];
      const message = isRecord(first) && isRecord(first.message) ? first.message : {};
      if (typeof message.content === "string") text = message.content;
      if (Array.isArray(message.tool_calls)) {
        for (const call of message.tool_calls) {
          if (!isRecord(call) || !isRecord(call.function)) continue;
          toolCalls.push({ id: String(call.id), name: String(call.function.name), args: parseArgs(call.function.arguments) });
        }
      }
    } else {
      throw new Error(`Comfy chat model returned an unrecognized result: ${JSON.stringify(result).slice(0, 300)}`);
    }
    return { role: "assistant", content: text, toolCalls: toolCalls.length > 0 ? toolCalls : null };
  }

  async generateMessage(args: Parameters<BaseProvider["generateMessage"]>[0]): Promise<Message> {
    if (comfyGpuTemplate(args.model) && args.tools?.length) { throw new Error("Comfy GPU text workflows do not support tool calls"); }
    const gpu = this.gpuRun(args.model, "generate_message", { prompt: args.messages.map((message) => `${message.role}: ${textOf(message.content)}`).join("\n"), maxTokens: args.maxTokens, signal: args.signal });
    if (gpu) {
      return { role: "assistant", content: new TextDecoder().decode((await gpu).data), toolCalls: null };
    }
    const { shape, body } = await this.chatRequest(args);
    const result = await this.getRouter().runJson(args.model, body, { signal: args.signal });
    this.recordUsage(args.model, result);
    return this.parseChat(shape, result);
  }

  /** The Router returns whole results, so this yields the reply in one chunk. */
  async *generateMessages(args: Parameters<BaseProvider["generateMessages"]>[0]): AsyncGenerator<ProviderStreamItem> {
    const message = await this.generateMessage(args);
    for (const call of message.toolCalls ?? []) yield call;
    yield { type: "chunk", content: typeof message.content === "string" ? message.content : "", done: true };
  }
}
