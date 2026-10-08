import {
  BaseProvider,
  sniffAudioMime,
  type ASRModel,
  type ASRResult,
  type Message,
  type ProviderStreamItem,
  type ProviderCapability
} from "@nodetool-ai/runtime";
import {
  decodeAudioBytesToSamples,
  encodeWav
} from "@nodetool-ai/transformers-js-nodes";
import { z } from "zod";
import type { AsrArgs } from "./whisper-cpp-provider.js";

const resultSchema = z.object({ text: z.string() });
const segmentSchema = z.object({
  start: z.number(),
  end: z.number(),
  text: z.string()
});

async function readResult(response: Response): Promise<ASRResult> {
  const value = await response.json();
  const result = resultSchema.safeParse(value);
  if (!result.success) {
    throw new Error("Invalid whisper-server response: expected text");
  }
  const chunks: NonNullable<ASRResult["chunks"]> = [];
  const segments = Array.isArray(value.segments) ? value.segments : [];
  for (const raw of segments) {
    const segment = segmentSchema.safeParse(raw);
    if (!segment.success) {
      throw new Error(
        "Invalid whisper-server response: expected segment start, end and text"
      );
    }
    chunks.push({
      timestamp: [segment.data.start, segment.data.end],
      text: segment.data.text
    });
  }
  return { text: result.data.text.trim(), chunks };
}
/** ID3-tagged MP3 or a raw MPEG audio frame sync. */
function isMp3(bytes: Uint8Array): boolean {
  return (
    (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) ||
    (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
  );
}

/**
 * whisper-server decodes uploads with miniaudio, which reads WAV, MP3 and
 * FLAC only (unless the server runs with `--convert`). Send those unchanged
 * and convert anything else (WebM/Opus, M4A, OGG) to 16 kHz mono WAV.
 * When local decoding fails, send the original bytes so a `--convert`
 * server can still try.
 */
async function toServerAudio(
  audio: Uint8Array
): Promise<{ bytes: Uint8Array; mime: string; extension: string }> {
  const mime = sniffAudioMime(audio);
  if (mime === "audio/wav") {
    return { bytes: audio, mime, extension: "wav" };
  }
  if (mime === "audio/flac") {
    return { bytes: audio, mime, extension: "flac" };
  }
  if (isMp3(audio)) {
    return { bytes: audio, mime: "audio/mpeg", extension: "mp3" };
  }
  let samples: Float32Array;
  try {
    samples = await decodeAudioBytesToSamples(audio, 16000);
  } catch {
    return { bytes: audio, mime: "application/octet-stream", extension: "bin" };
  }
  return { bytes: encodeWav(samples, 16000), mime: "audio/wav", extension: "wav" };
}

export class WhisperServerProvider extends BaseProvider {
  readonly baseUrl: string;
  private readonly fetchFn: typeof fetch;
  constructor(
    secrets: { WHISPER_CPP_SERVER_URL?: string } = {},
    options: { fetchFn?: typeof fetch } = {}
  ) {
    super("whisper_cpp_server");
    const url =
      secrets.WHISPER_CPP_SERVER_URL || process.env.WHISPER_CPP_SERVER_URL;
    if (!url?.trim()) {
      throw new Error("WHISPER_CPP_SERVER_URL is required");
    }
    this.baseUrl = url.trim().replace(/\/+$/, "");
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }
  static override requiredSecrets(): string[] {
    return ["WHISPER_CPP_SERVER_URL"];
  }
  protected override declaredCapabilities(): readonly ProviderCapability[] {
    return ["automatic_speech_recognition"] as const;
  }
  override getCapabilities(): ProviderCapability[] {
    return ["automatic_speech_recognition"];
  }
  override async generateMessage(
    _args: Parameters<BaseProvider["generateMessage"]>[0]
  ): Promise<Message> {
    throw new Error("whisper_cpp_server does not support chat generation");
  }
  override generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("whisper_cpp_server does not support chat generation");
  }
  override async getAvailableASRModels(): Promise<ASRModel[]> {
    return [
      { id: "default", name: "whisper-server", provider: "whisper_cpp_server" }
    ];
  }
  override async automaticSpeechRecognition(args: AsrArgs): Promise<ASRResult> {
    if (args.audio.length === 0) {
      throw new Error("audio must not be empty");
    }
    const { bytes, mime, extension } = await toServerAudio(args.audio);
    const form = new FormData();
    form.set(
      "file",
      new Blob([new Uint8Array(bytes)], { type: mime }),
      `audio.${extension}`
    );
    form.set("response_format", "verbose_json");
    form.set("language", args.language || "auto");
    if (args.temperature !== undefined) {
      form.set("temperature", String(args.temperature));
    }
    if (args.prompt !== undefined) {
      form.set("prompt", args.prompt);
    }
    // Operator-configured local service, following LlamaProvider's fetch policy.
    const response = await this.fetchFn(`${this.baseUrl}/inference`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(10 * 60 * 1000)
    });
    if (!response.ok) {
      throw new Error(
        `whisper-server inference failed (${response.status}): ${await response.text()}`
      );
    }
    return readResult(response);
  }
}
