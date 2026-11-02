/**
 * Nodes for a Wan2GP server the user runs themselves.
 *
 * Every call goes over MCP through `Wan2GPClient` in the runtime, which the
 * `wangp` provider also uses. NodeTool never runs Wan2GP: WanGP's license
 * forbids embedding it in a paid product, so the network is the boundary.
 * Start the server with `python wgp.py --mcp --mcp-async`.
 */
import { BaseNode, prop } from "@nodetool-ai/node-sdk";
import { tagAsServer } from "@nodetool-ai/nodes-utils";
import {
  WAN2GP_DEFAULT_MAX_MEDIA_BYTES,
  WAN2GP_DEFAULT_SERVER_URL,
  WAN2GP_MAX_MEDIA_BYTES,
  Wan2GPClient,
  loadMediaRefBytes,
  wan2gpAudioFilename,
  wan2gpImageFilename,
  wan2gpVideoFilename,
  type MediaRefValue,
  type ProcessingContext,
  type Wan2GPProgress,
  type Wan2GPRecord
} from "@nodetool-ai/runtime";

/** Wan2GP's latent grid needs a resolution that is a multiple of this. */
const RESOLUTION_MULTIPLE = 16;
/** Reserved API metadata in a settings dict, not a generation setting. */
const API_KEY = "_api";
/** Settings a model's custom_file declaration may name to make the file count. */
const CUSTOM_FILE_MODES = ["model_mode", "video_prompt_type", "audio_prompt_type"] as const;

const MIME_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  wav: "audio/wav",
  mp3: "audio/mpeg",
  flac: "audio/flac",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
  obj: "model/obj",
  ply: "application/octet-stream"
};

/**
 * Resolve the node's own URL, then the WAN2GP_MCP_URL setting (which falls
 * back to the run's environment), then localhost.
 */
export async function resolveWan2GPServerUrl(
  serverUrl: string | null | undefined,
  context?: ProcessingContext
): Promise<string> {
  const explicit = serverUrl?.trim();
  if (explicit) return explicit;
  const configured = context
    ? await context.getSetting("WAN2GP_MCP_URL")
    : process.env["WAN2GP_MCP_URL"];
  return configured?.trim() || WAN2GP_DEFAULT_SERVER_URL;
}

/** Return Wan2GP's `WxH` string. Each side must be a positive multiple of 16. */
export function wan2gpResolutionString(width: number, height: number): string {
  for (const [name, value] of [["width", width], ["height", height]] as const) {
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error(`Wan2GP needs a positive whole ${name}. Got ${value}.`);
    }
    if (value % RESOLUTION_MULTIPLE !== 0) {
      const lower = value - (value % RESOLUTION_MULTIPLE);
      throw new Error(
        `Wan2GP needs a ${name} that is a multiple of ${RESOLUTION_MULTIPLE}. Got ${value}. Use ${lower || RESOLUTION_MULTIPLE} or ${lower + RESOLUTION_MULTIPLE}.`
      );
    }
  }
  return `${width}x${height}`;
}

/** Return the `activated_loras` and `loras_multipliers` settings. */
export function wan2gpLoraSettings(loras: string[], multipliers: number[]): Wan2GPRecord {
  if (multipliers.length > 0 && multipliers.length !== loras.length) {
    throw new Error(
      `Wan2GP needs one multiplier per LoRA. Got ${loras.length} LoRAs and ${multipliers.length} multipliers.`
    );
  }
  if (loras.length === 0) return {};
  const weights = multipliers.length > 0 ? multipliers : loras.map(() => 1);
  return { activated_loras: [...loras], loras_multipliers: weights.map((weight) => String(weight)).join(" ") };
}

/**
 * Merge the Generate node's settings over the model defaults. Precedence,
 * lowest first: the defaults, the node's seed, the user's settings, the
 * uploaded media. `model_type` is a node field, so it always wins.
 */
