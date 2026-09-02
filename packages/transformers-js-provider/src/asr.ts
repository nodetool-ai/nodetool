import { decodeAudioBytesToSamples, getPipeline } from "@nodetool-ai/transformers-js-nodes";
import type { ASRResult } from "@nodetool-ai/runtime";

const TARGET_SAMPLE_RATE = 16000;

interface AsrArgs {
  audio: Uint8Array;
  model: string;
  language?: string;
  /** Accepted for provider-interface parity; transformers.js ASR has no
   * initial-prompt parameter, so it is currently ignored. */
  prompt?: string;
  temperature?: number;
  word_timestamps?: boolean;
}

interface AsrPipelineResult {
  text?: string;
  chunks?: Array<{ timestamp?: [number, number]; text?: string }>;
}

/** The `automatic-speech-recognition` call options this provider sets. */
interface AsrPipelineOptions {
  language?: string;
  temperature?: number;
  return_timestamps?: "word";
}

type AsrPipelineFn = (
  audio: Float32Array,
  opts?: AsrPipelineOptions
) => Promise<AsrPipelineResult>;

type AsrPipelineChunk = NonNullable<AsrPipelineResult["chunks"]>[number];

/** A chunk carrying both halves of a word timestamp, the only kind `ASRResult` can hold. */
type TimedAsrChunk = AsrPipelineChunk & { timestamp: [number, number]; text: string };

function isTimedChunk(chunk: AsrPipelineChunk | null): chunk is TimedAsrChunk {
  return Array.isArray(chunk?.timestamp) && typeof chunk?.text === "string";
}

export async function automaticSpeechRecognition(
  args: AsrArgs
): Promise<ASRResult> {
  // Decode arbitrary audio (WAV in-process, everything else via ffmpeg) to
  // mono Float32 at the model's expected 16 kHz — same path as the node side,
  // so mp3/m4a/flac/etc. work instead of failing with "not a WAV file".
  const samples = await decodeAudioBytesToSamples(args.audio, TARGET_SAMPLE_RATE);

  const pipeline = await getPipeline<AsrPipelineFn>({
    task: "automatic-speech-recognition",
    model: args.model
  });

  const opts: AsrPipelineOptions = {};
  if (args.language) opts.language = args.language;
  if (args.temperature != null) opts.temperature = args.temperature;
  if (args.word_timestamps) opts.return_timestamps = "word";

  const result = await pipeline(samples, opts);

  const text = result?.text ?? "";
  const chunks = Array.isArray(result?.chunks)
    ? result.chunks
        .filter(isTimedChunk)
        .map((c) => ({ timestamp: c.timestamp, text: c.text }))
    : undefined;

  return chunks ? { text, chunks } : { text };
}
