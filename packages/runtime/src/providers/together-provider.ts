import OpenAI from "openai";
import { OpenAIProvider } from "./openai-provider.js";
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

interface TogetherProviderOptions {
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;
}

// ─── Static model catalogs ────────────────────────────────────────────────────
// Sources: https://github.com/togethercomputer/skills

const TOGETHER_IMAGE_MODELS: ImageModel[] = [
  {
    id: "black-forest-labs/FLUX.1-schnell",
    name: "FLUX.1 Schnell",
    provider: "together",
    supportedTasks: ["text_to_image"]
  },
  {
    id: "black-forest-labs/FLUX.1.1-pro",
    name: "FLUX.1.1 Pro",
    provider: "together",
    supportedTasks: ["text_to_image"]
  },
  {
    id: "black-forest-labs/FLUX.2-pro",
    name: "FLUX.2 Pro",
    provider: "together",
    supportedTasks: ["text_to_image", "image_to_image"]
  },
  {
    id: "black-forest-labs/FLUX.2-dev",
    name: "FLUX.2 Dev",
    provider: "together",
    supportedTasks: ["text_to_image", "image_to_image"]
  },
  {
    id: "black-forest-labs/FLUX.2-flex",
    name: "FLUX.2 Flex",
    provider: "together",
    supportedTasks: ["text_to_image", "image_to_image"]
  },
  {
    id: "black-forest-labs/FLUX.1-kontext-pro",
    name: "FLUX.1 Kontext Pro",
    provider: "together",
    supportedTasks: ["text_to_image", "image_to_image"]
  },
  {
    id: "black-forest-labs/FLUX.1-kontext-max",
    name: "FLUX.1 Kontext Max",
    provider: "together",
    supportedTasks: ["text_to_image", "image_to_image"]
  },
  {
    id: "google/imagen-4.0-preview",
    name: "Imagen 4.0 Preview",
    provider: "together",
    supportedTasks: ["text_to_image"]
  },
  {
    id: "google/imagen-4.0-fast",
    name: "Imagen 4.0 Fast",
    provider: "together",
    supportedTasks: ["text_to_image"]
  },
  {
    id: "google/flash-image-2.5",
    name: "Flash Image 2.5",
    provider: "together",
    supportedTasks: ["text_to_image"]
  },
  {
    id: "google/gemini-3-pro-image",
    name: "Gemini 3 Pro Image",
    provider: "together",
    supportedTasks: ["text_to_image", "image_to_image"]
  },
  {
    id: "ideogram/ideogram-3.0",
    name: "Ideogram 3.0",
    provider: "together",
    supportedTasks: ["text_to_image"]
  },
  {
    id: "ByteDance-Seed/Seedream-4.0",
    name: "Seedream 4.0",
    provider: "together",
    supportedTasks: ["text_to_image"]
  },
  {
    id: "ByteDance-Seed/Seedream-3.0",
    name: "Seedream 3.0",
    provider: "together",
    supportedTasks: ["text_to_image"]
  },
  {
    id: "stabilityai/stable-diffusion-3-medium",
    name: "Stable Diffusion 3 Medium",
    provider: "together",
    supportedTasks: ["text_to_image"]
  }
];

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

