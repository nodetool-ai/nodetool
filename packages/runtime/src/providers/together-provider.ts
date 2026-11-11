import { safeFetch } from "./safe-url.js";
import {
  postTogetherJson,
  togetherImage,
  togetherSpeech
} from "./together-operations.js";
import { recordGenerationReceiptAsync } from "../generation-receipt.js";
import {
  OpenAICompatProvider,
  type OpenAICompatProviderOptions
} from "./openai-compat-provider.js";
import { loadImageModels, loadVideoModels } from "./manifest-models.js";
import { bytesToImageDataUri } from "./image-mime.js";
import type {
  ASRModel,
  EmbeddingModel,
  EncodedAudioResult,
  ImageModel,
  ImageToImageParams,
  ImageToVideoParams,
  LanguageModel,
  StreamingAudioChunk,
  TextToImageParams,
  TextToVideoParams,
  TTSModel,
  VideoModel
} from "./types.js";
import type {
  EndpointCallRequest,
  EndpointCallResult,
  EndpointProgress,
  ProviderCapability
} from "./base-provider.js";

/**
 * The endpoint families `callEndpoint` accepts as `route`:
 *
 *   - `images`               → POST /v1/images/generations (JSON)
 *   - `audio/speech`         → POST /v1/audio/speech (JSON in, audio bytes out)
 *   - `audio/transcriptions` → POST /v1/audio/transcriptions (multipart)
 *   - `videos`               → POST /v2/videos, then poll GET /v2/videos/{id}
 */
const TOGETHER_ENDPOINT_ROUTES = [
  "images",
  "audio/speech",
  "audio/transcriptions",
  "videos"
] as const;

type TogetherEndpointRoute = (typeof TOGETHER_ENDPOINT_ROUTES)[number];

function isEndpointRoute(route: string): route is TogetherEndpointRoute {
  return (TOGETHER_ENDPOINT_ROUTES as readonly string[]).includes(route);
}

/** The `id` of a Together reply, when it carries one. */
function replyId(payload: unknown): string | null {
  return typeof payload === "object" &&
    payload !== null &&
    "id" in payload &&
    typeof payload.id === "string" &&
    payload.id
    ? payload.id
    : null;
}

// ─── Model catalogs ───────────────────────────────────────────────────────────

const TOGETHER_MANIFEST_PKG = "@nodetool-ai/together-nodes";
const TOGETHER_MANIFEST_PATH = "together-manifest.json";

const TOGETHER_TTS_MODELS: TTSModel[] = [
  {
    id: "canopylabs/orpheus-3b-0.1-ft",
    name: "Orpheus 3B",
    provider: "together",
    voices: ["tara", "leah", "jess", "leo", "dan", "mia", "zac", "zoe"]
  },
  {
    id: "hexgrad/Kokoro-82M",
    name: "Kokoro 82M",
    provider: "together",
    voices: [
      "af_heart",
      "af_alloy",
      "af_aoede",
      "af_bella",
      "af_jessica",
      "af_kore",
      "af_nicole",
      "af_nova",
      "af_river",
      "af_sarah",
      "af_sky",
      "am_adam",
      "am_echo",
      "am_eric",
      "am_fenrir",
      "am_liam",
      "am_michael",
      "am_onyx",
      "am_puck",
      "am_santa",
      "bf_alice",
      "bf_emma",
      "bf_isabella",
      "bf_lily",
      "bm_daniel",
      "bm_fable",
      "bm_george",
      "bm_lewis"
    ]
  },
  {
    id: "cartesia/sonic",
    name: "Cartesia Sonic",
    provider: "together",
    voices: [
      "friendly sidekick",
      "reading lady",
      "newsman",
      "meditation lady",
      "calm lady",
      "helpful woman",
      "laidback woman",
      "professional woman"
    ]
  }
];

const TOGETHER_ASR_MODELS: ASRModel[] = [
  {
    id: "openai/whisper-large-v3",
    name: "Whisper Large v3",
    provider: "together"
  },
  {
    id: "mistralai/Voxtral-Mini-3B-2507",
    name: "Voxtral Mini 3B",
    provider: "together"
  },
  {
    id: "nvidia/parakeet-tdt-0.6b-v3",
    name: "Parakeet TDT 0.6B v3",
    provider: "together"
  }
];

const TOGETHER_EMBEDDING_MODELS: EmbeddingModel[] = [
  {
    id: "intfloat/multilingual-e5-large-instruct",
    name: "Multilingual E5 Large",
    provider: "together",
    dimensions: 1024
  }
];