export function wan2gpMergedSettings(input: {
  defaults: Wan2GPRecord;
  modelType: string;
  seed: number;
  userSettings: Wan2GPRecord;
  media: Wan2GPRecord;
}): Wan2GPRecord {
  const user = Object.fromEntries(Object.entries(input.userSettings).filter(([key]) => key !== API_KEY));
  return { ...input.defaults, seed: input.seed, ...user, ...input.media, model_type: input.modelType };
}

/** Return the file name for a custom file, from the field or the asset URI. */
export function wan2gpCustomFilename(asset: MediaRefValue, explicit: string): string {
  let name = explicit.trim();
  const uri = typeof asset === "object" && asset !== null && "uri" in asset ? String(asset.uri ?? "") : "";
  if (!name && uri) {
    try {
      name = decodeURIComponent(new URL(uri, "file:///").pathname.split("/").pop() ?? "");
    } catch {
      name = "";
    }
  }
  if (!name) {
    throw new Error("Set custom_file_name to the file's name with its extension, for example trajectory.npy.");
  }
  if (/[\\/]/.test(name) || name === "." || name === "..") {
    throw new Error(`custom_file_name must be a file name without folders. Got ${JSON.stringify(name)}.`);
  }
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) {
    throw new Error(`custom_file_name needs an extension, for example .npy. Got ${JSON.stringify(name)}.`);
  }
  return name;
}

function connected(value: MediaRefValue | null | undefined): value is MediaRefValue {
  if (!value || typeof value !== "object") return false;
  const ref = value as { uri?: unknown; asset_id?: unknown; data?: unknown };
  const data = ref.data as { length?: number } | null | undefined;
  return Boolean(ref.uri) || Boolean(ref.asset_id) || (data?.length ?? 0) > 0;
}

async function mediaBytes(value: MediaRefValue, context: ProcessingContext | undefined, what: string): Promise<Uint8Array> {
  const bytes = await loadMediaRefBytes(value, context);
  if (!bytes || bytes.length === 0) throw new Error(`Could not load the ${what} for Wan2GP.`);
  return bytes;
}

type OutputKind = "image" | "video" | "audio" | "3d";

function outputRef(kind: OutputKind, data: Uint8Array, filename: string | undefined): Record<string, unknown> {
  const extension = filename?.split(".").pop()?.toLowerCase() ?? "";
  const base64 = Buffer.from(data).toString("base64");
  if (kind === "3d") {
    const format = extension || "glb";
    return { type: "model_3d", uri: "", data: base64, format, content_type: MIME_TYPES[format] ?? "model/gltf-binary" };
  }
  const fallback = { image: "image/png", video: "video/mp4", audio: "audio/wav" }[kind];
  return { type: kind, uri: "", data: base64, content_type: MIME_TYPES[extension] ?? fallback };
}

/** Shared connection fields and the submit, poll and download loop. */
abstract class Wan2GPNodeBase extends BaseNode {
  static readonly autoSaveAsset = true;

  @prop({
    type: "str",
    default: "",
    title: "Server URL",
    description:
      "MCP endpoint of your own Wan2GP server, for example http://127.0.0.1:7866/mcp. Leave blank to use the WAN2GP_MCP_URL setting, then localhost."
  })
  declare server_url: string;

  @prop({
    type: "int",
    default: 1800,
    min: 1,
    title: "Timeout",
    description: "How long to wait for one generation, in seconds. The job is cancelled on the server when it runs out."
  })
  declare timeout_seconds: number;

  @prop({
    type: "int",
    default: WAN2GP_DEFAULT_MAX_MEDIA_BYTES,
    min: 1,
    max: WAN2GP_MAX_MEDIA_BYTES,
    title: "Max Media Bytes",
    description: "Largest upload or download in bytes. Defaults to 512 MiB, at most 8 GiB."
  })
  declare max_media_bytes: number;

  @prop({ type: "int", default: -1, min: -1, title: "Seed", description: "Random seed. Use -1 to let Wan2GP pick a new seed for every run." })
  declare seed: number;

  protected async uploadImage(client: Wan2GPClient, context: ProcessingContext | undefined, image: MediaRefValue): Promise<string> {
    const data = await mediaBytes(image, context, "image");
    return client.uploadMedia(wan2gpImageFilename(data), data);
  }

