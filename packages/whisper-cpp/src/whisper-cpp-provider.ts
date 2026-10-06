import { availableParallelism } from "node:os";
import {
  BaseProvider,
  type ASRModel,
  type ASRResult,
  type Message,
  type ProviderStreamItem,
  type ProviderCapability
} from "@nodetool-ai/runtime";
import {
  loadWhisperNode,
  resolveVariant,
  type TranscribeOptions
} from "./binding.js";
import { decodeToPcm16 } from "./audio.js";
import { contextCache } from "./context-cache.js";
import { discoverASRModels, resolveModelPath } from "./model-discovery.js";

export interface WhisperSettings {
  WHISPER_CPP_MODELS_DIR?: string;
  WHISPER_CPP_GPU_BACKEND?: string;
}
export type AsrArgs = Parameters<BaseProvider["automaticSpeechRecognition"]>[0];
export class WhisperCppProvider extends BaseProvider {
  readonly modelsDir: string | undefined;
  readonly gpuBackend: string | undefined;
  constructor(secrets: WhisperSettings = {}) {
    super("whisper_cpp");
    this.modelsDir =
      secrets.WHISPER_CPP_MODELS_DIR || process.env.WHISPER_CPP_MODELS_DIR;
    this.gpuBackend =
      secrets.WHISPER_CPP_GPU_BACKEND || process.env.WHISPER_CPP_GPU_BACKEND;
  }
  static override requiredSecrets(): string[] {
    return [];
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
    throw new Error("whisper_cpp does not support chat generation");
  }
  override generateMessages(
    _args: Parameters<BaseProvider["generateMessages"]>[0]
  ): AsyncGenerator<ProviderStreamItem> {
    throw new Error("whisper_cpp does not support chat generation");
  }
  override async unavailableReason(): Promise<string | null> {
    try {
      await loadWhisperNode();
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    }
  }
  override async getAvailableASRModels(): Promise<ASRModel[]> {
    if (await this.unavailableReason()) {
      return [];
    }
    return discoverASRModels(this.modelsDir);
  }
  resolveModel(id: string): Promise<string> {
    return resolveModelPath(id, this.modelsDir);
  }
  async transcribePcm(
    modelPath: string,
    audio: ArrayBuffer,
    options: TranscribeOptions,
    signal?: AbortSignal
  ): Promise<ASRResult> {
    return contextCache.withContext(
      modelPath,
      resolveVariant(this.gpuBackend),
      this.gpuBackend !== "cpu",
      async (context) => {
        signal?.throwIfAborted();
        const task = context.transcribeData(audio, {
          ...options,
          maxThreads: Math.max(1, Math.min(8, availableParallelism() - 1))
        });
        const abort = () => {
          void task.stop().catch(() => {
            /* The task promise reports native failures. */
          });
        };
        signal?.addEventListener("abort", abort, { once: true });
        try {
          const result = await task.promise;
          signal?.throwIfAborted();
          return {
            text: result.result.trim(),
            chunks: result.segments.map((segment) => ({
              // whisper.node 1.1.3 converts whisper.cpp ticks to milliseconds.
              timestamp: [segment.t0 / 1000, segment.t1 / 1000],
              text: segment.text
            }))
          };
        } finally {
          signal?.removeEventListener("abort", abort);
        }
      }
    );
  }
  override async automaticSpeechRecognition(args: AsrArgs): Promise<ASRResult> {
    if (args.audio.length === 0) {
      throw new Error("audio must not be empty");
    }
    await loadWhisperNode();
    const modelPath = await this.resolveModel(args.model);
    const audio = await decodeToPcm16(args.audio);
    // BaseProvider ASR arguments do not expose cancellation yet.
    const options: TranscribeOptions = {
      language: args.language || "auto",
      tokenTimestamps: args.word_timestamps ?? false
    };
    if (args.prompt !== undefined) {
      options.prompt = args.prompt;
    }
    if (args.temperature !== undefined) {
      options.temperature = args.temperature;
    }
    return this.transcribePcm(modelPath, audio, options);
  }
}
