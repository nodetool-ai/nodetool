/**
 * Wan2GP provider: the `wangp` provider id.
 *
 * Every call goes over MCP through {@link Wan2GPClient}. The composer, the
 * Create view and presets list the server's models and generate with them.
 *
 * `WAN2GP_MCP_URL` names a Wan2GP server to use. Without it, the Wan2GP the
 * Package Manager installed is started on demand (`wan2gp-server.ts`), and
 * without an install the default `http://127.0.0.1:7866/mcp` is tried.
 * `WAN2GP_MCP_TOKEN` is the bearer token for a server behind an
 * authenticating proxy, such as the nodetool-wan2gp combined image.
 */

import { createLogger } from "@nodetool-ai/config";
import { PROVIDER_IDS } from "@nodetool-ai/protocol";
import { BaseProvider, type ProviderCapability } from "./base-provider.js";
import { findInstalledWan2GP, withWan2GPClient } from "./wan2gp-server.js";
import { markWan2GPModelAvailable, wan2gpCatalog } from "./wan2gp-models.js";
import {
  WAN2GP_MAX_MEDIA_BYTES,
  Wan2GPClient,
  Wan2GPError,
  wan2gpAudioFilename,
  wan2gpImageFilename,
  type Wan2GPRecord
} from "./wan2gp-client.js";
import type {
  EncodedAudioResult,
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  Message,
  ModelAdapterInfo,
  MusicModel,
  ProviderStreamItem,
  ReferenceToVideoInputs,
  ReferenceToVideoParams,
  TextToImageParams,
  TextToMusicParams,
  TextToSpeechParams,
  TextToVideoParams,
  TTSModel,
  VideoModel
} from "./types.js";

// Stryker disable next-line StringLiteral: logger name is diagnostic, not asserted.
const log = createLogger("nodetool.runtime.providers.wangp");

/** Overall deadline for one generation when the caller sets none. */
const DEFAULT_TIMEOUT_SECONDS = 1800;
const POLL_INTERVAL_MS = 1_000;

type Task = "text_to_video" | "image_to_video" | "reference_to_video" | "text_to_image" | "image_to_image";

/** NodeTool task -> the Wan2GP capability that enables it. */
const VIDEO_TASKS: ReadonlyArray<[Task, string]> = [
  ["text_to_video", "text_to_video"],
  ["image_to_video", "image_to_video"],
  ["reference_to_video", "reference_images"]
];
const IMAGE_TASKS: ReadonlyArray<[Task, string]> = [
  ["text_to_image", "text_to_image"],
  ["image_to_image", "image_to_image"]
];

interface GenerationParams {
  model: { id: string };
  prompt?: string | null;
  negativePrompt?: string | null;
  numInferenceSteps?: number | null;
  seed?: number | null;
  guidanceScale?: number | null;
  strength?: number | null;
  resolution?: string | null;
  aspectRatio?: string | null;
  width?: number | null;
  height?: number | null;
  numFrames?: number | null;
  durationSeconds?: number | null;
  timeoutSeconds?: number | null;
  signal?: AbortSignal;
}

/**
 * Return a `WxH` resolution from a tier such as `720p`, or from a size. A
 * tier sets the short side and the aspect ratio, `16:9` by default, sets the
 * long one. Wan2GP aligns the result to its own block size.
 */
export function wan2gpResolution(params: GenerationParams): string | undefined {
  const value = params.resolution?.trim();
  if (value) {
    const tier = /^(\d+)\s*[pP]$/.exec(value);
    if (!tier) return value;
    const short = Number(tier[1]);
    const ratio = params.aspectRatio?.trim() || "16:9";
    const parts = /^(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)$/.exec(ratio);
    const across = parts ? Number(parts[1]) : 0;
    const down = parts ? Number(parts[2]) : 0;
    if (!(across > 0 && down > 0)) {
      throw new Wan2GPError(`Invalid aspect ratio: ${JSON.stringify(ratio)}`);
    }
    return across >= down
      ? `${Math.round((short * across) / down)}x${short}`
      : `${short}x${Math.round((short * down) / across)}`;
  }
  if (params.width && params.height) {
    return `${Math.trunc(params.width)}x${Math.trunc(params.height)}`;
  }
  return undefined;
}

