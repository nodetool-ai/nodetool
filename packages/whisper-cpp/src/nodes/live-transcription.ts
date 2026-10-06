import {
  BaseNode,
  prop,
  type StreamingInputs,
  type StreamingOutputs
} from "@nodetool-ai/node-sdk";
import { z } from "zod";
import { createLogger } from "@nodetool-ai/config";
import type { ProcessingContext } from "@nodetool-ai/runtime";
import type { ASRModel } from "@nodetool-ai/runtime";
import {
  loadWhisperNode,
  resolveVariant,
  type WhisperVadContext
} from "../binding.js";
import { pcm16Base64ToSamples, samplesToPcm16 } from "../audio.js";
import { discoverVadModels } from "../model-discovery.js";
import { WhisperCppProvider } from "../whisper-cpp-provider.js";

/** Each field degrades to absent when malformed, so one bad field never drops the chunk. */
const liveItemSchema = z.object({
  done: z.boolean().optional().catch(undefined),
  content_type: z.string().optional().catch(undefined),
  content: z.string().optional().catch(undefined),
  content_metadata: z
    .object({ sample_rate: z.number().optional().catch(undefined) })
    .optional()
    .catch(undefined)
});

const log = createLogger("whisper-cpp.live-transcription");
export class LiveTranscriptionNode extends BaseNode {
  static readonly nodeType = "whisper_cpp.LiveTranscription";
  static readonly title = "Live Transcription";
  static readonly description =
    "Transcribe streaming PCM16 audio locally with whisper.cpp.\n    speech, audio, transcription, streaming";
  static readonly isStreamingInput = true;
  static readonly inputFields = ["chunk"];
  static readonly metadataOutputTypes = { chunk: "chunk", text: "str" };
  static readonly outputCorrelation = {
    chunk: { kind: "iteration", source: "__execution__", group: "stream" },
    text: { kind: "single", source: "__execution__" }
  } as const;
  static readonly requiredSettings: string[] = [];

  @prop({ type: "chunk", title: "Chunk" }) declare chunk: unknown;
  @prop({
    type: "asr_model",
    default: { type: "asr_model", provider: "whisper_cpp", id: "" },
    title: "Model"
  })
  declare model: ASRModel;
  @prop({ type: "str", default: "", title: "Language" })
  declare language: string;
  @prop({ type: "str", default: "", title: "Prompt" }) declare prompt: string;
  @prop({ type: "float", default: 0.5, min: 0, max: 1, title: "VAD Threshold" })
  declare vad_threshold: number;
  @prop({ type: "int", default: 500, min: 0, title: "Minimum Silence (ms)" })
  declare min_silence_ms: number;
  @prop({ type: "float", default: 20, min: 1, title: "Maximum Segment (s)" })
  declare max_segment_s: number;

  override async process(): Promise<Record<string, never>> {
    return {};
  }
  override async run(
    inputs: StreamingInputs,
    outputs: StreamingOutputs,
    context?: ProcessingContext
  ): Promise<void> {
    if (!Number.isFinite(this.max_segment_s) || this.max_segment_s < 1) {
      throw new Error("Maximum segment duration must be at least one second");
    }
    if (this.model.provider !== "whisper_cpp") {
      throw new Error("Live Transcription requires a whisper_cpp model");
    }
    const provider = new WhisperCppProvider({
      WHISPER_CPP_MODELS_DIR:
        (await context?.getSecret("WHISPER_CPP_MODELS_DIR")) || undefined,
      WHISPER_CPP_GPU_BACKEND:
        (await context?.getSecret("WHISPER_CPP_GPU_BACKEND")) || undefined
    });
    const modelPath = await provider.resolveModel(this.model.id);
    const binding = await loadWhisperNode();
    const signal = context
      ? AbortSignal.any([context.signal, inputs.signal])
      : inputs.signal;
    signal?.throwIfAborted();
    let vad: WhisperVadContext | undefined;
    let worker = Promise.resolve();
    let workerError: unknown;
    const texts: string[] = [];
    let buffer: Float32Array = new Float32Array();
    const maxSamples = Math.floor(this.max_segment_s * 16000);
    const enqueue = (samples: Float32Array) => {
      worker = worker.then(async () => {
        try {
          signal?.throwIfAborted();
          if (workerError) {
            return;
          }
          const result = await provider.transcribePcm(
            modelPath,
            samplesToPcm16(samples),
            { language: this.language || "auto", prompt: this.prompt },
            signal
          );
          texts.push(result.text);
          await outputs.emit("chunk", {
            type: "chunk",
            content: result.text,
            content_type: "text",
            done: false
          });
        } catch (error) {
          workerError = error;
        }
      });
    };
    try {
      const vadModel = (await discoverVadModels(provider.modelsDir))[0];
      if (vadModel) {
        vad = await binding.initWhisperVad(
          { filePath: vadModel.id, useGpu: provider.gpuBackend !== "cpu" },
          resolveVariant(provider.gpuBackend)
        );
      } else {
        log.warn(
          "No whisper.cpp VAD model installed. Using fixed transcription windows."
        );
      }
      for await (const [handle, item] of inputs.any()) {
        signal?.throwIfAborted();
        if (workerError) {
          throw workerError;
        }
        if (handle === "__control__") {
          continue;
        }
        let content = "";
        let sampleRate = 16000;
        let done = false;
        const text = z.string().safeParse(item);
        const parsed = liveItemSchema.safeParse(item);
        if (text.success) {
          content = text.data;
        } else if (parsed.success) {
          const value = parsed.data;
          done = value.done === true;
          if (value.content_type === "audio") {
            content = value.content ?? "";
            sampleRate = value.content_metadata?.sample_rate ?? sampleRate;
          }
        }
        if (content) {
          const samples = pcm16Base64ToSamples(content, sampleRate);
          const combined = new Float32Array(buffer.length + samples.length);
          combined.set(buffer);
          combined.set(samples, buffer.length);
          buffer = combined;
          while (buffer.length >= 16000) {
            let cut = 0;
            if (vad) {
              const segments = await vad.detectSpeechData(
                samplesToPcm16(buffer),
                {
                  threshold: this.vad_threshold,
                  minSilenceDurationMs: this.min_silence_ms
                }
              );
              const last = segments.at(-1);
              // VAD passes through whisper.cpp centiseconds (ASR uses milliseconds).
              if (
                last &&
                (buffer.length / 16000 - last.t1 / 100) * 1000 >=
                  this.min_silence_ms
              ) {
                cut = Math.min(
                  buffer.length,
                  Math.round((last.t1 / 100) * 16000)
                );
              }
            }
            if (buffer.length >= maxSamples) {
              cut = cut > 0 ? Math.min(cut, maxSamples) : maxSamples;
            }
            if (cut <= 0) {
              break;
            }
            enqueue(buffer.slice(0, cut));
            buffer = buffer.slice(cut);
          }
        }
        if (done) {
          break;
        }
      }
      if (buffer.length) {
        enqueue(buffer);
      }
      await worker;
      if (workerError) {
        throw workerError;
      }
      signal?.throwIfAborted();
      await outputs.emit("chunk", {
        type: "chunk",
        content: "",
        content_type: "text",
        done: true
      });
      await outputs.emit("text", texts.filter(Boolean).join(" "));
    } finally {
      await worker;
      await vad?.release();
    }
  }
}
