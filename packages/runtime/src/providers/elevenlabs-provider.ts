/**
 * Unified provider for ElevenLabs text-to-speech.
 *
 * Surfaces ElevenLabs voices/models in the unified TTS picker and generates
 * speech via the REST API. Chat / LLM generation is not supported.
 *
 * - `textToSpeech()` requests raw `pcm_24000` and yields Int16 samples (the
 *   streaming path used by the unified TTS node and realtime callers).
 * - `textToSpeechEncoded()` requests `mp3_44100_128` and returns the encoded
 *   bytes (the path used by chat audio / media tools).
 */

import { createLogger } from "@nodetool-ai/config";
import {
  BaseProvider,
  type EndpointCallRequest,
  type EndpointCallResult,
  type MediaUpload,
  type ProviderCapability
} from "./base-provider.js";
import { recordGenerationReceipt } from "../generation-receipt.js";
import type {
  EncodedAudioResult,
  Message,
  StreamingAudioChunk,
  TTSModel
} from "./types.js";

const log = createLogger("nodetool.runtime.providers.elevenlabs");

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

/** Built-in ElevenLabs voices (name → voice id). */
const VOICE_ID_MAP: Record<string, string> = {
  Aria: "9BWtsMINqrJLrRacOk9x",
  Roger: "CwhRBWXzGAHq8TQ4Fs17",
  Sarah: "EXAVITQu4vr4xnSDxMaL",
  Laura: "FGY2WhTYpPnrIDTdsKH5",
  Charlie: "IKne3meq5aSn9XLyUdCD",
  George: "JBFqnCBsd6RMkjVDRZzb",
  Callum: "N2lVS1w4EtoT3dr4eOWO",
  River: "SAz9YHcvj6GT2YYXdXww",
  Liam: "TX3LPaxmHKxFdv7VOQHJ",
  Charlotte: "XB0fDUnXU5powFXDhCwa",
  Alice: "Xb7hH8MSUJpSbSDYk0k2",
  Will: "bIHbv24MWmeRgasZH58o",
  Jessica: "cgSgspJ2msm6clMCkdW9",
  Eric: "cjVigY5qzO86Huf0OWal",
  Chris: "iP95p4xoKVk53GoZ742B",
  Brian: "nPczCjzI2devNBz1zQrb",
  Daniel: "onwK4e9ZLuTAKqWW03F9",
  Lily: "pFZP5JQG7iQjIQuC4Bku",
  Bill: "pqHfZKP75CvOlQylNhV4"
};

const VOICE_NAMES = Object.keys(VOICE_ID_MAP);

/** Available TTS models (id → display name). */
const MODELS: Array<{ id: string; name: string }> = [
  { id: "eleven_v3", name: "Eleven v3" },
  { id: "eleven_multilingual_v2", name: "Multilingual v2" },
  { id: "eleven_turbo_v2_5", name: "Turbo v2.5" },
  { id: "eleven_flash_v2_5", name: "Flash v2.5" },
  { id: "eleven_turbo_v2", name: "Turbo v2" },
  { id: "eleven_flash_v2", name: "Flash v2" },
  { id: "eleven_monolingual_v1", name: "Monolingual v1" },
  { id: "eleven_multilingual_v1", name: "Multilingual v1" }
];

const SAMPLE_RATE = 24000;

interface ElevenLabsProviderOptions {
  fetchFn?: typeof fetch;
}

/** A multipart file field: the bytes with their type and file name. */
type MediaPart = Pick<MediaUpload, "bytes" | "mimeType" | "filename">;

/** Put a synchronous call's vendor request id on the generation receipt. */
function recordRequestId(requestId: string | null): string | null {
  if (requestId) recordGenerationReceipt({ provider_request_id: requestId });
  return requestId;
}

function isMediaPart(value: unknown): value is MediaPart {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return record.bytes instanceof Uint8Array && typeof record.mimeType === "string";
}

