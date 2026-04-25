/**
 * MiniMax provider — exposes MiniMax's full multimodal stack through the
 * standard BaseProvider interface.
 *
 * Chat inherits the OpenAI-compatible path (MiniMax-M2.x models), while image,
 * video, and speech generation go through MiniMax's own REST endpoints. Video
 * uses the async task + File API download pattern.
 *
 * Docs: https://platform.minimax.io/docs/api-reference/api-overview
 */

import OpenAI from "openai";
import { OpenAIProvider } from "./openai-provider.js";
import { createLogger } from "@nodetool/config";
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

const log = createLogger("nodetool.runtime.providers.minimax");

const MINIMAX_BASE_URL = "https://api.minimax.io";
const MINIMAX_OPENAI_BASE_URL = `${MINIMAX_BASE_URL}/v1`;

/**
 * Known voice IDs shipped with MiniMax speech models. This is a curated subset
 * of the 300+ system voices — sufficient for UI voice pickers. Users can still
 * pass any MiniMax voice_id (including cloned voices) through the API.
 */
const MINIMAX_VOICES: string[] = [
  "English_Trustworth_Man",
  "English_CalmWoman",
  "English_UpsetGirl",
  "English_Gentle-voiced_man",
  "English_Whispering_girl_v3",
  "English_Diligent_Man",
  "English_Graceful_Lady",
  "English_ReservedYoungMan",
  "English_PlayfulGirl",
  "English_ManWithDeepVoice",
  "English_GentleTeacher",
  "English_MaturePartner",
  "English_FriendlyPerson",
  "English_MatureBoss",
  "English_Debator",
  "English_LovelyGirl",
  "English_Steadymentor",
  "English_Deep-VoicedGentleman",
  "English_DecentYoungMan",
  "English_SentimentalLady",
  "English_ImposingManner",
  "English_SadTeen",
  "English_Wiselady",
  "English_CaptivatingStoryteller",
  "English_AttractiveGirl",
  "English_DescendPriest",
  "English_ConfidentWoman",
  "English_CuteElf",
  "English_radiant_girl",
  "English_Insightful_Speaker",
  "Chinese (Mandarin)_Warm_Bestie",
  "Chinese (Mandarin)_Gentleman",
  "Chinese (Mandarin)_Kind-hearted_Antie",
  "Chinese (Mandarin)_Lyrical_Voice",
  "Chinese (Mandarin)_Straightforward_Boy",
  "Chinese (Mandarin)_Stubborn_Friend",
  "Chinese (Mandarin)_Sweet_Girl_2",
  "Chinese (Mandarin)_Gentle_Youth",
  "Chinese (Mandarin)_Warm_Girl",
  "Chinese (Mandarin)_Male_Announcer"
];

const SUPPORTED_IMAGE_ASPECTS: readonly string[] = [
  "1:1",
  "16:9",
  "4:3",
  "3:2",
  "2:3",
  "3:4",
  "9:16",
  "21:9"
];

function chooseAspectRatio(
  width?: number | null,
  height?: number | null
): string | null {
  if (!width || !height || width <= 0 || height <= 0) return null;
  const target = width / height;
  let best: string | null = null;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const aspect of SUPPORTED_IMAGE_ASPECTS) {
    const [a, b] = aspect.split(":").map(Number);
    if (!a || !b) continue;
    const diff = Math.abs(a / b - target);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = aspect;
    }
  }
  return best;
}

function b64(data: Uint8Array): string {
  return Buffer.from(data).toString("base64");
}

