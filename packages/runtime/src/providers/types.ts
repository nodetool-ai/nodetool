import type { Chunk, ProviderId, ProviderSession } from "@nodetool-ai/protocol";

// Provider identifiers are owned by @nodetool-ai/protocol (the base dependency
// for the whole monorepo). Re-exported here so existing runtime importers keep
// resolving `ProviderId`/`PROVIDER_IDS` from `./types.js`.
export { PROVIDER_IDS } from "@nodetool-ai/protocol";
export type { ProviderId };
// `ProviderSession` is the cross-provider continuation token. It lives in
// @nodetool-ai/protocol so the persistence layer (@nodetool-ai/models) can
// import it without taking a dependency on runtime; re-exported here for
// providers and the chat pipeline.
export type { ProviderSession };

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
  /**
   * Per-model output-size constraints derived from the provider manifest's
   * enum fields (e.g. FAL's image_size / aspect_ratio). When present the
   * picker offers only these values so users can't request a ratio the
   * endpoint will silently ignore.
   */
  aspectRatios?: string[];
  resolutions?: string[];
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

export interface MusicModel {
  id: string;
  name: string;
  provider: ProviderId;
  /** Capability hints, e.g. `["text_to_music"]`. */
  supportedTasks?: string[];
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
  _anthropicThinkingBlocks?: AnthropicThinkingBlock[];
}

export type AnthropicThinkingBlock =
  | { type: "thinking"; thinking: string; signature: string }
  | { type: "redacted_thinking"; data: string };

export type ProviderThinkingDisplay = "summarized" | "omitted";

export type ProviderThinkingConfig =
  | {
      type: "adaptive";
      display?: ProviderThinkingDisplay;
    }
  | {
      type: "manual";
      budgetTokens: number;
      display?: ProviderThinkingDisplay;
    }
  | {
      type: "disabled";
    };

export type ProviderEffort = "low" | "medium" | "high" | "xhigh" | "max";

export interface ProviderCacheControl {
  type: "ephemeral";
  ttl?: "5m" | "1h";
}

export type ProviderToolCaller =
  | "direct"
  | "code_execution_20250825"
  | "code_execution_20260120"
  | "code_execution_20260521";

/**
 * Canonical name for the web-search tool. Providers with a built-in web search
 * (`supportsNativeWebSearch`) render a tool with this name as their native
 * server-side search instead of a function call; everyone else falls back to
 * the SerpAPI-backed `WebSearchTool`.
 */
export const WEB_SEARCH_TOOL_NAME = "web_search";

/**
 * Canonical name for the image-generation tool. Providers with a built-in,
 * server-side image generator (`supportsNativeImageGeneration`, e.g. the
 * OpenAI Responses `image_generation` tool) render a tool with this name as
 * their native tool: the generated image arrives inside the model turn as an
 * `image_generation_call` output item — there is no function-call round-trip —
 * and the provider surfaces it as image content on the assistant message.
 * Providers without native support fall back to a function tool that calls
 * `textToImage`/`imageToImage`.
 */
export const IMAGE_GENERATION_TOOL_NAME = "image_generation";

export interface ProviderTool {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
  inputExamples?: Record<string, unknown>[];
  cacheControl?: ProviderCacheControl;
  strict?: boolean;
  deferLoading?: boolean;
  allowedCallers?: ProviderToolCaller[];
  type?: "function" | "code_interpreter";
  /**
   * Optional self-contained executor for this tool. When present,
   * {@link BaseProvider.generateLoop} (and the Claude Agent SDK MCP handlers)
   * dispatch the tool call to `execute` directly, instead of routing it through
   * the harness-supplied `executeTool` callback. Returns the result fed back to
   * the model — plain text, or {@link MessageContent} blocks for results that
   * carry images. Tools without `execute` still flow through `executeTool`.
   */
  execute?: (
    args: Record<string, unknown>,
    toolCallId?: string
  ) => Promise<string | MessageContent[]>;
  /**
   * When `true`, the agentic loop ends after this tool runs: `generateLoop`
   * finishes emitting the current turn's results, then stops iterating (and the
   * Claude Agent SDK loop is aborted). Use for tools that signal completion
   * (e.g. a `finish`/`submit` tool). Defaults to falsy (loop continues).
   */
  terminal?: boolean;
}