  protected async uploadVideo(client: Wan2GPClient, context: ProcessingContext | undefined, video: MediaRefValue): Promise<string> {
    const data = await mediaBytes(video, context, "video");
    return client.uploadMedia(wan2gpVideoFilename(data), data);
  }

  protected async uploadAudio(client: Wan2GPClient, context: ProcessingContext | undefined, audio: MediaRefValue): Promise<string> {
    const data = await mediaBytes(audio, context, "audio");
    return client.uploadMedia(wan2gpAudioFilename(data), data);
  }

  private postProgress(context: ProcessingContext | undefined, progress: Wan2GPProgress): void {
    const nodeId = this.__node_id;
    if (!context || !nodeId) return;
    // The step counter is more useful than the percentage when a phase has one.
    const stepped =
      typeof progress.current_step === "number" && typeof progress.total_steps === "number" && progress.total_steps > 0;
    context.postMessage({
      type: "node_progress",
      node_id: nodeId,
      progress: stepped ? (progress.current_step as number) : Math.trunc(Number(progress.progress ?? 0)),
      total: stepped ? (progress.total_steps as number) : 100
    });
  }

  /** Submit one generation, follow it, and return its first output as a ref. */
  protected async runGeneration(
    context: ProcessingContext | undefined,
    buildSettings: (client: Wan2GPClient) => Promise<Wan2GPRecord>,
    expected?: OutputKind
  ): Promise<{ kind: OutputKind; ref: Record<string, unknown> }> {
    const signal = context?.signal;
    const client = await Wan2GPClient.connect(await resolveWan2GPServerUrl(this.server_url, context), {
      maxTransferBytes: this.max_media_bytes,
      signal
    });
    try {
      const settings = await buildSettings(client);
      signal?.throwIfAborted();
      const jobId = await client.submit(settings);
      const job = await client.pollUntilDone(jobId, {
        timeoutMs: this.timeout_seconds * 1000,
        signal,
        onProgress: (progress) => this.postProgress(context, progress)
      });
      const { item, data } = await client.downloadFirstOutput(
        job,
        expected ? [expected] : ["image", "video", "audio", "3d"]
      );
      const kind = item.media_type as OutputKind;
      return { kind, ref: outputRef(kind, data, item.filename) };
    } finally {
      await client.close();
    }
  }
}

/** Fields the text-to-video and image-to-video nodes share. */
abstract class Wan2GPVideoNodeBase extends Wan2GPNodeBase {
  static readonly metadataOutputTypes = { output: "video" };

  @prop({ type: "str", default: "", title: "Negative Prompt", description: "What to keep out of the video. Leave empty to use the model default." })
  declare negative_prompt: string;

  @prop({ type: "int", default: 832, min: 16, title: "Width", description: "Output width in pixels. Must be a multiple of 16." })
  declare width: number;

  @prop({ type: "int", default: 480, min: 16, title: "Height", description: "Output height in pixels. Must be a multiple of 16." })
  declare height: number;

  @prop({ type: "int", default: 81, min: 1, title: "Frames", description: "Number of frames. Wan2GP rounds this to the nearest count the model allows." })
  declare num_frames: number;

  @prop({ type: "int", default: 16, min: 1, title: "FPS", description: "Frames per second of the output video." })
  declare fps: number;

  @prop({ type: "int", default: 30, min: 1, title: "Steps", description: "Denoising steps. More steps give more detail and take longer." })
  declare num_inference_steps: number;

  @prop({ type: "list[str]", default: [], title: "LoRAs", description: "LoRA identifiers to activate, as the server lists them." })
  declare loras: string[];

  @prop({ type: "list[float]", default: [], title: "LoRA Multipliers", description: "Weight for each LoRA, in the same order. Leave empty for a weight of 1 each." })
  declare lora_multipliers: number[];

