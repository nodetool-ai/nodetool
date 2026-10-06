import {
  BaseProvider,
  sniffAudioMime,
  type ASRModel,
  type ASRResult,
  type Message,
  type ProviderStreamItem,
  type ProviderCapability
} from "@nodetool-ai/runtime";
import type { AsrArgs } from "./whisper-cpp-provider.js";

function parseResult(value: unknown): ASRResult {
  if (
    !value ||
    typeof value !== "object" ||
    !("text" in value) ||
    typeof value.text !== "string"
  ) {
    throw new Error("Invalid whisper-server response: expected text");
  }
  const chunks: NonNullable<ASRResult["chunks"]> = [];
  if ("segments" in value && Array.isArray(value.segments)) {
    for (const segment of value.segments) {
      if (
        !segment ||
        typeof segment !== "object" ||
        !("start" in segment) ||
        !("end" in segment) ||
        !("text" in segment) ||
        typeof segment.start !== "number" ||
        typeof segment.end !== "number" ||
        typeof segment.text !== "string"
      ) {
        throw new Error(
          "Invalid whisper-server response: expected segment start, end and text"
        );
      }
      chunks.push({
        timestamp: [segment.start, segment.end],
        text: segment.text
      });
    }
  }
  return { text: value.text.trim(), chunks };
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
  protected override declaredCapabilities() {
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
    return parseResult(await response.json());
  }
}