const TOGETHER_VIDEO_MODELS: VideoModel[] = [
  {
    id: "minimax/hailuo-02",
    name: "MiniMax Hailuo 02",
    provider: "together",
    supportedTasks: ["text_to_video", "image_to_video"]
  },
  {
    id: "minimax/video-01-director",
    name: "MiniMax Video 01 Director",
    provider: "together",
    supportedTasks: ["text_to_video", "image_to_video"]
  },
  {
    id: "google/veo-3.0",
    name: "Veo 3.0",
    provider: "together",
    supportedTasks: ["text_to_video", "image_to_video"]
  },
  {
    id: "google/veo-3.0-audio",
    name: "Veo 3.0 + Audio",
    provider: "together",
    supportedTasks: ["text_to_video"]
  },
  {
    id: "google/veo-2.0",
    name: "Veo 2.0",
    provider: "together",
    supportedTasks: ["text_to_video", "image_to_video"]
  },
  {
    id: "openai/sora-2",
    name: "Sora 2",
    provider: "together",
    supportedTasks: ["text_to_video", "image_to_video"]
  },
  {
    id: "openai/sora-2-pro",
    name: "Sora 2 Pro",
    provider: "together",
    supportedTasks: ["text_to_video", "image_to_video"]
  },
  {
    id: "kwaivgI/kling-2.1-master",
    name: "Kling 2.1 Master",
    provider: "together",
    supportedTasks: ["text_to_video", "image_to_video"]
  },
  {
    id: "kwaivgI/kling-2.1-standard",
    name: "Kling 2.1 Standard",
    provider: "together",
    supportedTasks: ["text_to_video", "image_to_video"]
  },
  {
    id: "kwaivgI/kling-2.1-pro",
    name: "Kling 2.1 Pro",
    provider: "together",
    supportedTasks: ["text_to_video", "image_to_video"]
  },
  {
    id: "ByteDance/Seedance-1.0-pro",
    name: "Seedance 1.0 Pro",
    provider: "together",
    supportedTasks: ["text_to_video", "image_to_video"]
  },
  {
    id: "ByteDance/Seedance-1.0-lite",
    name: "Seedance 1.0 Lite",
    provider: "together",
    supportedTasks: ["text_to_video", "image_to_video"]
  },
  {
    id: "pixverse/pixverse-v5",
    name: "PixVerse v5",
    provider: "together",
    supportedTasks: ["text_to_video", "image_to_video"]
  },
  {
    id: "vidu/vidu-2.0",
    name: "Vidu 2.0",
    provider: "together",
    supportedTasks: ["text_to_video", "image_to_video"]
  },
  {
    id: "vidu/vidu-q1",
    name: "Vidu Q1",
    provider: "together",
    supportedTasks: ["text_to_video", "image_to_video"]
  }
];

// ─── WAV header parser ────────────────────────────────────────────────────────

/**
 * Extract raw PCM Int16 samples and the sample rate from a WAV buffer.
 * Handles non-standard chunk ordering by scanning for the "fmt " and "data"
 * chunks rather than assuming a fixed 44-byte header.
 */
