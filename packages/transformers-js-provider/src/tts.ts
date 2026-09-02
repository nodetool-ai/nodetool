import {
  KOKORO_VOICES,
  encodeWav,
  getKokoro,
  getPipeline,
  isKokoroRepo,
  isSpeechT5Repo,
  type KokoroVoice
} from "@nodetool-ai/transformers-js-nodes";
import type { EncodedAudioResult } from "@nodetool-ai/runtime";

const SPEECHT5_DEFAULT_EMBEDDINGS =
  "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin";

const DEFAULT_KOKORO_VOICE: KokoroVoice = "af_heart";

function isKokoroVoice(voice: string): voice is KokoroVoice {
  return KOKORO_VOICES.some((known) => known === voice);
}

/**
 * Kokoro fetches `voices/<voice>.bin` from the hub, so an unrecognized name
 * fails as a 404 from inside the library. Name the valid set here instead.
 */
function resolveKokoroVoice(voice: string | undefined): KokoroVoice {
  if (!voice) return DEFAULT_KOKORO_VOICE;
  if (!isKokoroVoice(voice)) {
    throw new Error(
      `Unknown Kokoro voice "${voice}". Expected one of: ${KOKORO_VOICES.join(", ")}.`
    );
  }
  return voice;
}

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

/** The `text-to-speech` call options this provider sets. */
interface TtsPipelineOptions {
  /** URL of a SpeechT5 speaker-embedding tensor; unused by other architectures. */
  speaker_embeddings?: string;
}

type TtsPipelineFn = (
  input: string,
  opts?: TtsPipelineOptions
) => Promise<PipelineTtsResult>;

export async function textToSpeechEncoded(
  args: TtsArgs
): Promise<EncodedAudioResult> {
  if (!args.text) throw new Error("text is required");

  let samples: Float32Array | ArrayLike<number> | undefined;
  let samplingRate = 16000;

  if (isKokoroRepo(args.model)) {
    const tts = await getKokoro(args.model, undefined, undefined);
    const result = await tts.generate(args.text, {
      voice: resolveKokoroVoice(args.voice)
    });
    samples = result.audio;
    samplingRate = result.sampling_rate ?? samplingRate;
  } else {
    const pipeline = await getPipeline<TtsPipelineFn>({
      task: "text-to-speech",
      model: args.model
    });

    const opts: TtsPipelineOptions = {};
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