  protected videoSettings(modelType: string, prompt: string, imageStart?: string): Wan2GPRecord {
    const settings: Wan2GPRecord = {
      model_type: modelType,
      prompt,
      resolution: wan2gpResolutionString(this.width, this.height),
      video_length: this.num_frames,
      force_fps: this.fps,
      num_inference_steps: this.num_inference_steps,
      seed: this.seed,
      ...wan2gpLoraSettings(this.loras ?? [], this.lora_multipliers ?? [])
    };
    if (this.negative_prompt) settings.negative_prompt = this.negative_prompt;
    if (imageStart !== undefined) {
      settings.image_start = imageStart;
      settings.image_prompt_type = "S";
    }
    return settings;
  }
}

export class Wan2GPTextToVideoNode extends Wan2GPVideoNodeBase {
  static readonly nodeType = "lib.wan2gp.TextToVideo";
  static readonly title = "Text To Video (Wan2GP)";
  static readonly description =
    "Generate a video from a prompt with a Wan video model on your own Wan2GP server.\n    video, generation, text-to-video, Wan, Wan2GP, local\n\n    Use cases:\n    - Turn a written scene description into a short clip\n    - Produce b-roll and background footage for an edit\n    - Run prompt variations on local hardware without an API bill";
  static readonly basicFields = ["prompt", "model_type", "width", "height", "num_frames"];
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["prompt"];

  @prop({ type: "str", default: "", title: "Prompt", required: true, description: "Description of the video to generate." })
  declare prompt: string;

  @prop({ type: "str", default: "t2v_2_2", title: "Model", description: "Wan2GP model id, for example t2v_2_2. The List Models node shows the ids your server offers." })
  declare model_type: string;

  /** Return the settings this node sends to `wangp_generate`. */
  buildSettings(): Wan2GPRecord {
    if (!this.prompt.trim()) throw new Error("Prompt is required");
    return this.videoSettings(this.model_type, this.prompt);
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const settings = this.buildSettings();
    const { ref } = await this.runGeneration(context, async () => settings, "video");
    return { output: ref };
  }
}

export class Wan2GPImageToVideoNode extends Wan2GPVideoNodeBase {
  static readonly nodeType = "lib.wan2gp.ImageToVideo";
  static readonly title = "Image To Video (Wan2GP)";
  static readonly description =
    "Animate a still image with a Wan image-to-video model on your own Wan2GP server.\n    video, generation, image-to-video, animation, Wan, Wan2GP, local\n\n    Use cases:\n    - Animate a photograph or a piece of artwork\n    - Add camera movement to a product shot\n    - Test motion prompts against one fixed first frame";
  static readonly basicFields = ["image", "prompt", "model_type", "width", "height", "num_frames"];
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["image", "prompt"];

  @prop({ type: "image", default: null, title: "Image", required: true, description: "The first frame of the video." })
  declare image: MediaRefValue | null;

  @prop({ type: "str", default: "", title: "Prompt", description: "How the image should move." })
  declare prompt: string;

  @prop({ type: "str", default: "i2v_2_2", title: "Model", description: "Wan2GP model id, for example i2v_2_2. The List Models node shows the ids your server offers." })
  declare model_type: string;

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const image = this.image;
    if (!connected(image)) throw new Error("Image To Video needs a starting image.");
    wan2gpResolutionString(this.width, this.height);
    const { ref } = await this.runGeneration(
      context,
      async (client) => this.videoSettings(this.model_type, this.prompt, await this.uploadImage(client, context, image)),
      "video"
    );
    return { output: ref };
  }
}