function parseWavPCM(bytes: Uint8Array): {
  samples: Int16Array;
  sampleRate: number;
} {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let sampleRate = 24000; // Together's documented default
  let offset = 12; // Skip "RIFF", file-size, "WAVE"

  while (offset + 8 <= bytes.byteLength) {
    // Chunk IDs are ASCII — read as big-endian uint32 to compare with literals
    const chunkId = view.getUint32(offset, false);
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === 0x666d7420 /* "fmt " */ && offset + 12 <= bytes.byteLength) {
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

    // Advance past this chunk; WAV requires word-alignment padding
    const advance = 8 + chunkSize + (chunkSize % 2 === 0 ? 0 : 1);
    if (advance <= 0) break; // Safety guard against malformed files
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

// ─── Provider ─────────────────────────────────────────────────────────────────

export class TogetherProvider extends OpenAIProvider {
  static override requiredSecrets(): string[] {
    return ["TOGETHER_API_KEY"];
  }

  private _togetherFetch: typeof fetch;

  constructor(
    secrets: { TOGETHER_API_KEY?: string },
    options: TogetherProviderOptions = {}
  ) {
    const apiKey = secrets.TOGETHER_API_KEY;
    if (!apiKey) {
      throw new Error("TOGETHER_API_KEY is required");
    }

    const fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);

    super(
      { OPENAI_API_KEY: apiKey },
      {
        client: options.client,
        clientFactory:
          options.clientFactory ??
          ((key) =>
            new OpenAI({
              apiKey: key,
              baseURL: "https://api.together.xyz/v1"
            })),
        fetchFn
      }
    );

    (this as { provider: string }).provider = "together";
    this._togetherFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { TOGETHER_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
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

    const rows = Array.isArray(payload) ? payload : payload.data ?? [];
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
    return TOGETHER_IMAGE_MODELS;
  }

  /**
   * Text-to-image generation via Together's `/v1/images/generations` endpoint.
   * Uses Together's native `width` / `height` params rather than OpenAI's
   * combined `size` string so we can pass the full resolution range.
   */
  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const body: Record<string, unknown> = {
      model: params.model.id,
      prompt: params.prompt,
      n: 1,
      response_format: "b64_json"
    };

    if (params.width != null) body.width = params.width;
    if (params.height != null) body.height = params.height;
    if (params.numInferenceSteps != null) body.steps = params.numInferenceSteps;
    if (params.guidanceScale != null) body.guidance_scale = params.guidanceScale;
    if (params.seed != null) body.seed = params.seed;
    if (params.negativePrompt) body.negative_prompt = params.negativePrompt;

    const response = await this._togetherFetch(
      "https://api.together.xyz/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Together image generation failed: ${errorText}`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
    const item = payload.data?.[0];
    if (!item) {
      throw new Error("Together image generation returned no data.");
    }

    if (item.b64_json) {
      return Uint8Array.from(Buffer.from(item.b64_json, "base64"));
    }

    if (item.url) {
      const fetchResponse = await this._togetherFetch(item.url);
      if (!fetchResponse.ok) {
        throw new Error(`Image fetch failed: ${fetchResponse.status}`);
      }
      return new Uint8Array(await fetchResponse.arrayBuffer());
    }

    throw new Error("Together image generation returned no image data.");
  }

  /**
   * Image-to-image editing via Together's Kontext models.
   * The image is encoded as a base64 data URI and passed as `image_url`.
   * This requires a model that supports the `image_url` parameter
   * (e.g. FLUX.1-kontext-pro, FLUX.1-kontext-max, FLUX.2-pro/dev/flex).
   */
  override async imageToImage(
    image: Uint8Array,
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    if (!image || image.length === 0) {
      throw new Error("image must not be empty.");
    }
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const base64 = Buffer.from(image).toString("base64");
    const imageUrl = `data:image/jpeg;base64,${base64}`;

    const body: Record<string, unknown> = {
      model: params.model.id,
      prompt: params.prompt,
      image_url: imageUrl,
      n: 1,
      response_format: "b64_json"
    };

    if (params.targetWidth != null) body.width = params.targetWidth;
    if (params.targetHeight != null) body.height = params.targetHeight;
    if (params.numInferenceSteps != null) body.steps = params.numInferenceSteps;
    if (params.guidanceScale != null) body.guidance_scale = params.guidanceScale;
    if (params.seed != null) body.seed = params.seed;

    const response = await this._togetherFetch(
      "https://api.together.xyz/v1/images/generations",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Together image editing failed: ${errorText}`);
    }

    const payload = (await response.json()) as {
      data?: Array<{ b64_json?: string; url?: string }>;
    };
    const item = payload.data?.[0];
    if (!item) {
      throw new Error("Together image editing returned no data.");
    }

    if (item.b64_json) {
      return Uint8Array.from(Buffer.from(item.b64_json, "base64"));
    }

    if (item.url) {
      const fetchResponse = await this._togetherFetch(item.url);
      if (!fetchResponse.ok) {
        throw new Error(`Image fetch failed: ${fetchResponse.status}`);
      }
      return new Uint8Array(await fetchResponse.arrayBuffer());
    }

    throw new Error("Together image editing returned no image data.");
  }

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
  }): AsyncGenerator<StreamingAudioChunk> {
    if (!args.text) {
      throw new Error("text must not be empty");
    }

    const voice = args.voice ?? "tara"; // Orpheus default; Kokoro uses "af_heart"
    const body: Record<string, unknown> = {
      model: args.model,
      input: args.text,
      voice,
      response_format: "wav"
    };
    if (args.speed != null) body.speed = args.speed;

    const response = await this._togetherFetch(
      "https://api.together.xyz/v1/audio/speech",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Together TTS failed: ${errorText}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
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

    const voice = args.voice ?? "tara";
    const body: Record<string, unknown> = {
      model: args.model,
      input: args.text,
      voice,
      response_format: fmt
    };
    if (args.speed != null) body.speed = args.speed;

    const response = await this._togetherFetch(
      "https://api.together.xyz/v1/audio/speech",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Together TTS failed: ${errorText}`);
    }

    const bytes = new Uint8Array(await response.arrayBuffer());
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
    return TOGETHER_VIDEO_MODELS;
  }

  /**
   * Map generic resolution / aspect-ratio hints to concrete pixel dimensions
   * suitable for Together's video API.
   */
  private resolveVideoDimensions(
    aspectRatio?: string | null,
    resolution?: string | null
  ): { width: number; height: number } {
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

    // Together's MiniMax default
    return { width: 1366, height: 768 };
  }

  /**
   * Poll Together's video job endpoint until it reaches a terminal state.
   * Returns the final response payload.
   */
  private async pollVideoJob(jobId: string): Promise<{
    status: string;
    outputs?: { video_url?: string };
    error?: { message?: string };
  }> {
    const timeoutMs = 10 * 60 * 1000; // 10 minutes
    const intervalMs = 5_000; // 5 seconds
    const start = Date.now();

    while (true) {
      if (Date.now() - start > timeoutMs) {
        throw new Error("Together video generation timed out");
      }

      await new Promise<void>((resolve) => setTimeout(resolve, intervalMs));

      const statusResponse = await this._togetherFetch(
        `https://api.together.xyz/v2/videos/${jobId}`,
        { headers: { Authorization: `Bearer ${this.apiKey}` } }
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
    label: string
  ): Promise<Uint8Array> {
    const videoUrl = status.outputs?.video_url;
    if (!videoUrl) {
      const reason = status.error?.message ?? "unknown error";
      throw new Error(`Together ${label} failed: ${reason}`);
    }

    const videoResponse = await this._togetherFetch(videoUrl);
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

    if (params.durationSeconds != null)
      body.seconds = String(params.durationSeconds);
    if (params.numInferenceSteps != null) body.steps = params.numInferenceSteps;
    if (params.guidanceScale != null) body.guidance_scale = params.guidanceScale;
    if (params.seed != null) body.seed = params.seed;
    if (params.negativePrompt) body.negative_prompt = params.negativePrompt;

    const createResponse = await this._togetherFetch(
      "https://api.together.xyz/v2/videos",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Together video creation failed: ${errorText}`);
    }

    const job = (await createResponse.json()) as { id: string; status: string };
    const finalStatus = await this.pollVideoJob(job.id);

    if (finalStatus.status !== "completed") {
      const reason =
        finalStatus.error?.message ??
        `job ended with status '${finalStatus.status}'`;
      throw new Error(`Together text-to-video failed: ${reason}`);
    }

    return this.downloadVideo(finalStatus, "text-to-video");
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

    const base64 = Buffer.from(image).toString("base64");
    const inputImage = `data:image/jpeg;base64,${base64}`;

    const body: Record<string, unknown> = {
      model: params.model.id,
      prompt: params.prompt ?? "",
      width,
      height,
      frame_images: [{ input_image: inputImage, frame: "first" }]
    };

    if (params.durationSeconds != null)
      body.seconds = String(params.durationSeconds);
    if (params.numInferenceSteps != null) body.steps = params.numInferenceSteps;
    if (params.guidanceScale != null) body.guidance_scale = params.guidanceScale;
    if (params.seed != null) body.seed = params.seed;
    if (params.negativePrompt) body.negative_prompt = params.negativePrompt;

    const createResponse = await this._togetherFetch(
      "https://api.together.xyz/v2/videos",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Together image-to-video creation failed: ${errorText}`);
    }

    const job = (await createResponse.json()) as { id: string; status: string };
    const finalStatus = await this.pollVideoJob(job.id);

    if (finalStatus.status !== "completed") {
      const reason =
        finalStatus.error?.message ??
        `job ended with status '${finalStatus.status}'`;
      throw new Error(`Together image-to-video failed: ${reason}`);
    }

    return this.downloadVideo(finalStatus, "image-to-video");
  }
}
