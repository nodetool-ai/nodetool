import type { Chunk, ProviderId } from "@nodetool-ai/protocol";

// Provider identifiers are owned by @nodetool-ai/protocol (the base dependency
// for the whole monorepo). Re-exported here so existing runtime importers keep
// resolving `ProviderId`/`PROVIDER_IDS` from `./types.js`.
export { PROVIDER_IDS } from "@nodetool-ai/protocol";
export type { ProviderId };

export interface LanguageModel {
  id: string;
  name: string;
  provider: ProviderId;
}

export interface ImageModel {
  id: string;
  name: string;
  provider: ProviderId;
  supportedTasks?: string[];
}

export interface VideoModel {
  id: string;
  name: string;
  provider: ProviderId;
  supportedTasks?: string[];
  /**
   * Per-model option constraints derived from the provider manifest's enum
   * fields. When present the composer offers only these values (e.g. a model
   * that only supports 5s/10s clips), avoiding 422s from unsupported params.
   */
  durations?: number[];
  resolutions?: string[];
  aspectRatios?: string[];
}

export interface TTSModel {
  id: string;
  name: string;
  provider: ProviderId;
  voices?: string[];
}

export interface ASRModel {
  id: string;
  name: string;
  provider: ProviderId;
}

export interface AudioChunk {
  timestamp: [number, number];
  text: string;
}

export interface ASRResult {
  text: string;
  chunks?: AudioChunk[];
}

export interface EmbeddingModel {
  id: string;
  name: string;
  provider: ProviderId;
  dimensions?: number;
}

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  thought_signature?: string;
  /** Raw Gemini parts to echo back (preserves thought content). */
  _rawGeminiParts?: unknown[];
}

export interface ProviderTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  type?: "function" | "code_interpreter";
}

export interface MessageTextContent {
  type: "text";
  text: string;
}

export interface MessageImageContent {
  type: "image_url";
  image: {
    uri?: string;
    data?: Uint8Array | string;
    mimeType?: string;
  };
}

export interface MessageAudioContent {
  type: "audio";
  audio: {
    uri?: string;
    data?: Uint8Array | string;
    mimeType?: string;
  };
}

export type MessageContent =
  | MessageTextContent
  | MessageImageContent
  | MessageAudioContent;

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | MessageContent[] | null;
  toolCalls?: ToolCall[] | null;
  toolCallId?: string | null;
  threadId?: string | null;
  /** Provider-specific raw parts to echo back (e.g., Gemini thought parts). */
  _rawGeminiParts?: unknown[];
}

export interface TextToImageParams {
  model: ImageModel;
  prompt: string;
  negativePrompt?: string | null;
  width?: number;
  height?: number;
  aspectRatio?: string | null;
  resolution?: string | null;
  quality?: string | null;
  guidanceScale?: number | null;
  numInferenceSteps?: number | null;
  seed?: number | null;
  scheduler?: string | null;
  safetyCheck?: boolean | null;
}

export interface ImageToImageParams {
  model: ImageModel;
  prompt: string;
  negativePrompt?: string | null;
  targetWidth?: number | null;
  targetHeight?: number | null;
  aspectRatio?: string | null;
  resolution?: string | null;
  quality?: string | null;
  guidanceScale?: number | null;
  numInferenceSteps?: number | null;
  strength?: number | null;
  seed?: number | null;
  scheduler?: string | null;
}

/**
 * Inpaint (mask-guided edit): regenerate the masked region of one or more
 * source images according to a prompt. Identical to {@link ImageToImageParams}
 * but the `mask` is required — endpoints are selected and routed by their
 * declared mask field. White pixels in the mask mark the region to regenerate.
 */
export interface InpaintingParams extends ImageToImageParams {
  /** Mask image — white pixels indicate the region to regenerate. */
  mask: Uint8Array;
}

/**
 * Increase the resolution / detail of an image. Some upscalers (e.g. Clarity,
 * Magic Refiner) accept a guiding `prompt` and `creativity` to hallucinate
 * detail; pure ESRGAN-style models ignore them.
 */
export interface UpscaleImageParams {
  model: ImageModel;
  /** Target magnification factor, e.g. 2 or 4. */
  scale?: number | null;
  prompt?: string | null;
  /** 0–1 hint for how much new detail the model may invent. */
  creativity?: number | null;
  seed?: number | null;
}

/** Remove the background from an image, returning an image with alpha. */
export interface RemoveBackgroundParams {
  model: ImageModel;
}