/** Map NodeTool generation params to Wan2GP settings, without media. */
export function wan2gpBaseSettings(
  output: "video" | "image",
  params: GenerationParams
): Wan2GPRecord {
  const modelType = params.model.id.trim();
  if (!modelType) throw new Wan2GPError("The request names no Wan2GP model.");
  const settings: Wan2GPRecord = { model_type: modelType, prompt: params.prompt ?? "" };
  const optional: Array<[string, unknown]> = [
    ["negative_prompt", params.negativePrompt],
    ["num_inference_steps", params.numInferenceSteps],
    ["seed", params.seed],
    ["guidance_scale", params.guidanceScale],
    ["denoising_strength", params.strength]
  ];
  for (const [key, value] of optional) {
    if (value !== null && value !== undefined && value !== "") settings[key] = value;
  }
  const resolution = wan2gpResolution(params);
  if (resolution) settings.resolution = resolution;
  if (output === "video") {
    if (params.numFrames) {
      settings.video_length = Math.trunc(params.numFrames);
    } else if (params.durationSeconds) {
      settings.video_length = `${params.durationSeconds}s`;
    }
  } else {
    // Selects the image output on models that also make video, such as H3.
    settings.image_mode = 1;
  }
  return settings;
}

/** How long one model listing is reused. Wan2GP's registry changes only on an update. */
const LISTING_TTL_MS = 10 * 60 * 1000;
const listings = new Map<string, { at: number; rows: Promise<Wan2GPRecord[]> }>();