export interface MessageTextContent {
  type: "text";
  text: string;
  citations?: MessageCitation[];
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

export interface MessageDocumentContent {
  type: "document";
  document: {
    uri?: string;
    data?: Uint8Array | string;
    mimeType?: string;
    title?: string;
  };
  citations?: boolean;
  context?: string;
}

interface MessageDocumentCitationBase {
  citedText: string;
  documentIndex: number;
  documentTitle?: string | null;
  fileId?: string | null;
}

export interface MessageCharCitation extends MessageDocumentCitationBase {
  type: "char_location";
  startCharIndex: number;
  endCharIndex: number;
}

export interface MessagePageCitation extends MessageDocumentCitationBase {
  type: "page_location";
  startPageNumber: number;
  endPageNumber: number;
}

export interface MessageContentBlockCitation extends MessageDocumentCitationBase {
  type: "content_block_location";
  startBlockIndex: number;
  endBlockIndex: number;
}

export interface MessageWebSearchCitation {
  type: "web_search_result_location";
  citedText: string;
  encryptedIndex: string;
  url: string;
  title?: string | null;
}

export interface MessageSearchResultCitation {
  type: "search_result_location";
  citedText: string;
  searchResultIndex: number;
  source: string;
  title?: string | null;
  startBlockIndex: number;
  endBlockIndex: number;
}

export type MessageCitation =
  | MessageCharCitation
  | MessagePageCitation
  | MessageContentBlockCitation
  | MessageWebSearchCitation
  | MessageSearchResultCitation;

export type MessageContent =
  | MessageTextContent
  | MessageImageContent
  | MessageAudioContent
  | MessageDocumentContent;

export interface ProviderToolErrorResult {
  content: string | MessageContent[];
  isError: true;
}

export type ProviderToolResult =
  | string
  | MessageContent[]
  | ProviderToolErrorResult;

export function isProviderToolErrorResult(
  result: ProviderToolResult
): result is ProviderToolErrorResult {
  return (
    typeof result === "object" &&
    !Array.isArray(result) &&
    result.isError === true
  );
}

export interface Message {
  role: "system" | "user" | "assistant" | "tool";
  content?: string | MessageContent[] | null;
  toolCalls?: ToolCall[] | null;
  toolCallId?: string | null;
  isError?: boolean;
  threadId?: string | null;
  /** Provider-specific raw parts to echo back (e.g., Gemini thought parts). */
  _rawGeminiParts?: unknown[];
  _anthropicThinkingBlocks?: AnthropicThinkingBlock[];
}

/**
 * A reusable entity (character, prop, location, style) riding along with a
 * generation call for cross-shot consistency. Any provider consumer — nodes,
 * the chat WebSocket, CLI — can attach these to the params; {@link BaseProvider}
 * expands them centrally before the concrete provider runs: the descriptor
 * joins the prompt as a `Consistency references:` block, and on image-editing
 * tasks the reference image bytes are appended to the source-image list.
 */
export interface EntityReference {
  /** Display name, referenced from the prompt text. */
  name: string;
  /** Canonical visual descriptor injected into the prompt. */
  descriptor?: string | null;
  /** Encoded reference image bytes (routed to image inputs on editing tasks). */
  image?: Uint8Array | null;
}

export interface TextToImageParams {
  model: ImageModel;
  prompt: string;
  /** Consistency entities; descriptors join the prompt (t2i takes no images). */
  entities?: EntityReference[] | null;
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
  /**
   * Cancellation for the upstream request. Providers that can abort their
   * transport honor it; the rest ignore it (the caller still discards the
   * result). Optional so provider implementations opt in individually.
   */
  signal?: AbortSignal;
}

export interface ImageToImageParams {
  model: ImageModel;
  prompt: string;
  /**
   * Consistency entities; descriptors join the prompt and reference images are
   * appended to the source-image list (after the caller's own images).
   */
  entities?: EntityReference[] | null;
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
  /**
   * Cancellation for the upstream request. Providers that can abort their
   * transport honor it; the rest ignore it (the caller still discards the
   * result). Optional so provider implementations opt in individually.
   */
  signal?: AbortSignal;
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

/**
 * Generate music / instrumental audio from a text prompt. Mirrors the
 * `TextTo<Media>Params` pattern. Music providers return a fully-encoded audio
 * file (mp3/wav/flac), so {@link BaseProvider.textToMusic} resolves to an
 * {@link EncodedAudioResult} rather than raw PCM samples.
 */
export interface TextToMusicParams {
  model: MusicModel;
  /** Free-text description of the desired music (style, mood, instruments). */
  prompt: string;
  /** Optional song lyrics for vocal models (e.g. Suno, ACE-Step, MiniMax). */
  lyrics?: string | null;
  /** Requested duration in seconds (providers clamp to their own limits). */
  durationSeconds?: number | null;
  seed?: number | null;
  /** Requested output container hint (e.g. "mp3", "wav"). */
  audioFormat?: string | null;
  /** Per-call timeout. Providers translate this into a max polling window. */
  timeoutSeconds?: number | null;
}

export interface TextToVideoParams {
  model: VideoModel;
  prompt: string;
  /** Consistency entities; descriptors join the prompt (text-only for video). */
  entities?: EntityReference[] | null;
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
  /**
   * Cancellation for the upstream request. Providers that can abort their
   * transport honor it; the rest ignore it (the caller still discards the
   * result). Optional so provider implementations opt in individually.
   */
  signal?: AbortSignal;
}

export interface ImageToVideoParams {
  model: VideoModel;
  prompt?: string | null;
  /**
   * Consistency entities; descriptors join the prompt. Images are NOT appended
   * here — the image list's first frame drives the animation, so extra images
   * would change its meaning.
   */
  entities?: EntityReference[] | null;
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
  /**
   * Cancellation for the upstream request. Providers that can abort their
   * transport honor it; the rest ignore it (the caller still discards the
   * result). Optional so provider implementations opt in individually.
   */
  signal?: AbortSignal;
}

/**
 * Transform an existing video into a restyled / edited video, guided by a
 * prompt (e.g. style transfer, motion restyle). Mirrors `ImageToImageParams`
 * for the video domain.
 */
export interface VideoToVideoParams {
  model: VideoModel;
  prompt?: string | null;
  /** Consistency entities; descriptors join the prompt (text-only for video). */
  entities?: EntityReference[] | null;
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

/**
 * Internal-only stream item carrying a session-continuity update. It is NOT a
 * wire message — the chat pipeline consumes it to persist the continuation
 * token onto the assistant message, and never forwards it to clients. A
 * provider emits one per turn once it has captured/refreshed its session.
 */
export interface ProviderSessionUpdate {
  type: "session";
  session: ProviderSession;
}

/**
 * A finalized conversation message produced during an agentic loop
 * ({@link BaseProvider.generateLoop}) — an assistant turn (text + tool calls) or
 * a tool result. The harness persists/collects these; live text still arrives
 * as {@link Chunk}s for incremental display. Not a wire message.
 */
export interface ProviderMessageEvent {
  type: "message";
  message: Message;
}

export type ProviderStreamItem =
  | Chunk
  | ToolCall
  | ProviderSessionUpdate
  | ProviderMessageEvent;

/**
 * Narrow a stream item to a {@link ProviderSessionUpdate}. `Chunk` carries
 * `type: "chunk"` and `ToolCall` has no `type`, so a `type === "session"` check
 * is unambiguous. Existing loops that only switch on chunk/tool-call ignore it.
 */
export function isProviderSessionUpdate(
  item: ProviderStreamItem
): item is ProviderSessionUpdate {
  return (
    typeof item === "object" &&
    item !== null &&
    "type" in item &&
    (item as { type?: unknown }).type === "session"
  );
}

/** Narrow a stream item to a {@link ProviderMessageEvent}. */
export function isProviderMessageEvent(
  item: ProviderStreamItem
): item is ProviderMessageEvent {
  return (
    typeof item === "object" &&
    item !== null &&
    "type" in item &&
    (item as { type?: unknown }).type === "message"
  );
}

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
