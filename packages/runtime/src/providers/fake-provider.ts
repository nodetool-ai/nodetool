import { getNodeBuiltinSync } from "@nodetool-ai/config";
import { BaseProvider, type ProviderCapability } from "./base-provider.js";

const _nodeCrypto = getNodeBuiltinSync<typeof import("node:crypto")>(
  "node:crypto"
);
const randomUUID = (): string => {
  if (_nodeCrypto?.randomUUID) return _nodeCrypto.randomUUID();
  const g = globalThis;
  if (g.crypto?.randomUUID) return g.crypto.randomUUID();
  return `id_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
};
import type {
  ASRResult,
  EncodedAudioResult,
  ImageTo3DParams,
  ImageToImageParams,
  ImageToVideoParams,
  LanguageModel,
  LipSyncParams,
  Message,
  MessageTextContent,
  ProviderStreamItem,
  ProviderTool,
  ReferenceToVideoInputs,
  ReferenceToVideoParams,
  RelightImageParams,
  RemoveBackgroundParams,
  StreamingAudioChunk,
  TextTo3DParams,
  TextToImageParams,
  TextToMusicParams,
  TextToVideoParams,
  ToolCall,
  UpscaleImageParams,
  VectorizeImageParams,
  VideoToVideoParams
} from "./types.js";

// ---------------------------------------------------------------------------
// Tiny but valid asset bytes for fake media generators.
// ---------------------------------------------------------------------------

/**
 * Minimal 1×1 transparent PNG. Sufficient for any consumer that just sniffs
 * the file signature or runs the bytes through `sharp` / Pillow / etc.
 */
const TINY_PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
  0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44, 0x41,
  0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
  0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
  0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
  0x42, 0x60, 0x82
]);

/**
 * Two seconds of 16×16 grey H.264 video at 4 fps with a silent AAC track,
 * made with `ffmpeg -f lavfi -i color=c=gray:s=16x16:d=2:r=4 -f lavfi -i
 * anullsrc`. It decodes, so a fake clip flows through ffmpeg-backed nodes
 * (concat, add audio, extract frame, timeline render) the way a provider's
 * clip would.
 */
const TINY_MP4 = Uint8Array.from(
  atob(
    "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" +
    "qXRvbwAAAB1kYXRhAAAAAQAAAABMYXZmNjAuMTYuMTAwAAAACGZyZWUAAAN6bWRhdAAAArAG" +
    "Bf//rNxF6b3m2Ui3lizYINkj7u94MjY0IC0gY29yZSAxNjQgcjMxMDggMzFlMTlmOSAtIEgu" +
    "MjY0L01QRUctNCBBVkMgY29kZWMgLSBDb3B5bGVmdCAyMDAzLTIwMjMgLSBodHRwOi8vd3d3" +
    "LnZpZGVvbGFuLm9yZy94MjY0Lmh0bWwgLSBvcHRpb25zOiBjYWJhYz0xIHJlZj0xNiBkZWJs" +
    "b2NrPTE6MDowIGFuYWx5c2U9MHgzOjB4MTMzIG1lPXVtaCBzdWJtZT0xMCBwc3k9MSBwc3lf" +
    "cmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTI0IGNocm9tYV9tZT0xIHRyZWxs" +
    "aXM9MiA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21h" +
    "X3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhy" +
    "ZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNv" +
    "bnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz04IGJfcHlyYW1pZD0yIGJfYWRhcHQ9MiBiX2Jp" +
    "YXM9MCBkaXJlY3Q9MyB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTEw" +
    "MDAga2V5aW50X21pbj00IHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhl" +
    "YWQ9NjAgcmM9Y3JmIG1idHJlZT0xIGNyZj01MS4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1h" +
    "eD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAACmWIgQACn/0aSUEA" +
    "AAAJQZoI7Ygh/9GA3gIATGF2YzYwLjMxLjEwMgACMEAOAAAACUGeEGcQS//sgQEYIAcBGCAH" +
    "AAAACQGeGCaIIf/ugAEYIAcBGCAHAAAACQGeGEaIIf/ugQEYIAcBGCAHAAAACQGeGI1IIf/u" +
    "gQEYIAcBGCAHAAAACQGeGK1IIf/ugQEYIAcBGCAHAAAACQGeGM1IIf/ugQEYIAcBGCAHARgg" +
    "BwEYIAcBGCAHARggBw=="
  ),
  (char) => char.charCodeAt(0)
);

/**
 * Tiny silent 24 kHz mono WAV (10 ms of zeros). Mirrors what the streaming
 * TTS path produces after `encodePcm16Wav` wraps the PCM samples.
 */
function tinyWav(): Uint8Array {
  const sampleRate = 24000;
  const numSamples = 240; // 10 ms
  const dataSize = numSamples * 2;
  const buf = new Uint8Array(44 + dataSize);
  const view = new DataView(buf.buffer);
  // RIFF header
  buf.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, 36 + dataSize, true);
  buf.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
  // fmt chunk
  buf.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // channels
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  // data chunk
  buf.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  view.setUint32(40, dataSize, true);
  return buf;
}

/**
 * Minimal GLB (binary glTF) header — version 2, contentLength 12. Real glTF
 * loaders fail on this, but consumers that just route bytes through never
 * notice.
 */
const TINY_GLB = new Uint8Array([
  0x67, 0x6c, 0x54, 0x46, 0x02, 0x00, 0x00, 0x00,
  0x0c, 0x00, 0x00, 0x00
]);

type CustomResponseFn = (
  messages: Message[],
  model: string
) => string | ToolCall[];

export interface FakeProviderOptions {
  textResponse?: string;
  toolCalls?: ToolCall[];
  shouldStream?: boolean;
  chunkSize?: number;
  customResponseFn?: CustomResponseFn;
  /**
   * When set, and the caller passes a non-empty `tools` array without
   * preset `toolCalls` or a `customResponseFn`, the provider emits this
   * many tool calls per declared tool on its FIRST call to either
   * `generateMessage` or `generateMessages`, then stops emitting tool
   * calls on later invocations of either method. The two methods share
   * the same burst counter so a `generateMessage` followed by a
   * `generateMessages` (or vice versa) yields one burst total.
   *
   * This lets tool-loop-style consumers (e.g. ListGenerator's `add_item`
   * loop, DataGenerator's `add_row` loop) exit cleanly instead of
   * hanging.
   *
   * Defaults to 3. Set to 0 to disable.
   */
  toolCallsPerTool?: number;
  /**
   * Optional builder for the args passed to auto-emitted tool calls.
   * Receives the tool name and the 0-based index within the burst. The
   * default builder returns plausible defaults for well-known tools:
   *   - `add_item`        → `{ item: "fake item N" }`
   *   - everything else   → `{}`
   */
  toolArgsBuilder?: (
    toolName: string,
    index: number
  ) => Record<string, unknown>;
}

function defaultToolArgs(
  toolName: string,
  index: number
) {
  switch (toolName) {
    case "add_item":
      return { item: `fake item ${index + 1}` };
    case "add_row":
      return { row: { id: index + 1, value: `fake row ${index + 1}` } };
    case "emit":
    case "emit_text":
      return { text: `fake text ${index + 1}` };
    default:
      return {};
  }
}

export class FakeProvider extends BaseProvider {
  textResponse: string;
  toolCalls: ToolCall[];
  shouldStream: boolean;
  chunkSize: number;
  customResponseFn: CustomResponseFn | null;
  toolCallsPerTool: number;
  toolArgsBuilder: (toolName: string, index: number) => Record<string, unknown>;
  /** Number of LLM invocations that have already auto-emitted tool calls. */
  private _toolBurstsEmitted = 0;

  callCount = 0;
  lastMessages: Message[] | null = null;
  lastModel: string | null = null;
  lastTools: ProviderTool[] = [];

  constructor(options: FakeProviderOptions = {}) {
    super("fake");
    this.textResponse =
      options.textResponse ?? "Hello, this is a fake response!";
    this.toolCalls = options.toolCalls ?? [];
    this.shouldStream = options.shouldStream ?? true;
    this.chunkSize = options.chunkSize ?? 10;
    this.customResponseFn = options.customResponseFn ?? null;
    this.toolCallsPerTool = options.toolCallsPerTool ?? 3;
    this.toolArgsBuilder = options.toolArgsBuilder ?? defaultToolArgs;
  }

  private autoToolCalls(tools: ProviderTool[]): ToolCall[] | null {
    if (
      this.toolCallsPerTool <= 0 ||
      tools.length === 0 ||
      this._toolBurstsEmitted > 0 ||
      this.toolCalls.length > 0 ||
      this.customResponseFn !== null
    ) {
      return null;
    }
    const calls: ToolCall[] = [];
    for (const t of tools) {
      for (let i = 0; i < this.toolCallsPerTool; i++) {
        calls.push({
          id: randomUUID(),
          name: t.name,
          args: this.toolArgsBuilder(t.name, i)
        });
      }
    }
    this._toolBurstsEmitted += 1;
    return calls;
  }

  private getResponse(messages: Message[], model: string): string | ToolCall[] {
    if (this.customResponseFn) {
      return this.customResponseFn(messages, model);
    }
    if (this.toolCalls.length > 0) {
      return this.toolCalls;
    }
    return this.textResponse;
  }

  resetCallCount(): void {
    this.callCount = 0;
  }

  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return [
      "upscale_image",
      "remove_background",
      "relight_image",
      "vectorize_image",
      "video_to_video",
      "lip_sync"
    ];
  }

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return [
      { id: "fake-model-v1", name: "Fake Model v1", provider: "fake" },
      { id: "fake-model-v2", name: "Fake Model v2", provider: "fake" },
      { id: "fake-fast-model", name: "Fake Fast Model", provider: "fake" }
    ];
  }

  async generateMessage(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
  }): Promise<Message> {
    this.callCount++;
    this.lastMessages = args.messages;
    this.lastModel = args.model;
    this.lastTools = args.tools ?? [];

    const auto = this.autoToolCalls(args.tools ?? []);
    if (auto) {
      return { role: "assistant", content: [], toolCalls: auto };
    }

    const response = this.getResponse(args.messages, args.model);

    if (Array.isArray(response)) {
      return { role: "assistant", content: [], toolCalls: response };
    }
    const content: MessageTextContent[] = [{ type: "text", text: response }];
    return { role: "assistant", content };
  }

  async *generateMessages(args: {
    messages: Message[];
    model: string;
    tools?: ProviderTool[];
    maxTokens?: number;
    temperature?: number;
    topP?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    audio?: Record<string, unknown>;
  }): AsyncGenerator<ProviderStreamItem> {
    this.callCount++;
    this.lastMessages = args.messages;
    this.lastModel = args.model;
    this.lastTools = args.tools ?? [];

    const auto = this.autoToolCalls(args.tools ?? []);
    if (auto) {
      for (const call of auto) yield call;
      return;
    }

    const response = this.getResponse(args.messages, args.model);

    if (Array.isArray(response)) {
      for (const toolCall of response) {
        yield toolCall;
      }
      return;
    }

    if (this.shouldStream && response.length > this.chunkSize) {
      for (let i = 0; i < response.length; i += this.chunkSize) {
        const chunkText = response.slice(i, i + this.chunkSize);
        const done = i + this.chunkSize >= response.length;
        yield {
          type: "chunk",
          content: chunkText,
          done,
          content_type: "text"
        };
      }
    } else {
      yield {
        type: "chunk",
        content: response,
        done: true,
        content_type: "text"
      };
    }
  }

  // -------------------------------------------------------------------------
  // Media-generation capabilities
  //
  // Each method returns the smallest possible "valid-enough" payload for the
  // requested format so downstream nodes can mime-sniff / route the bytes
  // without performing a real decode. The point is to satisfy the contract
  // of the surrounding workflow node, not to produce media a user can play.
  // -------------------------------------------------------------------------

  override async textToImage(_params: TextToImageParams): Promise<Uint8Array> {
    this.callCount++;
    return new Uint8Array(TINY_PNG);
  }

  override async imageToImage(
    _images: Uint8Array[],
    _params: ImageToImageParams
  ): Promise<Uint8Array> {
    this.callCount++;
    return new Uint8Array(TINY_PNG);
  }

  override async upscaleImage(
    _image: Uint8Array,
    _params: UpscaleImageParams
  ): Promise<Uint8Array> {
    this.callCount++;
    return new Uint8Array(TINY_PNG);
  }

  override async removeBackground(
    _image: Uint8Array,
    _params: RemoveBackgroundParams
  ): Promise<Uint8Array> {
    this.callCount++;
    return new Uint8Array(TINY_PNG);
  }

  override async relightImage(
    _image: Uint8Array,
    _params: RelightImageParams
  ): Promise<Uint8Array> {
    this.callCount++;
    return new Uint8Array(TINY_PNG);
  }

  override async vectorizeImage(
    _image: Uint8Array,
    _params: VectorizeImageParams
  ): Promise<Uint8Array> {
    this.callCount++;
    // Bare-minimum SVG; consumers either route bytes or parse XML.
    return new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>'
    );
  }

  override async textToVideo(_params: TextToVideoParams): Promise<Uint8Array> {
    this.callCount++;
    return new Uint8Array(TINY_MP4);
  }

  override async imageToVideo(
    _image: Uint8Array,
    _params: ImageToVideoParams
  ): Promise<Uint8Array> {
    this.callCount++;
    return new Uint8Array(TINY_MP4);
  }

  override async referenceToVideo(
    _inputs: ReferenceToVideoInputs,
    _params: ReferenceToVideoParams
  ): Promise<Uint8Array> {
    this.callCount++;
    return new Uint8Array(TINY_MP4);
  }

  override async videoToVideo(
    _video: Uint8Array,
    _params: VideoToVideoParams
  ): Promise<Uint8Array> {
    this.callCount++;
    return new Uint8Array(TINY_MP4);
  }

  override async lipSync(
    _video: Uint8Array,
    _params: LipSyncParams
  ): Promise<Uint8Array> {
    this.callCount++;
    return new Uint8Array(TINY_MP4);
  }

  override async *textToSpeech(_args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
    audioFormat?: string;
  }): AsyncGenerator<StreamingAudioChunk> {
    this.callCount++;
    yield { samples: new Int16Array(240), sampleRate: 24000 };
  }

  override async textToSpeechEncoded(_args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
    audioFormat?: string;
  }): Promise<{ data: Uint8Array; mimeType: string } | null> {
    this.callCount++;
    return { data: tinyWav(), mimeType: "audio/wav" };
  }

  override async textToMusic(
    _params: TextToMusicParams
  ): Promise<EncodedAudioResult> {
    this.callCount++;
    return { data: tinyWav(), mimeType: "audio/wav" };
  }

  override async automaticSpeechRecognition(_args: {
    audio: Uint8Array;
    model: string;
    language?: string;
    prompt?: string;
    temperature?: number;
    word_timestamps?: boolean;
  }): Promise<ASRResult> {
    this.callCount++;
    return { text: "fake transcript", chunks: [] };
  }

  override async generateEmbedding(args: {
    text: string | string[];
    model: string;
    dimensions?: number;
  }): Promise<number[][]> {
    this.callCount++;
    const dims = args.dimensions ?? 8;
    const items = Array.isArray(args.text) ? args.text : [args.text];
    // Deterministic small vector per input for stable test snapshots.
    return items.map((s, idx) =>
      Array.from({ length: dims }, (_, d) =>
        ((s.length + idx + d) % 7) / 10
      )
    );
  }

  override async textTo3D(_params: TextTo3DParams): Promise<Uint8Array> {
    this.callCount++;
    return new Uint8Array(TINY_GLB);
  }

  override async imageTo3D(
    _image: Uint8Array,
    _params: ImageTo3DParams
  ): Promise<Uint8Array> {
    this.callCount++;
    return new Uint8Array(TINY_GLB);
  }
}

export function createFakeToolCall(
  name: string,
  args?: Record<string, unknown>,
  callId?: string
): ToolCall {
  return {
    id: callId ?? randomUUID(),
    name,
    args: args ?? {}
  };
}

export function createSimpleFakeProvider(
  responseText = "Test response"
): FakeProvider {
  return new FakeProvider({ textResponse: responseText, shouldStream: false });
}

export function createStreamingFakeProvider(
  responseText = "This is a streaming test response",
  chunkSize = 5
): FakeProvider {
  return new FakeProvider({
    textResponse: responseText,
    shouldStream: true,
    chunkSize
  });
}

export function createToolCallingFakeProvider(
  toolCalls: ToolCall[]
): FakeProvider {
  return new FakeProvider({ toolCalls });
}