function hexToUint8(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  const len = Math.floor(clean.length / 2);
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function toInt16Samples(bytes: Uint8Array): Int16Array {
  const aligned =
    bytes.length % 2 === 0 ? bytes : bytes.slice(0, bytes.length - 1);
  return new Int16Array(
    aligned.buffer,
    aligned.byteOffset,
    aligned.byteLength / 2
  );
}

interface MinimaxProviderOptions {
  client?: OpenAI;
  clientFactory?: (apiKey: string) => OpenAI;
  fetchFn?: typeof fetch;
}

interface MinimaxBaseResp {
  status_code?: number;
  status_msg?: string;
}

/** MiniMax embeds a `base_resp` on most responses; surface failures as errors. */
function assertBaseResp(data: Record<string, unknown>, context: string): void {
  const baseResp = data.base_resp as MinimaxBaseResp | undefined;
  if (baseResp && baseResp.status_code && baseResp.status_code !== 0) {
    throw new Error(
      `MiniMax ${context} failed: ${baseResp.status_msg ?? "unknown error"} (code ${baseResp.status_code})`
    );
  }
}

export class MinimaxProvider extends OpenAIProvider {
  static override requiredSecrets(): string[] {
    return ["MINIMAX_API_KEY"];
  }

  private readonly _minimaxFetch: typeof fetch;

  constructor(
    secrets: { MINIMAX_API_KEY?: string },
    options: MinimaxProviderOptions = {}
  ) {
    const apiKey = secrets.MINIMAX_API_KEY;
    if (!apiKey) {
      throw new Error("MINIMAX_API_KEY is required");
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
              baseURL: MINIMAX_OPENAI_BASE_URL
            })),
        fetchFn
      }
    );

    (this as { provider: string }).provider = "minimax";
    this._minimaxFetch = fetchFn;
  }

  override getContainerEnv(): Record<string, string> {
    return { MINIMAX_API_KEY: this.apiKey };
  }

  override async hasToolSupport(_model: string): Promise<boolean> {
    return true;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json"
    };
  }

  // ---------------------------------------------------------------------------
  // Model catalogues
  // ---------------------------------------------------------------------------

  override async getAvailableLanguageModels(): Promise<LanguageModel[]> {
    return [
      { id: "MiniMax-M2.7", name: "MiniMax M2.7", provider: "minimax" },
      {
        id: "MiniMax-M2.7-highspeed",
        name: "MiniMax M2.7 Highspeed",
        provider: "minimax"
      },
      { id: "MiniMax-M2.5", name: "MiniMax M2.5", provider: "minimax" },
      {
        id: "MiniMax-M2.5-highspeed",
        name: "MiniMax M2.5 Highspeed",
        provider: "minimax"
      },
      { id: "MiniMax-M2.1", name: "MiniMax M2.1", provider: "minimax" },
      {
        id: "MiniMax-M2.1-highspeed",
        name: "MiniMax M2.1 Highspeed",
        provider: "minimax"
      },
      { id: "MiniMax-M2", name: "MiniMax M2", provider: "minimax" }
    ];
  }

  override async getAvailableImageModels(): Promise<ImageModel[]> {
    return [
      {
        id: "image-01",
        name: "MiniMax Image-01",
        provider: "minimax",
        supportedTasks: ["text_to_image", "image_to_image"]
      }
    ];
  }

  override async getAvailableVideoModels(): Promise<VideoModel[]> {
    const both = ["text_to_video", "image_to_video"];
    return [
      {
        id: "MiniMax-Hailuo-2.3",
        name: "MiniMax Hailuo 2.3",
        provider: "minimax",
        supportedTasks: both
      },
      {
        id: "MiniMax-Hailuo-2.3-Fast",
        name: "MiniMax Hailuo 2.3 Fast",
        provider: "minimax",
        supportedTasks: both
      },
      {
        id: "MiniMax-Hailuo-02",
        name: "MiniMax Hailuo 02",
        provider: "minimax",
        supportedTasks: both
      },
      {
        id: "T2V-01-Director",
        name: "MiniMax Video-01 Director",
        provider: "minimax",
        supportedTasks: ["text_to_video"]
      },
      {
        id: "I2V-01-Director",
        name: "MiniMax Video-01 Director (I2V)",
        provider: "minimax",
        supportedTasks: ["image_to_video"]
      },
      {
        id: "S2V-01",
        name: "MiniMax Video-01 Subject",
        provider: "minimax",
        supportedTasks: ["image_to_video"]
      }
    ];
  }

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return [
      {
        id: "speech-2.8-hd",
        name: "MiniMax Speech 2.8 HD",
        provider: "minimax",
        voices: MINIMAX_VOICES
      },
      {
        id: "speech-2.8-turbo",
        name: "MiniMax Speech 2.8 Turbo",
        provider: "minimax",
        voices: MINIMAX_VOICES
      },
      {
        id: "speech-2.6-hd",
        name: "MiniMax Speech 2.6 HD",
        provider: "minimax",
        voices: MINIMAX_VOICES
      },
      {
        id: "speech-2.6-turbo",
        name: "MiniMax Speech 2.6 Turbo",
        provider: "minimax",
        voices: MINIMAX_VOICES
      },
      {
        id: "speech-02-hd",
        name: "MiniMax Speech 02 HD",
        provider: "minimax",
        voices: MINIMAX_VOICES
      },
      {
        id: "speech-02-turbo",
        name: "MiniMax Speech 02 Turbo",
        provider: "minimax",
        voices: MINIMAX_VOICES
      }
    ];
  }

  /** MiniMax does not expose a public ASR endpoint we support here. */
  override async getAvailableASRModels(): Promise<ASRModel[]> {
    return [];
  }

  /** Embeddings require a MiniMax GroupId we don't manage; leave disabled. */
  override async getAvailableEmbeddingModels(): Promise<EmbeddingModel[]> {
    return [];
  }

  override async automaticSpeechRecognition(
    _args: Parameters<OpenAIProvider["automaticSpeechRecognition"]>[0]
  ): Promise<import("./types.js").ASRResult> {
    throw new Error("minimax does not support automaticSpeechRecognition");
  }

  override async generateEmbedding(
    _args: Parameters<OpenAIProvider["generateEmbedding"]>[0]
  ): Promise<number[][]> {
    throw new Error("minimax does not support generateEmbedding");
  }

  // ---------------------------------------------------------------------------
  // Image generation — POST /v1/image_generation
  // ---------------------------------------------------------------------------

  override async textToImage(params: TextToImageParams): Promise<Uint8Array> {
    const images = await this._generateImages(params, null, 1);
    return images[0];
  }

  override async textToImages(
    params: TextToImageParams,
    numImages: number
  ): Promise<Uint8Array[]> {
    return this._generateImages(params, null, numImages);
  }

  override async imageToImage(
    image: Uint8Array,
    params: ImageToImageParams
  ): Promise<Uint8Array> {
    const [first] = await this._generateImages(
      this._imageToImageAsTextParams(params),
      image,
      1
    );
    return first;
  }

  override async imageToImages(
    image: Uint8Array,
    params: ImageToImageParams,
    numImages: number
  ): Promise<Uint8Array[]> {
    return this._generateImages(
      this._imageToImageAsTextParams(params),
      image,
      numImages
    );
  }

  private _imageToImageAsTextParams(
    params: ImageToImageParams
  ): TextToImageParams {
    return {
      model: params.model,
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      width: params.targetWidth ?? undefined,
      height: params.targetHeight ?? undefined,
      quality: params.quality,
      guidanceScale: params.guidanceScale,
      numInferenceSteps: params.numInferenceSteps,
      seed: params.seed,
      scheduler: params.scheduler
    };
  }

  private async _generateImages(
    params: TextToImageParams,
    referenceImage: Uint8Array | null,
    numImages: number
  ): Promise<Uint8Array[]> {
    if (!params.prompt) {
      throw new Error("The input prompt cannot be empty.");
    }

    const prompt = params.negativePrompt
      ? `${params.prompt.trim()}\n\nDo not include: ${params.negativePrompt.trim()}`
      : params.prompt;

    const body: Record<string, unknown> = {
      model: params.model.id || "image-01",
      prompt,
      n: Math.max(1, Math.min(9, numImages)),
      response_format: "base64",
      prompt_optimizer: true
    };

    const aspect = chooseAspectRatio(
      params.width ?? undefined,
      params.height ?? undefined
    );
    if (aspect) body.aspect_ratio = aspect;
    if (params.seed != null) body.seed = params.seed;

    if (referenceImage) {
      body.subject_reference = [
        {
          type: "character",
          image_file: `data:image/png;base64,${b64(referenceImage)}`
        }
      ];
    }

    log.debug("MiniMax textToImage", { model: body.model, n: body.n });

    const res = await this._minimaxFetch(
      `${MINIMAX_BASE_URL}/v1/image_generation`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body)
      }
    );
    if (!res.ok) {
      throw new Error(
        `MiniMax image_generation failed: ${res.status} ${await res.text()}`
      );
    }
    const data = (await res.json()) as Record<string, unknown>;
    assertBaseResp(data, "image_generation");

    const payload = data.data as Record<string, unknown> | undefined;
    const b64List = payload?.image_base64 as string[] | undefined;
    if (b64List && b64List.length > 0) {
      return b64List.map(
        (encoded) => new Uint8Array(Buffer.from(encoded, "base64"))
      );
    }

    const urls = payload?.image_urls as string[] | undefined;
    if (urls && urls.length > 0) {
      const results: Uint8Array[] = [];
      for (const url of urls) {
        const dl = await this._minimaxFetch(url);
        if (!dl.ok) {
          throw new Error(`Failed to download MiniMax image from ${url}`);
        }
        results.push(new Uint8Array(await dl.arrayBuffer()));
      }
      return results;
    }

    throw new Error("MiniMax image_generation returned no image data");
  }

  // ---------------------------------------------------------------------------
  // Video generation — POST /v1/video_generation + async polling
  // ---------------------------------------------------------------------------

  override async textToVideo(params: TextToVideoParams): Promise<Uint8Array> {
    return this._generateVideo(params.model.id, {
      prompt: params.prompt,
      durationSeconds: params.durationSeconds,
      resolution: params.resolution
    });
  }

  override async imageToVideo(
    image: Uint8Array,
    params: ImageToVideoParams
  ): Promise<Uint8Array> {
    return this._generateVideo(params.model.id, {
      prompt: params.prompt ?? undefined,
      durationSeconds: params.durationSeconds,
      resolution: params.resolution,
      firstFrame: image
    });
  }

  private async _generateVideo(
    modelId: string,
    opts: {
      prompt?: string;
      durationSeconds?: number | null;
      resolution?: string | null;
      firstFrame?: Uint8Array;
    }
  ): Promise<Uint8Array> {
    const body: Record<string, unknown> = { model: modelId };
    if (opts.prompt) body.prompt = opts.prompt;
    if (opts.durationSeconds) {
      body.duration = opts.durationSeconds >= 9 ? 10 : 6;
    }
    if (opts.resolution) {
      const r = opts.resolution.toLowerCase();
      if (r.includes("1080")) body.resolution = "1080P";
      else if (r.includes("768") || r.includes("720")) body.resolution = "768P";
      else if (r.includes("512")) body.resolution = "512P";
    }
    if (opts.firstFrame) {
      body.first_frame_image = `data:image/png;base64,${b64(opts.firstFrame)}`;
    }

    log.debug("MiniMax textToVideo submit", { model: modelId });

    const submit = await this._minimaxFetch(
      `${MINIMAX_BASE_URL}/v1/video_generation`,
      {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify(body)
      }
    );
    if (!submit.ok) {
      throw new Error(
        `MiniMax video_generation submit failed: ${submit.status} ${await submit.text()}`
      );
    }
    const submitData = (await submit.json()) as Record<string, unknown>;
    assertBaseResp(submitData, "video_generation submit");

    const taskId = submitData.task_id as string | undefined;
    if (!taskId) {
      throw new Error(
        `MiniMax video_generation returned no task_id: ${JSON.stringify(submitData)}`
      );
    }

    const fileId = await this._pollVideoTask(taskId);
    return this._downloadFile(fileId);
  }

  private async _pollVideoTask(
    taskId: string,
    pollIntervalMs = 5000,
    maxAttempts = 360
  ): Promise<string> {
    const url = `${MINIMAX_BASE_URL}/v1/query/video_generation?task_id=${encodeURIComponent(
      taskId
    )}`;
    for (let i = 0; i < maxAttempts; i++) {
      const res = await this._minimaxFetch(url, { headers: this.headers() });
      if (!res.ok) {
        throw new Error(
          `MiniMax video status failed: ${res.status} ${await res.text()}`
        );
      }
      const data = (await res.json()) as Record<string, unknown>;
      const status = String(data.status ?? "").toLowerCase();
      if (status === "success") {
        const fileId = data.file_id as string | undefined;
        if (!fileId) {
          throw new Error("MiniMax video task succeeded but returned no file_id");
        }
        return fileId;
      }
      if (status === "fail" || status === "failed") {
        throw new Error(
          `MiniMax video task failed: ${JSON.stringify(data.base_resp ?? data)}`
        );
      }
      await new Promise((r) => setTimeout(r, pollIntervalMs));
    }
    throw new Error(
      `MiniMax video task timed out after ${maxAttempts * pollIntervalMs}ms`
    );
  }

  private async _downloadFile(fileId: string): Promise<Uint8Array> {
    const url = `${MINIMAX_BASE_URL}/v1/files/retrieve?file_id=${encodeURIComponent(
      fileId
    )}`;
    const res = await this._minimaxFetch(url, { headers: this.headers() });
    if (!res.ok) {
      throw new Error(
        `MiniMax files/retrieve failed: ${res.status} ${await res.text()}`
      );
    }
    const data = (await res.json()) as Record<string, unknown>;
    assertBaseResp(data, "files/retrieve");
    const file = data.file as Record<string, unknown> | undefined;
    const downloadUrl = (file?.download_url ?? file?.downloadURL) as
      | string
      | undefined;
    if (!downloadUrl) {
      throw new Error(
        `MiniMax files/retrieve returned no download_url: ${JSON.stringify(data)}`
      );
    }
    const dl = await this._minimaxFetch(downloadUrl);
    if (!dl.ok) {
      throw new Error(`Failed to download MiniMax file from ${downloadUrl}`);
    }
    return new Uint8Array(await dl.arrayBuffer());
  }

  // ---------------------------------------------------------------------------
  // Text-to-Speech — POST /v1/t2a_v2
  // ---------------------------------------------------------------------------

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

    const fmt = (args.audioFormat ?? "mp3").toLowerCase();
    const formatToMime: Record<string, string> = {
      mp3: "audio/mpeg",
      wav: "audio/wav",
      flac: "audio/flac",
      pcm: "audio/pcm"
    };
    if (!(fmt in formatToMime) || fmt === "pcm") {
      // Defer to streaming PCM path for raw samples / unknown formats
      return null;
    }

    const bytes = await this._synthesize(args, fmt);
    return { data: bytes, mimeType: formatToMime[fmt] };
  }

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
    const bytes = await this._synthesize(args, "pcm");
    yield { samples: toInt16Samples(bytes), sampleRate: 32000 };
  }

  private async _synthesize(
    args: {
      text: string;
      model: string;
      voice?: string;
      speed?: number;
    },
    format: string
  ): Promise<Uint8Array> {
    const body: Record<string, unknown> = {
      model: args.model || "speech-2.6-hd",
      text: args.text,
      stream: false,
      voice_setting: {
        voice_id: args.voice ?? "English_Trustworth_Man",
        speed: Math.max(0.5, Math.min(2.0, args.speed ?? 1.0)),
        vol: 1.0,
        pitch: 0
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format,
        channel: 1
      }
    };

    log.debug("MiniMax textToSpeech", { model: body.model, format });

    const res = await this._minimaxFetch(`${MINIMAX_BASE_URL}/v1/t2a_v2`, {
      method: "POST",
      headers: this.headers(),
      body: JSON.stringify(body)
    });
    if (!res.ok) {
      throw new Error(
        `MiniMax t2a_v2 failed: ${res.status} ${await res.text()}`
      );
    }
    const data = (await res.json()) as Record<string, unknown>;
    assertBaseResp(data, "t2a_v2");

    const payload = data.data as Record<string, unknown> | undefined;
    const audioHex = payload?.audio as string | undefined;
    if (!audioHex) {
      throw new Error(
        `MiniMax t2a_v2 returned no audio data: ${JSON.stringify(data)}`
      );
    }
    return hexToUint8(audioHex);
  }
}
