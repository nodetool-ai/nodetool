import type { Chunk } from "@nodetool/protocol";

export type ProviderId =
  | "openai"
  | "anthropic"
  | "ollama"
  | "llama_cpp"
  | string;

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
  type: "image";
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
  quality?: string | null;
  guidanceScale?: number | null;
  numInferenceSteps?: number | null;
  strength?: number | null;
  seed?: number | null;
  scheduler?: string | null;
}

export interface TextToVideoParams {
  model: VideoModel;
  prompt: string;
  negativePrompt?: string | null;
  numFrames?: number | null;
  aspectRatio?: string | null;
  resolution?: string | null;
  guidanceScale?: number | null;
  numInferenceSteps?: number | null;
  seed?: number | null;
}

export interface ImageToVideoParams {
  model: VideoModel;
  prompt?: string | null;
  negativePrompt?: string | null;
  numFrames?: number | null;
  aspectRatio?: string | null;
  resolution?: string | null;
  guidanceScale?: number | null;
  numInferenceSteps?: number | null;
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

export interface Model3D {
  id: string;
  name: string;
  provider: ProviderId;
  supportedTasks?: string[];
}

export interface TextTo3DParams {
  model: Model3D;
  prompt: string;
  negativePrompt?: string | null;
  artStyle?: string | null;
  outputFormat?: string;
  seed?: number | null;
}

export interface ImageTo3DParams {
  model: Model3D;
  prompt?: string | null;
  outputFormat?: string;
  seed?: number | null;
}