// ─── WAV header parser ────────────────────────────────────────────────────────

/**
 * Extract raw PCM Int16 samples and the sample rate from a WAV buffer.
 * Handles non-standard chunk ordering by scanning for the "fmt " and "data"
 * chunks rather than assuming a fixed 44-byte header.
 */
function parseWavPCM(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sampleRate = 24000; // Together's default sample rate for Orpheus/Kokoro (24 kHz)
  let offset = 12; // Skip "RIFF", file-size, "WAVE"

  while (offset + 8 <= bytes.byteLength) {
    // Chunk IDs are ASCII — read as big-endian uint32 to compare with literals
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true);

    if (
      chunkId === 0x666d7420 /* "fmt " */ &&
      offset + 16 <= bytes.byteLength
    ) {
      // The sampleRate read is a 4-byte uint32 at offset+12, so it needs
      // offset+16 in bounds — the previous offset+12 guard let getUint32 throw
      // RangeError on a WAV truncated between offset+12 and offset+15.
      sampleRate = view.getUint32(offset + 12, true);
    } else if (chunkId === 0x64617461 /* "data" */) {
      const dataStart = offset + 8;
      const dataEnd = Math.min(dataStart + chunkSize, bytes.byteLength);
      const pcmBytes = bytes.slice(dataStart, dataEnd);
      return {
        samples: new Int16Array(
          pcmBytes.buffer,
          pcmBytes.byteOffset,
          Math.floor(pcmBytes.byteLength / 2)
        ),
        sampleRate
      };
    }

    const advance = 8 + chunkSize + (chunkSize % 2 === 0 ? 0 : 1);
    // Guard against malformed chunk sizes that would loop forever
    if (advance > bytes.byteLength - offset) break;
    offset += advance;
  }

  // Fallback: assume standard 44-byte PCM header if "data" chunk was not found
  const pcmBytes = bytes.slice(44);
  return {
    samples: new Int16Array(
      pcmBytes.buffer,
      pcmBytes.byteOffset,
      Math.floor(pcmBytes.byteLength / 2)
    ),
    sampleRate
  };
}

// ─── Abortable sleep ──────────────────────────────────────────────────────────

/** Resolve the abort reason as an Error (mirrors the gemini provider). */
function abortError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error ? signal.reason : new Error("Aborted");
}

