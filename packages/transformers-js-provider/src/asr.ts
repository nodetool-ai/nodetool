import { decodeWav, getPipeline, resampleLinear } from "@nodetool-ai/transformers-js-nodes";
import type { ASRResult } from "@nodetool-ai/runtime";

const TARGET_SAMPLE_RATE = 16000;

interface AsrArgs {
  audio: Uint8Array;
  model: string;
  language?: string;
  word_timestamps?: boolean;
}

interface AsrPipelineResult {
  text?: string;
  chunks?: Array<{ timestamp?: [number, number]; text?: string }>;
}

type AsrPipelineFn = (
  audio: Float32Array,
  opts?: Record<string, unknown>
) => Promise<AsrPipelineResult>;

export async function automaticSpeechRecognition(
  args: AsrArgs
): Promise<ASRResult> {
  const decoded = decodeWav(args.audio);
  const samples = resampleLinear(
    decoded.samples,
    decoded.sampleRate,
    TARGET_SAMPLE_RATE
  );

  const pipeline = (await getPipeline({
    task: "automatic-speech-recognition",
    model: args.model
  })) as AsrPipelineFn;

  const opts: Record<string, unknown> = {};
  if (args.language) opts.language = args.language;
  if (args.word_timestamps) opts.return_timestamps = "word";

  const result = await pipeline(samples, opts);

  const text = result?.text ?? "";
  const chunks = Array.isArray(result?.chunks)
    ? result.chunks
        .filter((c) => Array.isArray(c?.timestamp) && typeof c?.text === "string")
        .map((c) => ({
          timestamp: c.timestamp as [number, number],
          text: c.text as string
        }))
    : undefined;

  return chunks ? { text, chunks } : { text };
}