/**
 * Re-light a subject according to a text prompt and/or a background reference.
 */
export interface RelightImageParams {
  model: ImageModel;
  prompt?: string | null;
  negativePrompt?: string | null;
  seed?: number | null;
}

/** Convert a raster image into a vector (SVG) representation. */
export interface VectorizeImageParams {
  model: ImageModel;
}

export interface TextToVideoParams {
  model: VideoModel;
  prompt: string;
  negativePrompt?: string | null;
  numFrames?: number | null;
  /** Requested duration in seconds (provider decides fps). */
  durationSeconds?: number | null;
  aspectRatio?: string | null;
  resolution?: string | null;
  guidanceScale?: number | null;
  numInferenceSteps?: number | null;
  seed?: number | null;
  /** Per-call timeout. Providers translate this into a max polling window. */
  timeoutSeconds?: number | null;
}

export interface ImageToVideoParams {
  model: VideoModel;
  prompt?: string | null;
  negativePrompt?: string | null;
  numFrames?: number | null;
  /** Requested duration in seconds (provider decides fps). */
  durationSeconds?: number | null;
  aspectRatio?: string | null;
  resolution?: string | null;
  guidanceScale?: number | null;
  numInferenceSteps?: number | null;
  seed?: number | null;
  /** Per-call timeout. Providers translate this into a max polling window. */
  timeoutSeconds?: number | null;
}

/**
 * Transform an existing video into a restyled / edited video, guided by a
 * prompt (e.g. style transfer, motion restyle). Mirrors `ImageToImageParams`
 * for the video domain.
 */
export interface VideoToVideoParams {
  model: VideoModel;
  prompt?: string | null;
  negativePrompt?: string | null;
  strength?: number | null;
  durationSeconds?: number | null;
  resolution?: string | null;
  seed?: number | null;
}

/**
 * Drive a face in a video (or still image) to match speech in an audio track.
 * The primary visual is passed positionally to `lipSync`; the `audio` bytes
 * ride along in the params.
 */
export interface LipSyncParams {
  model: VideoModel;
  /** Encoded audio bytes (e.g. WAV/MP3) the mouth motion should follow. */
  audio: Uint8Array;
  seed?: number | null;
}

export type ProviderStreamItem = Chunk | ToolCall;

export interface StreamingAudioChunk {
  samples: Int16Array;
  /** Sample rate in Hz. Defaults to 24000 when omitted. */
  sampleRate?: number;
}

/**
 * Returned by providers that produce fully-encoded audio (e.g. FLAC, WAV)
 * rather than raw PCM samples.
 */
export interface EncodedAudioResult {
  data: Uint8Array;
  mimeType: string;
}

/**
 * Describes an AI **generation model** that produces 3D assets (e.g. Meshy's
 * `meshy-4`, Rodin's `rodin-regular`). This is the model **used to generate**
 * a 3D asset, not the asset itself — the asset is represented by `Model3DRef`
 * elsewhere in the codebase.
 *
 * Mirrors the `<MediaType>Model` pattern (`ImageModel`, `VideoModel`,
 * `TTSModel`, `ASRModel`, `EmbeddingModel`).
 */
export interface Model3D {
  id: string;
  name: string;
  provider: ProviderId;
  /** Capability hints, e.g. `["text_to_3d"]`, `["image_to_3d"]`, or both. */
  supportedTasks?: string[];
  /** File formats the model can emit, e.g. `["glb", "obj", "fbx"]`. */
  outputFormats?: string[];
}

export interface TextTo3DParams {
  model: Model3D;
  prompt: string;
  negativePrompt?: string | null;
  artStyle?: string | null;
  outputFormat?: string;
  seed?: number | null;
  /** Per-call timeout. Providers translate this into max polling attempts. */
  timeoutSeconds?: number | null;
  /**
   * When `true`, providers that support a separate texture/refine pass will
   * run it after shape generation, embedding PBR textures into the output GLB.
   * Defaults to `undefined` (= no refine) to preserve backward compatibility.
   * Meshy text-to-3D supports this; Rodin and image-to-3D providers ignore it.
   */
  enableTextures?: boolean;
}

export interface ImageTo3DParams {
  model: Model3D;
  prompt?: string | null;
  outputFormat?: string;
  seed?: number | null;
  /** Per-call timeout. Providers translate this into max polling attempts. */
  timeoutSeconds?: number | null;
}