/** Forget cached model listings, for tests and after an install or update. */
export function resetWan2GPListings(): void {
  listings.clear();
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function mediaRoles(row: Wan2GPRecord, kind: string): string[] {
  const inputs = row.media_inputs;
  return typeof inputs === "object" && inputs !== null ? strings((inputs as Wan2GPRecord)[kind]) : [];
}

/** A model that cannot run without a file the provider has no field for, such as YuE2's score. */
function needsCustomFile(row: Wan2GPRecord): boolean {
  const inputs = row.media_inputs as Wan2GPRecord | undefined;
  const custom = inputs?.custom_file as Wan2GPRecord | undefined;
  return custom?.required === true;
}

function audioMime(filename: string | undefined): string {
  const extension = filename?.split(".").pop()?.toLowerCase() ?? "";
  return (
    { mp3: "audio/mpeg", flac: "audio/flac", ogg: "audio/ogg", opus: "audio/ogg", m4a: "audio/mp4", aac: "audio/aac" }[
      extension
    ] ?? "audio/wav"
  );
}

interface ModelModes {
  label: string;
  values: string[];
}

export class Wan2GPProvider extends BaseProvider {
  /** The configured server, or empty for the installed Wan2GP. */
  readonly serverUrl: string;
  private readonly token: string;

  constructor(kwargs: Record<string, unknown> = {}) {
    super(PROVIDER_IDS.WANGP);
    const configured = kwargs["WAN2GP_MCP_URL"];
    this.serverUrl = typeof configured === "string" ? configured.trim() : "";
    const token = kwargs["WAN2GP_MCP_TOKEN"];
    this.token = typeof token === "string" ? token.trim() : "";
  }

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return [
      "text_to_video",
      "image_to_video",
      "reference_to_video",
      "text_to_image",
      "image_to_image",
      "text_to_speech",
      "text_to_music"
    ];
  }

  async generateMessage(_args: Parameters<BaseProvider["generateMessage"]>[0]): Promise<Message> {
    throw new Error("wangp does not support chat generation");
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("wangp does not support chat generation");
  }

  private withClient<T>(signal: AbortSignal | undefined, fn: (client: Wan2GPClient) => Promise<T>): Promise<T> {
    return withWan2GPClient(
      { serverUrl: this.serverUrl, token: this.token, maxTransferBytes: WAN2GP_MAX_MEDIA_BYTES, signal },
      fn
    );
  }

  /**
   * Every model, with capabilities. The installed Wan2GP's come from the
   * catalog its install wrote, so listing does not start Wan2GP. A
   * configured server answers its model search, shared for a while across
   * listings.
   */
  private async rows(): Promise<Wan2GPRecord[]> {
    if (!this.serverUrl) {
      const install = await findInstalledWan2GP();
      if (install) return wan2gpCatalog(install);
    }
    const key = this.serverUrl || "default";
    const cached = listings.get(key);
    if (cached && Date.now() - cached.at < LISTING_TTL_MS) return cached.rows;
    const rows = this.withClient(undefined, (client) => client.searchAllModels("", {}, 1000));
    listings.set(key, { at: Date.now(), rows });
    rows.catch(() => {
      if (listings.get(key)?.rows === rows) listings.delete(key);
    });
    return rows;
  }

  private async safeRows(): Promise<Wan2GPRecord[]> {
    try {
      return await this.rows();
    } catch (error) {
      // No server running is the ordinary case on a machine without one.
      // Stryker disable next-line StringLiteral,ObjectLiteral: diagnostic log, not asserted.
      log.debug("Wan2GP model listing failed", { error: String(error) });
      return [];
    }
  }

  private async row(modelType: string): Promise<Wan2GPRecord | undefined> {
    return (await this.safeRows()).find((row) => row.model_type === modelType);
  }

  /**
   * The download state of a model of the installed Wan2GP, for the model
   * picker's Download button. Catalog rows carry it. A configured server's
   * rows do not, because that server manages its own files.
   */
  private adapter(row: Wan2GPRecord): ModelAdapterInfo | undefined {
    const status = row.status;
    if (this.serverUrl || typeof status !== "string") return undefined;
    const modelType = String(row.model_type);
    return {
      state: "installed",
      // The weights come from Hugging Face, but Wan2GP's own downloader puts
      // them in its ckpts folder. The wangp. model type routes the download
      // there, as tjs. routes Transformers.js downloads.
      artifactRef: { source: "huggingface", repoId: `wangp/${modelType}`, modelType: `wangp.${modelType}` },
      filesPresent: status === "available"
    };
  }

  /** Models of one main output, with the tasks their capabilities enable. */
  private async listModels(mainOutput: "video" | "image", tasks: ReadonlyArray<[Task, string]>) {
    const rows = await this.safeRows();
    const models: Array<{ id: string; name: string; supportedTasks: Task[]; adapter?: ModelAdapterInfo }> = [];
    for (const row of rows) {
      if (!strings(row.main_output).includes(mainOutput)) continue;
      const capabilities = new Set(strings(row.capabilities));
      const supportedTasks = tasks.filter(([, capability]) => capabilities.has(capability)).map(([task]) => task);
      const id = String(row.model_type ?? "").trim();
      if (!id || supportedTasks.length === 0) continue;
      const adapter = this.adapter(row);
      models.push({ id, name: String(row.name ?? id), supportedTasks, ...(adapter && { adapter }) });
    }
    return models;
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    const models = await this.listModels("video", VIDEO_TASKS);
    return models.map((model) => ({ ...model, provider: PROVIDER_IDS.WANGP }));
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    const models = await this.listModels("image", IMAGE_TASKS);
    return models.map((model) => ({ ...model, provider: PROVIDER_IDS.WANGP }));
  }

  /** Audio models of one family that make audio from text. */
  private async audioRows(family: "tts" | "music"): Promise<Wan2GPRecord[]> {
    return (await this.safeRows()).filter(
      (row) =>
        row.family === family &&
        strings(row.main_output).includes("audio") &&
        strings(row.capabilities).includes("text_to_audio") &&
        !needsCustomFile(row)
    );
  }

  /**
   * A model's mode choices: the speaker presets or languages a speech model
   * offers. Catalog rows carry them. A configured server is asked per model.
   */
  private async modelModes(row: Wan2GPRecord): Promise<ModelModes | null> {
    if (typeof row.status === "string") {
      const modes = row.model_modes as ModelModes | undefined;
      return modes ? { label: modes.label.toLowerCase(), values: modes.values } : null;
    }
    try {
      const result = await this.withClient(undefined, (client) =>
        client.callTool("wangp_model", {
          model_type: String(row.model_type),
          action: "definition",
          arguments: { property: "model_modes" }
        })
      );
      const modes = (result as Wan2GPRecord | null)?.model_modes as Wan2GPRecord | undefined;
      const choices = Array.isArray(modes?.choices) ? modes.choices : [];
      const values = choices.map((choice) => (Array.isArray(choice) ? String(choice[1]) : String(choice)));
      return { label: String(modes?.label ?? "").toLowerCase(), values };
    } catch {
      // Most speech models declare no modes.
      return null;
    }
  }

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    const rows = await this.audioRows("tts");
    const models: TTSModel[] = [];
    for (const row of rows) {
      const id = String(row.model_type);
      const base = String(row.base_model_type ?? id);
      const capabilities = ["text_to_speech"];
      if (mediaRoles(row, "audio").includes("prompt")) capabilities.push("voice_cloning");
      if (["qwen3_tts_base", "omnivoice"].includes(base)) capabilities.push("reference_transcript");
      if (["qwen3_tts_customvoice", "index_tts2", "index_tts25"].includes(base)) capabilities.push("instruction_control");
      if (["qwen3_tts_voicedesign", "omnivoice"].includes(base)) capabilities.push("voice_design");
      const model: TTSModel = { id, name: String(row.name ?? id), provider: PROVIDER_IDS.WANGP };
      const modes = await this.modelModes(row);
      if (modes?.label === "speaker") {
        capabilities.push("preset_voice");
        model.voices = modes.values;
      } else if (modes?.label === "language") {
        capabilities.push("language_selection");
        model.languages = modes.values;
      }
      model.capabilities = capabilities;
      const adapter = this.adapter(row);
      if (adapter) model.adapter = adapter;
      models.push(model);
    }
    return models;
  }

  override async getAvailableMusicModels(): Promise<MusicModel[]> {
    const rows = await this.audioRows("music");
    return rows.map((row) => {
      const id = String(row.model_type);
      const adapter = this.adapter(row);
      return {
        id,
        name: String(row.name ?? id),
        provider: PROVIDER_IDS.WANGP,
        supportedTasks: ["text_to_music"],
        ...(adapter && { adapter })
      };
    });
  }

  /** Submit settings, follow the job, and return the first gallery item of `output`. */
  private async run(
    settings: Wan2GPRecord,
    output: "video" | "image" | "audio",
    options: { signal?: AbortSignal; timeoutSeconds?: number | null },
    media: (client: Wan2GPClient, settings: Wan2GPRecord) => Promise<void>
  ): Promise<{ data: Uint8Array; filename?: string }> {
    const timeoutMs = (options.timeoutSeconds ?? DEFAULT_TIMEOUT_SECONDS) * 1000;
    const result = await this.withClient(options.signal, async (client) => {
      await media(client, settings);
      const jobId = await client.submit(settings);
      const job = await client.pollUntilDone(jobId, {
        intervalMs: POLL_INTERVAL_MS,
        timeoutMs,
        signal: options.signal
      });
      const { item, data } = await client.downloadFirstOutput(job, [output]);
      return { data, filename: item.filename };
    });
    // A finished generation downloaded whatever the model lacked.
    if (!this.serverUrl) void markWan2GPModelAvailable(String(settings.model_type));
    return result;
  }

  /** Run one generation and return the bytes of its first gallery item. */
  private async generate(
    output: "video" | "image",
    params: GenerationParams,
    media: (client: Wan2GPClient, settings: Wan2GPRecord) => Promise<void>
  ): Promise<Uint8Array> {
    const settings = wan2gpBaseSettings(output, params);
    return (await this.run(settings, output, params, media)).data;
  }

  override async textToSpeechEncoded(args: TextToSpeechParams): Promise<EncodedAudioResult> {
    const modelType = args.model.trim();
    if (!modelType) throw new Wan2GPError("The request names no Wan2GP model.");
    if (!args.text.trim()) throw new Wan2GPError("Text to speech needs text.");
    const row = await this.row(modelType);
    const base = String(row?.base_model_type ?? modelType);
    const settings: Wan2GPRecord = { model_type: modelType, prompt: args.text };
    const altPrompt = args.referenceText ?? args.instructions;
    if (altPrompt) settings.alt_prompt = altPrompt;
    const mode = base === "qwen3_tts_customvoice" ? args.voice : args.language;
    if (mode) settings.model_mode = mode;
    if (args.speed !== undefined && base === "index_tts25") {
      settings.custom_settings = { speech_speed: args.speed };
    }
    const reference = args.referenceAudio;
    const { data, filename } = await this.run(settings, "audio", { signal: args.signal }, async (client, current) => {
      if (reference && reference.length > 0) {
        if (row && !mediaRoles(row, "audio").includes("prompt")) {
          throw new Wan2GPError(`Wan2GP model ${modelType} takes no reference voice.`);
        }
        current.audio_guide = await client.uploadMedia(wan2gpAudioFilename(reference), reference);
      }
    });
    return { data, mimeType: audioMime(filename) };
  }

  override async textToMusic(params: TextToMusicParams): Promise<EncodedAudioResult> {
    const modelType = params.model.id.trim();
    if (!modelType) throw new Wan2GPError("The request names no Wan2GP model.");
    const row = await this.row(modelType);
    const base = String(row?.base_model_type ?? modelType);
    const settings: Wan2GPRecord = { model_type: modelType };
    if (base.startsWith("stable_audio3")) {
      // Stable Audio takes the description as its prompt and sings nothing.
      settings.prompt = params.prompt;
    } else {
      settings.prompt = params.lyrics?.trim() || "[Instrumental]";
      settings.alt_prompt = params.prompt;
    }
    if (params.durationSeconds) settings.duration_seconds = params.durationSeconds;
    if (params.seed !== null && params.seed !== undefined) settings.seed = params.seed;
    const { data, filename } = await this.run(
      settings,
      "audio",
      { signal: params.signal, timeoutSeconds: params.timeoutSeconds },
      async () => undefined
    );
    return { data, mimeType: audioMime(filename) };
  }
  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    return this.generate("video", params, async () => undefined);
  }

  override async imageToVideo(image: Uint8Array, params: ImageToVideoParams): Promise<Uint8Array> {
    return this.generate("video", params, async (client, settings) => {
      settings.image_start = await uploadImage(client, image);
      if (params.endImage && params.endImage.length > 0) {
        settings.image_end = await uploadImage(client, params.endImage);
      }
    });
  }

  override async referenceToVideo(
    inputs: ReferenceToVideoInputs,
    params: ReferenceToVideoParams
  ): Promise<Uint8Array> {
    if (inputs.videos.length > 0 || (inputs.audios?.length ?? 0) > 0) {
      throw new Wan2GPError(
        "The wangp provider sends reference images only. Use the Wan2GP Generate node for video or audio inputs."
      );
    }
    const images = inputs.images.filter((image) => image.length > 0);
    if (images.length === 0) {
      throw new Wan2GPError("reference_to_video needs at least one reference image.");
    }
    return this.generate("video", params, async (client, settings) => {
      const refs: string[] = [];
      for (const image of images) refs.push(await uploadImage(client, image));
      settings.image_refs = refs;
    });
  }

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    return this.generate("image", params, async () => undefined);
  }

  override async imageToImage(images: Uint8Array[], params: ImageToImageParams): Promise<Uint8Array> {
    const sources = images.filter((image) => image.length > 0);
    if (sources.length === 0) throw new Wan2GPError("image must not be empty");
    return this.generate(
      "image",
      { ...params, width: params.targetWidth, height: params.targetHeight },
      async (client, settings) => {
        const modelType = String(settings.model_type);
        const metadata = await client.getModelCapabilities(modelType);
        const inputs = metadata.media_inputs;
        const roles =
          typeof inputs === "object" && inputs !== null && Array.isArray((inputs as Wan2GPRecord).image)
            ? ((inputs as Wan2GPRecord).image as unknown[]).map(String)
            : [];
        if (roles.includes("start")) {
          settings.image_start = await uploadImage(client, sources[0]);
        } else if (roles.includes("reference")) {
          const refs: string[] = [];
          for (const image of sources) refs.push(await uploadImage(client, image));
          settings.image_refs = refs;
        } else {
          throw new Wan2GPError(`Wan2GP model ${modelType} takes no input image.`);
        }
      }
    );
  }
}

function uploadImage(client: Wan2GPClient, image: Uint8Array): Promise<string> {
  return client.uploadMedia(wan2gpImageFilename(image), image);
}