/** Sleep that rejects promptly when `signal` aborts instead of running full. */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError(signal));
      return;
    }
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(abortError(signal));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class TogetherProvider extends OpenAICompatProvider {
  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return [
      "text_to_image",
      "image_to_image",
      "text_to_video",
      "image_to_video",
      "text_to_speech",
      "automatic_speech_recognition",
      "generate_embedding"
    ];
  }

  static override requiredSecrets(): string[] {
    return ["TOGETHER_API_KEY"];
  }

  private _togetherFetch: typeof fetch;

  constructor(
    secrets: { TOGETHER_API_KEY?: string },
    options: OpenAICompatProviderOptions = {}
  ) {
    const apiKey = secrets.TOGETHER_API_KEY;
    if (!apiKey) {
      throw new Error("TOGETHER_API_KEY is required");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      {
        providerId: "together",
        apiKey,
        baseURL: "https://api.together.xyz/v1"
      },
      { ...options, fetchFn }
    );

    this._togetherFetch = fetchFn;
  }

  override getContainerEnv() {
    return { TOGETHER_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  // ─── Endpoint calls ─────────────────────────────────────────────────────────

  override supportsEndpointCalls(): boolean {
    return true;
  }

  /**
   * Call one Together endpoint family with a vendor-shaped body. `route`
   * selects it (see TOGETHER_ENDPOINT_ROUTES) and other values are rejected.
   * `model` is sent as the body's `model`.
   *
   * For `audio/transcriptions`, `input.file` is the audio as bytes and the
   * other input fields become form fields after `file` and `model`. The
   * output is Together's JSON reply, except for `audio/speech`, whose output
   * is the encoded audio bytes. For `videos` it is the final job status, with
   * the result URL in `outputs.video_url`. A video job that ends in any
   * status but `completed` throws.
   */
  override async callEndpoint(
    req: EndpointCallRequest
  ): Promise<EndpointCallResult> {
    const route = req.route;
    if (route === undefined || !isEndpointRoute(route)) {
      const routes = TOGETHER_ENDPOINT_ROUTES.join(", ");
      const got = route === undefined ? "none" : `"${route}"`;
      throw new Error(
        `together endpoint route must be one of ${routes}, got ${got}`
      );
    }
    const transport = { fetchFn: this._togetherFetch, signal: req.signal };
    const body = { ...req.input, model: req.model };
    switch (route) {
      case "images": {
        const response = await postTogetherJson(
          this.apiKey,
          "/v1/images/generations",
          body,
          transport
        );
        if (!response.ok) {
          throw new Error(
            `Together image generation failed: ${await response.text()}`
          );
        }
        const payload: unknown = await response.json();
        const requestId = replyId(payload);
        if (requestId) {
          await recordGenerationReceiptAsync({
            provider_request_id: requestId
          });
        }
        return { output: payload, requestId };
      }
      case "audio/speech": {
        const response = await postTogetherJson(
          this.apiKey,
          "/v1/audio/speech",
          body,
          transport
        );
        if (!response.ok) {
          throw new Error(`Together TTS failed: ${await response.text()}`);
        }
        return {
          output: new Uint8Array(await response.arrayBuffer()),
          requestId: null
        };
      }
      case "audio/transcriptions":
        return this.transcribeEndpoint(req);
      case "videos":
        return this.videoEndpoint(body, req.signal, req.onProgress);
    }
  }

  private async transcribeEndpoint(
    req: EndpointCallRequest
  ): Promise<EndpointCallResult> {
    const { file, model: _model, ...fields } = req.input;
    if (!(file instanceof Uint8Array) || file.byteLength === 0) {
      throw new Error(
        "together audio/transcriptions needs input.file as audio bytes"
      );
    }
    const form = new FormData();
    // SAFETY: a Uint8Array is a BlobPart at runtime; the lib types disagree
    // only over whether its buffer could be a SharedArrayBuffer.
    const blob = new Blob([file as BlobPart], {
      type: "application/octet-stream"
    });
    form.append("file", blob, "audio.wav");
    form.append("model", req.model);
    for (const [name, value] of Object.entries(fields)) {
      if (value !== null && value !== undefined) {
        form.append(name, String(value));
      }
    }
    const response = await this._togetherFetch(
      "https://api.together.xyz/v1/audio/transcriptions",
      {
        method: "POST",
        // fetch sets the multipart boundary.
        headers: { Authorization: `Bearer ${this.apiKey}` },
        body: form,
        signal: req.signal
      }
    );
    if (!response.ok) {
      throw new Error(
        `Together transcription failed: ${await response.text()}`
      );
    }
    const payload: unknown = await response.json();
    return { output: payload, requestId: replyId(payload) };
  }

  private async videoEndpoint(
    body: Record<string, unknown>,
    signal: AbortSignal | undefined,
    onProgress: ((event: EndpointProgress) => void) | undefined
  ): Promise<EndpointCallResult> {
    const response = await postTogetherJson(this.apiKey, "/v2/videos", body, {
      fetchFn: this._togetherFetch,
      signal
    });
    if (!response.ok) {
      throw new Error(
        `Together video creation failed: ${await response.text()}`
      );
    }
    const jobId = replyId(await response.json());
    if (!jobId) {
      throw new Error("Together video creation returned no job id.");
    }
    await recordGenerationReceiptAsync({ provider_request_id: jobId });
    const status = await this.pollVideoJob(jobId, signal, onProgress);
    if (status.status !== "completed") {
      const reason =
        status.error?.message ?? `job ended with status '${status.status}'`;
      throw new Error(`Together video generation failed: ${reason}`);
    }
    return { output: status, requestId: jobId };
  }

  /**
   * Download a result URL Together returned: a generated image or video. It
   * comes from a response body, so it goes through safeFetch over the
   * provider's fetch.
   */
  override async downloadMedia(
    url: string,
    signal?: AbortSignal
  ): Promise<Uint8Array> {
    const response = await safeFetch(url, { signal }, 5, this._togetherFetch);
    if (!response.ok) {
      throw new Error(
        `Together asset fetch failed: HTTP ${response.status} for ${url}`
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  // ─── Language models ────────────────────────────────────────────────────────

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    const response = await this._togetherFetch(
      "https://api.together.xyz/v1/models",
      {
        headers: {
          Authorization: `Bearer ${this.apiKey}`
        }
      }
    );

    if (!response.ok) {
      return [];
    }

    const payload = (await response.json()) as
      | Array<{ id?: string; display_name?: string; type?: string }>
      | { data?: Array<{ id?: string; display_name?: string; type?: string }> };

    const rows = Array.isArray(payload) ? payload : (payload.data ?? []);
    return rows
      .filter(
        (row): row is { id: string; display_name?: string; type?: string } =>
          typeof row.id === "string" && row.id.length > 0
      )
      .filter((row) => {
        const t = row.type ?? "";
        return t === "chat" || t === "language" || t === "";
      })
      .map((row) => ({
        id: row.id,
        name: row.display_name ?? row.id,
        provider: "together"
      }));
  }

  // ─── Image models ───────────────────────────────────────────────────────────

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return loadImageModels(
      TOGETHER_MANIFEST_PKG,
      TOGETHER_MANIFEST_PATH,
      "together"
    );
  }

  /**
   * Text-to-image generation via Together's `/v1/images/generations` endpoint.
   * Uses Together's native `width` / `height` params rather than OpenAI's
   * combined `size` string so we can pass the full resolution range.
   */
  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    return togetherImage(
      this.apiKey,
      params.model.id,
      {
        ...params,
        steps: params.numInferenceSteps
      },
      {
        fetchFn: this._togetherFetch,
        label: "generation",
        signal: params.signal,
        download: this.downloadImage
      }
    );
  }

  override async imageToImage(
    images: Uint8Array[],
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const sources = images.filter((bytes) => bytes && bytes.length > 0);
    if (sources.length === 0) {
      throw new Error("image must not be empty.");
    }
    const urls = sources.map(bytesToImageDataUri);
    return togetherImage(
      this.apiKey,
      params.model.id,
      {
        prompt: params.prompt,
        ...(urls.length === 1
          ? { imageUrl: urls[0] }
          : { referenceImages: urls }),
        width: params.targetWidth,
        height: params.targetHeight,
        steps: params.numInferenceSteps,
        guidanceScale: params.guidanceScale,
        seed: params.seed
      },
      {
        fetchFn: this._togetherFetch,
        label: "editing",
        signal: params.signal,
        download: this.downloadImage
      }
    );
  }

  private readonly downloadImage = async (
    url: string,
    signal?: AbortSignal
  ): Promise<Uint8Array> => {
    const response = await safeFetch(url, { signal }, 5, this._togetherFetch);
    if (!response.ok) {
      throw new Error(`Image fetch failed: ${response.status}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  };

  // ─── TTS ────────────────────────────────────────────────────────────────────

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return TOGETHER_TTS_MODELS;
  }

  /**
   * Stream TTS audio as raw PCM Int16 samples.
   * Together's `/v1/audio/speech` endpoint uses "wav" / "mp3" / "raw" rather
   * than OpenAI's "pcm" label, so we request "wav" and strip the header.
   */
  override async *textToSpeech(args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
    audioFormat?: string;
    signal?: AbortSignal;
  }): AsyncGenerator<StreamingAudioChunk> {
    const bytes = await togetherSpeech(
      this.apiKey,
      args.model,
      {
        ...args,
        format: "wav"
      },
      { fetchFn: this._togetherFetch, signal: args.signal }
    );
    const { samples, sampleRate } = parseWavPCM(bytes);
    yield { samples, sampleRate };
  }

  /**
   * Return fully-encoded TTS audio (mp3, wav, or mulaw).
   * Returns `null` for unsupported formats so the caller falls back to the
   * streaming PCM path.
   */
  override async textToSpeechEncoded(args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
    audioFormat?: string;
    signal?: AbortSignal;
  }): Promise<EncodedAudioResult | null> {
    if (!args.text) {
      throw new Error("text must not be empty");
    }

    const formatToMime: Record<string, string> = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      mulaw: "audio/mulaw"
    };
    const fmt = (args.audioFormat ?? "mp3").toLowerCase();
    if (!(fmt in formatToMime)) {
      return null;
    }

    const bytes = await togetherSpeech(
      this.apiKey,
      args.model,
      {
        ...args,
        format: fmt
      },
      { fetchFn: this._togetherFetch, signal: args.signal }
    );
    return { data: bytes, mimeType: formatToMime[fmt] };
  }

  // ─── ASR ────────────────────────────────────────────────────────────────────

  override async getAvailableASRModels(): Promise<ASRModel[]> {
    return TOGETHER_ASR_MODELS;
  }

  // automaticSpeechRecognition() is inherited from OpenAIProvider and works
  // as-is because Together's /v1/audio/transcriptions endpoint is
  // OpenAI-compatible and the caller supplies the Together model ID.

  // ─── Embeddings ─────────────────────────────────────────────────────────────

  override async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return TOGETHER_EMBEDDING_MODELS;
  }

  // generateEmbedding() is inherited from OpenAIProvider and works as-is
  // because Together's /v1/embeddings endpoint is OpenAI-compatible.

  // ─── Video models ───────────────────────────────────────────────────────────

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    return loadVideoModels(
      TOGETHER_MANIFEST_PKG,
      TOGETHER_MANIFEST_PATH,
      "together"
    );
  }

  /**
   * Map generic resolution / aspect-ratio hints to concrete pixel dimensions
   * suitable for Together's video API.
   */
  private resolveVideoDimensions(
    aspectRatio?: string | null,
    resolution?: string | null
  ) {
    const ar = (aspectRatio ?? "16:9").replace(/\s/g, "");
    const res = (resolution ?? "720p").toLowerCase();

    const presets: Record<string, Record<string, [number, number]>> = {
      "16:9": {
        "480p": [854, 480],
        "720p": [1280, 720],
        "1080p": [1920, 1080]
      },
      "9:16": {
        "480p": [480, 854],
        "720p": [720, 1280],
        "1080p": [1080, 1920]
      },
      "1:1": {
        "480p": [480, 480],
        "720p": [720, 720],
        "1080p": [1080, 1080]
      },
      "4:3": {
        "480p": [640, 480],
        "720p": [960, 720],
        "1080p": [1440, 1080]
      }
    };

    const dims = presets[ar]?.[res];
    if (dims) {
      return { width: dims[0], height: dims[1] };
    }

    // Fallback for aspect ratios / resolutions outside the preset table: derive
    // the pixel size from the requested ratio so orientation is preserved (a
    // portrait `2:3` request must not silently become a landscape video). Scale
    // to a ~720p long edge, snapped to an even number as video encoders expect.
    const ratio = ar.match(/^(\d+):(\d+)$/);
    if (ratio) {
      const rw = parseInt(ratio[1], 10);
      const rh = parseInt(ratio[2], 10);
      if (rw > 0 && rh > 0) {
        const longEdge =
          res === "480p" ? 854 : res === "1080p" ? 1920 : 1280;
        const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
        if (rw >= rh) {
          return { width: even(longEdge), height: even((longEdge * rh) / rw) };
        }
        return { width: even((longEdge * rw) / rh), height: even(longEdge) };
      }
    }

    // Together's MiniMax default (landscape) when the ratio can't be parsed.
    return { width: 1366, height: 768 };
  }

  /**
   * Poll Together's video job endpoint until it reaches a terminal state.
   * Returns the final response payload.
   */
  /**
   * Per-call timeout signal (mirrors the gemini provider): threaded into the
   * poll-loop fetch and sleep so an expired budget aborts the in-flight request
   * promptly instead of leaking it until the internal poll cap.
   */
  private timeoutSignal(
    timeoutSeconds?: number | null
  ): AbortSignal | undefined {
    return timeoutSeconds && timeoutSeconds > 0
      ? AbortSignal.timeout(timeoutSeconds * 1000)
      : undefined;
  }

  private async pollVideoJob(
    jobId: string,
    signal?: AbortSignal,
    onProgress?: (event: EndpointProgress) => void
  ): Promise<{
    status: string;
    outputs?: { video_url?: string };
    error?: { message?: string };
  }> {
    const timeoutMs = 10 * 60 * 1000; // 10 minutes
    const intervalMs = 5_000; // 5 seconds
    const start = Date.now();

    while (true) {
      if (Date.now() - start > timeoutMs) {
        throw new Error(
          `Together video generation timed out after ${timeoutMs / 1000}s for job ${jobId}`
        );
      }

      await abortableSleep(intervalMs, signal);

      const statusResponse = await this._togetherFetch(
        `https://api.together.xyz/v2/videos/${jobId}`,
        { headers: { Authorization: `Bearer ${this.apiKey}` }, signal }
      );

      if (!statusResponse.ok) {
        const errorText = await statusResponse.text();
        throw new Error(`Together video status check failed: ${errorText}`);
      }

      const status = (await statusResponse.json()) as {
        status: string;
        outputs?: { video_url?: string };
        error?: { message?: string };
      };
      if (onProgress && typeof status.status === "string") {
        onProgress({ message: status.status });
      }

      if (
        status.status === "completed" ||
        status.status === "failed" ||
        status.status === "cancelled"
      ) {
        return status;
      }
    }
  }

  /**
   * Download a completed video from its signed URL and return the raw bytes.
   */
  private async downloadVideo(
    status: { outputs?: { video_url?: string }; error?: { message?: string } },
    label: string,
    signal?: AbortSignal
  ): Promise<Uint8Array> {
    const videoUrl = status.outputs?.video_url;
    if (!videoUrl) {
      const reason = status.error?.message ?? "unknown error";
      throw new Error(`Together ${label} failed: ${reason}`);
    }

    const videoResponse = await this._togetherFetch(videoUrl, { signal });
    if (!videoResponse.ok) {
      throw new Error(
        `Failed to download Together video: ${videoResponse.status}`
      );
    }

    return new Uint8Array(await videoResponse.arrayBuffer());
  }

  /**
   * Text-to-video generation via Together's asynchronous `/v2/videos` API.
   * Submits the job then polls until completion, returning the raw video bytes.
   */
  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const { width, height } = this.resolveVideoDimensions(
      params.aspectRatio,
      params.resolution
    );

    const body: Record<string, unknown> = {
      model: params.model.id,
      prompt: params.prompt,
      width,
      height
    };

    // Together's API expects seconds as a string (e.g. "6"), not a number
    if (params.durationSeconds != null)
      body.seconds = String(params.durationSeconds);
    if (params.numInferenceSteps != null) body.steps = params.numInferenceSteps;
    if (params.guidanceScale != null) body.guidance_scale = params.guidanceScale;
    if (params.seed != null) body.seed = params.seed;
    if (params.negativePrompt) body.negative_prompt = params.negativePrompt;

    const signal = this.timeoutSignal(params.timeoutSeconds);
    const createResponse = await this._togetherFetch(
      "https://api.together.xyz/v2/videos",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Together video creation failed: ${errorText}`);
    }

    const job = (await createResponse.json()) as { id: string; status: string };
    const finalStatus = await this.pollVideoJob(job.id, signal);

    if (finalStatus.status !== "completed") {
      const reason =
        finalStatus.error?.message ??
        `job ended with status '${finalStatus.status}'`;
      throw new Error(`Together text-to-video failed: ${reason}`);
    }

    return this.downloadVideo(finalStatus, "text-to-video", signal);
  }

  /**
   * Image-to-video generation via Together's asynchronous `/v2/videos` API.
   * The first frame is supplied as a base64-encoded image in `frame_images`.
   */
  override async imageToVideo(
    image: Uint8Array,
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    if (!image || image.length === 0) {
      throw new Error("The input image cannot be empty.");
    }

    const { width, height } = this.resolveVideoDimensions(
      params.aspectRatio,
      params.resolution
    );

    const inputImage = bytesToImageDataUri(image);

    const body: Record<string, unknown> = {
      model: params.model.id,
      prompt: params.prompt ?? "",
      width,
      height,
      frame_images: [{ input_image: inputImage, frame: "first" }]
    };
    // Together keys each conditioning frame by position; a model without
    // last-frame support answers with its own error.
    if (params.endImage?.length) {
      (body.frame_images as unknown[]).push({ input_image: bytesToImageDataUri(params.endImage), frame: "last" });
    }

    // Together's API expects seconds as a string (e.g. "6"), not a number
    if (params.durationSeconds != null)
      body.seconds = String(params.durationSeconds);
    if (params.numInferenceSteps != null) body.steps = params.numInferenceSteps;
    if (params.guidanceScale != null) body.guidance_scale = params.guidanceScale;
    if (params.seed != null) body.seed = params.seed;
    if (params.negativePrompt) body.negative_prompt = params.negativePrompt;

    const signal = this.timeoutSignal(params.timeoutSeconds);
    const createResponse = await this._togetherFetch(
      "https://api.together.xyz/v2/videos",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body),
        signal
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Together image-to-video creation failed: ${errorText}`);
    }

    const job = (await createResponse.json()) as { id: string; status: string };
    const finalStatus = await this.pollVideoJob(job.id, signal);

    if (finalStatus.status !== "completed") {
      const reason =
        finalStatus.error?.message ??
        `job ended with status '${finalStatus.status}'`;
      throw new Error(`Together image-to-video failed: ${reason}`);
    }

    return this.downloadVideo(finalStatus, "image-to-video", signal);
  }
}