export class ElevenLabsProvider extends BaseProvider {
  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return [
      "text_to_speech"
    ];
  }

  static requiredSecrets(): string[] {
    return ["ELEVENLABS_API_KEY"];
  }

  readonly apiKey: string;
  private readonly _fetch: typeof fetch;

  constructor(
    secrets: { ELEVENLABS_API_KEY?: string },
    options: ElevenLabsProviderOptions = {}
  ) {
    super("elevenlabs");
    const apiKey = secrets.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error("ELEVENLABS_API_KEY is required");
    }
    this.apiKey = apiKey;
    this._fetch = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  getContainerEnv() {
    return { ELEVENLABS_API_KEY: this.apiKey };
  }

  generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("elevenlabs does not support chat generation");
  }

  // eslint-disable-next-line require-yield
  async *generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): ReturnType<BaseProvider["generateMessages"]> {
    throw new Error("elevenlabs does not support chat generation");
  }

  override async getAvailableTTSModels(): Promise<TTSModel[]> {
    return MODELS.map((m) => ({
      id: m.id,
      name: m.name,
      provider: "elevenlabs",
      voices: VOICE_NAMES
    }));
  }

  /** Resolve a voice name ("Aria") or raw voice id to a voice id. */
  private resolveVoiceId(voice?: string): string {
    if (!voice) return VOICE_ID_MAP.Aria;
    return VOICE_ID_MAP[voice] ?? voice;
  }

  private async requestSpeech(
    args: { text: string; model: string; voice?: string; speed?: number },
    outputFormat: string
  ): Promise<Uint8Array> {
    const voiceId = this.resolveVoiceId(args.voice);
    const url =
      `${ELEVENLABS_API_BASE}/text-to-speech/${voiceId}` +
      `?output_format=${outputFormat}`;
    const body: Record<string, unknown> = {
      text: args.text,
      model_id: args.model
    };
    // ElevenLabs applies playback speed via voice_settings.speed (0.7–1.2).
    // Forward it when the caller asked for a non-default tempo — omitting it
    // silently discarded the request.
    if (args.speed != null && args.speed !== 1.0) {
      body.voice_settings = { speed: Math.max(0.7, Math.min(1.2, args.speed)) };
    }
    const response = await this._fetch(url, {
      method: "POST",
      headers: {
        "xi-api-key": this.apiKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`ElevenLabs TTS failed: ${response.status} ${detail}`);
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  override supportsEndpointCalls(): boolean {
    return true;
  }

  /**
   * Call one ElevenLabs REST endpoint. `route` selects the family:
   *
   * - `text-to-speech`: POST `/text-to-speech/{voice_id}`. `input.voice_id`
   *   fills the path and an optional `input.output_format` the query. The
   *   rest of `input` is the JSON body, with `model_id` defaulting to
   *   `model`. The output is the audio as `{ data, mimeType }`.
   * - `speech-to-text`: POST `/speech-to-text` as multipart form data. Each
   *   `input` entry is one form field in order. A `{ bytes, mimeType,
   *   filename }` value is sent as a file part, any other scalar as its
   *   string. The output is the transcription JSON.
   *
   * ElevenLabs reads media from the request itself, so there is no upload
   * step: `uploadMedia` keeps the base default.
   */
  override async callEndpoint(
    req: EndpointCallRequest
  ): Promise<EndpointCallResult> {
    if (req.route === "text-to-speech") {
      return this.callTextToSpeech(req);
    }
    if (req.route === "speech-to-text") {
      return this.callSpeechToText(req);
    }
    throw new Error(
      `elevenlabs endpoint route must be "text-to-speech" or "speech-to-text", got ${req.route === undefined ? "none" : `"${req.route}"`}`
    );
  }

  private async callTextToSpeech(
    req: EndpointCallRequest
  ): Promise<EndpointCallResult> {
    const { voice_id: voiceId, output_format: outputFormat, ...rest } =
      req.input;
    if (typeof voiceId !== "string" || !voiceId) {
      throw new Error("elevenlabs text-to-speech needs input.voice_id");
    }
    const body = { ...rest };
    if (body.model_id === undefined) body.model_id = req.model;
    let url = `${ELEVENLABS_API_BASE}/text-to-speech/${encodeURIComponent(voiceId)}`;
    if (outputFormat !== undefined) {
      url += `?output_format=${encodeURIComponent(String(outputFormat))}`;
    }
    const response = await this.postEndpoint(
      url,
      {
        "xi-api-key": this.apiKey,
        "Content-Type": "application/json"
      },
      JSON.stringify(body),
      req.signal
    );
    const data = new Uint8Array(await response.arrayBuffer());
    return {
      output: {
        data,
        mimeType: response.headers.get("content-type") || "audio/mpeg"
      },
      requestId: recordRequestId(response.headers.get("request-id"))
    };
  }

  private async callSpeechToText(
    req: EndpointCallRequest
  ): Promise<EndpointCallResult> {
    const form = new FormData();
    for (const [name, value] of Object.entries(req.input)) {
      if (value === undefined || value === null) continue;
      if (isMediaPart(value)) {
        form.append(
          name,
          new Blob([new Uint8Array(value.bytes)], { type: value.mimeType }),
          value.filename ?? name
        );
      } else if (
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
      ) {
        form.append(name, String(value));
      } else {
        throw new Error(
          `elevenlabs speech-to-text field "${name}" must be a string, number, boolean or file part`
        );
      }
    }
    const response = await this.postEndpoint(
      `${ELEVENLABS_API_BASE}/speech-to-text`,
      { "xi-api-key": this.apiKey },
      form,
      req.signal
    );
    const output: unknown = await response.json();
    const transcriptionId =
      output !== null && typeof output === "object"
        ? (output as Record<string, unknown>).transcription_id
        : undefined;
    return {
      output,
      requestId: recordRequestId(
        typeof transcriptionId === "string"
          ? transcriptionId
          : response.headers.get("request-id")
      )
    };
  }

  /** POST and return the response, or throw with the vendor's error text. */
  private async postEndpoint(
    url: string,
    headers: Record<string, string>,
    body: string | FormData,
    signal: AbortSignal | undefined
  ): Promise<Response> {
    const init: RequestInit = { method: "POST", headers, body };
    if (signal) init.signal = signal;
    const response = await this._fetch(url, init);
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`ElevenLabs API error: ${errorText}`);
    }
    return response;
  }

  override async *textToSpeech(args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
    audioFormat?: string;
  }): AsyncGenerator<StreamingAudioChunk> {
    if (!args.text) throw new Error("text must not be empty");
    log.debug("ElevenLabs textToSpeech", { model: args.model });
    const bytes = await this.requestSpeech(args, `pcm_${SAMPLE_RATE}`);
    // ElevenLabs `pcm_24000` is raw little-endian PCM16, no header.
    const samples = new Int16Array(
      bytes.buffer,
      bytes.byteOffset,
      Math.floor(bytes.byteLength / 2)
    );
    yield { samples, sampleRate: SAMPLE_RATE };
  }

  override async textToSpeechEncoded(args: {
    text: string;
    model: string;
    voice?: string;
    speed?: number;
    audioFormat?: string;
  }): Promise<EncodedAudioResult | null> {
    if (!args.text) throw new Error("text must not be empty");
    log.debug("ElevenLabs textToSpeechEncoded", { model: args.model });
    const fmt = (args.audioFormat ?? "mp3").toLowerCase();
    if (fmt !== "mp3" && fmt !== "mpeg") {
      // This encoded path only produces MP3. For any other requested format
      // (pcm/wav/flac/…) defer to the streaming PCM path instead of silently
      // handing back MP3 bytes mislabeled as the requested format.
      return null;
    }
    const bytes = await this.requestSpeech(args, "mp3_44100_128");
    return { data: bytes, mimeType: "audio/mpeg" };
  }
}
