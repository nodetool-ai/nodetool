import {
  BaseProvider,
  sniffAudioMime,
  type ASRModel,
  type ASRResult,
  type Message,
  type ProviderStreamItem,
  type ProviderCapability
} from "@nodetool-ai/runtime";
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
    const mime = sniffAudioMime(args.audio);
    const extension =
      mime === "audio/wav"
        ? "wav"
        : mime === "audio/ogg"
          ? "ogg"
          : mime === "audio/flac"
            ? "flac"
            : "mp3";
    const form = new FormData();
    form.set(
      "file",
      new Blob([new Uint8Array(args.audio)], { type: mime }),
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
