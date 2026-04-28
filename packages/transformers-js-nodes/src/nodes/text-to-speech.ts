import { BaseNode, prop } from "@nodetool/node-sdk";
import type { NodeClass } from "@nodetool/node-sdk";
import {
  DEVICE_VALUES,
  DTYPE_VALUES,
  asString,
  extractRepoId,
  getPipeline,
  tjsModelDefault,
  normalizeOption
} from "../transformers-base.js";
import { defaultRepoFor } from "../recommended-models.js";
import { encodeWav } from "../wav.js";
import {
  KOKORO_VOICES,
  getKokoro,
  isKokoroRepo,
  isSpeechT5Repo
} from "../tts-shared.js";

const TJS_TYPE = "tjs.text_to_speech";

type TtsResult = {
  audio?: Float32Array | ArrayLike<number>;
  sampling_rate?: number;
};

export class TextToSpeechNode extends BaseNode {
  static readonly nodeType = "transformers.TextToSpeech";
  static readonly title = "Text to Speech";
  static readonly description =
    "Synthesize speech from text using a Transformers.js text-to-speech pipeline.\n" +
    "audio, tts, speech, transformers, huggingface\n\n" +
    "Use cases:\n" +
    "- Add voice output to local agents\n" +
    "- Generate narration without an external API\n" +
    "- Build accessible interfaces";
  static readonly metadataOutputTypes = { output: "audio" };
  static readonly autoSaveAsset = true;

  @prop({
    type: "str",
    default: "Hello, this is a test of text to speech.",
    title: "Text",
    description: "Text to synthesize."
  })
  declare text: any;

  @prop({
    type: TJS_TYPE,
    default: tjsModelDefault(TJS_TYPE, defaultRepoFor(TJS_TYPE)),
    title: "Model",
    description: "Transformers.js model (ONNX-compatible)."
  })
  declare model: any;

  @prop({
    type: "str",
    default:
      "https://huggingface.co/datasets/Xenova/transformers.js-docs/resolve/main/speaker_embeddings.bin",
    title: "Speaker Embedding URL",
    description:
      "Optional speaker embedding URL (required by SpeechT5; ignored by other models)."
  })
  declare speaker_embeddings: any;

  @prop({
    type: "enum",
    default: "af_heart",
    title: "Voice",
    description:
      "Voice ID for Kokoro models (English only in kokoro-js v1.2.x). af_*=American female, am_*=American male, bf_*=British female, bm_*=British male. Ignored by other TTS models.",
    values: [...KOKORO_VOICES]
  })
  declare voice: any;

  @prop({
    type: "enum",
    default: "auto",
    title: "Quantization",
    description: "Model dtype / quantization level.",
    values: DTYPE_VALUES
  })
  declare dtype: any;

  @prop({
    type: "enum",
    default: "auto",
    title: "Device",
    description: "Inference device.",
    values: DEVICE_VALUES
  })
  declare device: any;

  async process(): Promise<Record<string, unknown>> {
    const text = asString(this.text);
    if (!text) throw new Error("Text is required");

    const repoId = extractRepoId(this.model) || undefined;
    const dtype = normalizeOption(this.dtype);
    const device = normalizeOption(this.device);

    let samples: Float32Array | ArrayLike<number> | undefined;
    let samplingRate = 16000;

    if (isKokoroRepo(repoId)) {
      const tts = await getKokoro(repoId!, dtype, device);
      const voice = asString(this.voice) || "af_heart";
      const result = await tts.generate(text, { voice: voice as never });
      samples = result.audio as Float32Array;
      samplingRate = result.sampling_rate ?? samplingRate;
    } else {
      const pipeline = (await getPipeline({
        task: "text-to-speech",
        model: repoId,
        dtype,
        device
      })) as (
        input: string,
        opts?: Record<string, unknown>
      ) => Promise<TtsResult>;

      const opts: Record<string, unknown> = {};
      if (isSpeechT5Repo(repoId)) {
        const speakerEmbeddings = asString(this.speaker_embeddings);
        if (speakerEmbeddings) opts.speaker_embeddings = speakerEmbeddings;
      }

      const result = await pipeline(text, opts);
      samples = result?.audio;
      samplingRate = result?.sampling_rate ?? samplingRate;
    }

    if (!samples) {
      throw new Error("Text-to-speech pipeline returned no audio data");
    }
    const wav = encodeWav(samples, samplingRate);

    return {
      output: {
        type: "audio",
        data: wav.toString("base64"),
        content_type: "audio/wav"
      }
    };
  }
}

export const TEXT_TO_SPEECH_NODES: readonly NodeClass[] = [TextToSpeechNode];