export class Wan2GPGenerateNode extends Wan2GPNodeBase {
  static readonly nodeType = "lib.wan2gp.Generate";
  static readonly title = "Generate (Wan2GP)";
  static readonly description =
    "Run any model on your own Wan2GP server with the settings you supply, and return its image, video, audio or 3D model.\n    generation, video, image, audio, 3d, Wan, Wan2GP, advanced, local\n\n    The node starts from the model's own defaults and applies your settings on top. Each connected media input is uploaded and sent under the Wan2GP setting its description names. Wan2GP turns on the matching start, end, reference and audio modes itself. Control and mask videos also need a video_prompt_type in settings, such as \"VA\", unless the model's defaults enable them.\n\n    Use cases:\n    - Drive a model the other Wan2GP nodes do not cover\n    - Set guidance, flow shift, sliding windows or other expert settings\n    - Run a control-guided or video-to-video generation\n    - Feed a model its extra input file, such as a trajectory or a score";
  static readonly basicFields = ["model_type", "settings"];
  static readonly metadataOutputTypes = { output: "union[image, video, audio, model_3d]" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = [
    "image",
    "image_end",
    "reference_images",
    "video",
    "video_mask",
    "source_video",
    "audio",
    "custom_file"
  ];

  @prop({ type: "str", default: "t2v_2_2", title: "Model", description: "Wan2GP model id. The List Models node shows the ids your server offers." })
  declare model_type: string;

  @prop({
    type: "dict[str, any]",
    default: {},
    title: "Settings",
    description:
      "Wan2GP generation settings applied on top of the model defaults, such as prompt, resolution, video_length, num_inference_steps and guidance_scale. The reserved _api key is removed."
  })
  declare settings: Record<string, unknown>;

  @prop({ type: "image", default: null, title: "Start Image", description: "Sent as image_start." })
  declare image: MediaRefValue | null;

  @prop({ type: "image", default: null, title: "End Image", description: "Sent as image_end, for models that take a last frame." })
  declare image_end: MediaRefValue | null;

  @prop({ type: "list[image]", default: [], title: "Reference Images", description: "Sent in order as image_refs, for models that take a subject, style or background reference." })
  declare reference_images: MediaRefValue[];

  @prop({ type: "video", default: null, title: "Control Video", description: "Sent as video_guide." })
  declare video: MediaRefValue | null;

  @prop({ type: "video", default: null, title: "Mask Video", description: "Sent as video_mask. Needs a control video and a video_prompt_type with A." })
  declare video_mask: MediaRefValue | null;

  @prop({ type: "video", default: null, title: "Source Video", description: "Sent as video_source, the video to continue from." })
  declare source_video: MediaRefValue | null;

  @prop({ type: "audio", default: null, title: "Audio", description: "Sent as audio_guide, such as speech for lip sync." })
  declare audio: MediaRefValue | null;

  @prop({
    type: "asset",
    default: null,
    title: "Custom File",
    description:
      "Sent as custom_guide: the extra input file some models require, such as a trajectory (.npy) for wanmove or a score (.abc) for yue2."
  })
  declare custom_file: MediaRefValue | null;

  @prop({
    type: "str",
    default: "",
    title: "Custom File Name",
    description: "File name of the custom file with its extension, for example trajectory.npy. Leave blank to take it from the file's URI."
  })
  declare custom_file_name: string;

  /** Merge the model defaults, the uploaded media and the user settings. */
  async buildSettings(client: Wan2GPClient, context: ProcessingContext | undefined): Promise<Wan2GPRecord> {
    const userSettings = this.settings ?? {};
    const custom = this.custom_file;
    const customName = connected(custom) ? wan2gpCustomFilename(custom, this.custom_file_name ?? "") : null;
    const defaults = await client.getModelDefaults(this.model_type);
    const media: Wan2GPRecord = {};
    for (const [key, image] of [["image_start", this.image], ["image_end", this.image_end]] as const) {
      if (connected(image)) media[key] = await this.uploadImage(client, context, image);
    }
    const references = (this.reference_images ?? []).filter(connected);
    if (references.length > 0) {
      const ids: string[] = [];
      for (const image of references) ids.push(await this.uploadImage(client, context, image));
      media.image_refs = ids;
    }
    for (const [key, video] of [
      ["video_guide", this.video],
      ["video_mask", this.video_mask],
      ["video_source", this.source_video]
    ] as const) {
      if (connected(video)) media[key] = await this.uploadVideo(client, context, video);
    }
    if (connected(this.audio)) media.audio_guide = await this.uploadAudio(client, context, this.audio);
    if (customName !== null && connected(custom)) {
      const data = await mediaBytes(custom, context, "custom file");
      media.custom_guide = await client.uploadFile(customName, data);
      // A model's defaults can leave its custom file unused: yue2 reads its
      // score only in audio_prompt_type "1". A mode set in settings is kept.
      const metadata = await client.getModelCapabilities(this.model_type);
      const inputs = (metadata.media_inputs ?? {}) as Record<string, unknown>;
      const declared = (inputs.custom_file ?? {}) as Record<string, unknown>;
      for (const key of CUSTOM_FILE_MODES) {
        if (key in declared && !(key in userSettings)) media[key] = declared[key];
      }
    }
    return wan2gpMergedSettings({ defaults, modelType: this.model_type, seed: this.seed, userSettings, media });
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const { ref } = await this.runGeneration(context, (client) => this.buildSettings(client, context));
    return { output: ref };
  }
}

const ROW_KEYS = ["model_type", "name", "family", "main_output", "outputs", "inputs", "media_inputs", "capabilities"];

export class Wan2GPListModelsNode extends BaseNode {
  static readonly nodeType = "lib.wan2gp.ListModels";
  static readonly title = "List Models (Wan2GP)";
  static readonly description =
    "List the models your own Wan2GP server offers, with the media each one accepts.\n    models, list, search, Wan, Wan2GP, local\n\n    Each row carries the model_type for the other Wan2GP nodes, the name and family, the outputs, and media_inputs: the image, video and audio roles the model accepts and any custom file it needs. The list comes from the running server, so it includes finetunes and models added after this release.\n\n    Use cases:\n    - Find the model_type for a model you know by name\n    - List the video models that take a start or reference image\n    - Check which models need a custom file before you build a graph";
  static readonly basicFields = ["query", "main_output", "media_input"];
  static readonly metadataOutputTypes = { output: "list[dict]" };
  static readonly inlineFields: string[] = [];
  static readonly inputFields: string[] = ["query"];

