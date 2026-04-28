import {
  encodeWav,
  getKokoro,
  getPipeline,
  isKokoroRepo,
  isSpeechT5Repo
} from "@nodetool/transformers-js-nodes";
import type { EncodedAudioResult } from "@nodetool/runtime";

const SPEECHT5_DEFAULT_EMBEDDINGS =
  "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin";

interface TtsArgs {
  text: string;
  model: string;
  voice?: string;
  speed?: number;
  audioFormat?: string;
}

interface PipelineTtsResult {
  audio?: Float32Array | ArrayLike<number>;
  sampling_rate?: number;
}

type TtsPipelineFn = (
  input: string,
  opts?: Record<string, unknown>
) => Promise<PipelineTtsResult>;

export async function textToSpeechEncoded(
  args: TtsArgs
): Promise<EncodedAudioResult> {
  if (!args.text) throw new Error("text is required");

  let samples: Float32Array | ArrayLike<number> | undefined;
  let samplingRate = 16000;

  if (isKokoroRepo(args.model)) {
    const tts = await getKokoro(args.model, undefined, undefined);
    const voice = args.voice || "af_heart";
    const result = await tts.generate(args.text, { voice: voice as never });
    samples = result.audio as Float32Array;
    samplingRate = result.sampling_rate ?? samplingRate;
  } else {
    const pipeline = (await getPipeline({
      task: "text-to-speech",
      model: args.model
    })) as TtsPipelineFn;

    const opts: Record<string, unknown> = {};
    if (isSpeechT5Repo(args.model)) {
      opts.speaker_embeddings = SPEECHT5_DEFAULT_EMBEDDINGS;
    }

    const result = await pipeline(args.text, opts);
    samples = result?.audio;
    samplingRate = result?.sampling_rate ?? samplingRate;
  }

  if (!samples) {
    throw new Error("Text-to-speech pipeline returned no audio data");
  }

  const wav = encodeWav(samples, samplingRate);
  return {
    data: new Uint8Array(wav.buffer, wav.byteOffset, wav.byteLength),
    mimeType: "audio/wav"
  };
}