  @prop({
    type: "str",
    default: "",
    title: "Server URL",
    description: "MCP endpoint of your own Wan2GP server. Leave blank to use the WAN2GP_MCP_URL setting, then http://127.0.0.1:7866/mcp."
  })
  declare server_url: string;

  @prop({ type: "str", default: "", title: "Query", description: "Text to look for in the model's name, id, family or description. Leave blank to list every model." })
  declare query: string;

  @prop({
    type: "enum",
    default: "",
    title: "Main Output",
    description: "Keep only models whose main output is this kind. Empty keeps every kind.",
    values: ["", "video", "image", "audio", "3d"]
  })
  declare main_output: string;

  @prop({ type: "str", default: "", title: "Media Input", description: "Keep only models that accept this input kind: image, video, audio, 3d or world." })
  declare media_input: string;

  @prop({ type: "str", default: "", title: "Capability", description: "Keep only models with this Wan2GP capability, for example image_to_video, reference_images or control_video." })
  declare capability: string;

  @prop({ type: "int", default: 50, min: 1, max: 500, title: "Limit", description: "Most models to return." })
  declare limit: number;

  filters(): Wan2GPRecord {
    const filters: Wan2GPRecord = {};
    if (this.main_output) filters.main_output = this.main_output;
    if (this.media_input?.trim()) filters.inputs = this.media_input.trim();
    if (this.capability?.trim()) filters.capabilities = [this.capability.trim()];
    return filters;
  }

  async process(context?: ProcessingContext): Promise<Record<string, unknown>> {
    const client = await Wan2GPClient.connect(await resolveWan2GPServerUrl(this.server_url, context), { signal: context?.signal });
    try {
      const models = await client.searchAllModels(this.query ?? "", this.filters(), this.limit);
      return {
        output: models.map((model) => Object.fromEntries(ROW_KEYS.filter((key) => key in model).map((key) => [key, model[key]])))
      };
    } finally {
      await client.close();
    }
  }
}

export const WAN2GP_NODES = tagAsServer([
  Wan2GPTextToVideoNode,
  Wan2GPImageToVideoNode,
  Wan2GPGenerateNode,
  Wan2GPListModelsNode
]);
