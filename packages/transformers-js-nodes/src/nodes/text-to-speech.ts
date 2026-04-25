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

const TJS_TYPE = "tjs.text_to_speech";

type TtsResult = {
  audio?: Float32Array | ArrayLike<number>;
  sampling_rate?: number;
};

/**
 * Encode mono Float32 audio (range -1..1) as a 16-bit PCM WAV buffer.
 *
 * Mirrors `encodeWav` in `@nodetool/base-nodes` (`src/lib/audio-wav.ts`)
 * bit-for-bit so output stays consistent with the rest of the audio stack.
 * Inlined here so this package does not have to take a runtime dependency
 * on the much larger base-nodes pack just for a 25-line WAV writer; if the
 * canonical encoder ever changes, update both.
 */
function encodeWav(
  samples: ArrayLike<number>,
  sampleRate: number,
  numChannels = 1
): Buffer {
  const bitsPerSample = 16;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    buffer.writeInt16LE(Math.round(s * 0x7fff), 44 + i * 2);
  }
  return buffer;
}

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

    const pipeline = (await getPipeline({
      task: "text-to-speech",
      model: extractRepoId(this.model) || undefined,
      dtype: normalizeOption(this.dtype),
      device: normalizeOption(this.device)
    })) as (
      input: string,
      opts?: Record<string, unknown>
    ) => Promise<TtsResult>;

    const opts: Record<string, unknown> = {};
    const speakerEmbeddings = asString(this.speaker_embeddings);
    if (speakerEmbeddings) opts.speaker_embeddings = speakerEmbeddings;

    const result = await pipeline(text, opts);
    const samples = result?.audio;
    if (!samples) {
      throw new Error("Text-to-speech pipeline returned no audio data");
    }
    const samplingRate = result.sampling_rate ?? 16000;
    const wav = encodeWav(samples, samplingRate);
    const base64 = wav.toString("base64");

    return {
      output: {
        type: "audio",
        data: `data:audio/wav;base64,${base64}`,
        mimeType: "audio/wav"
      }
    };
  }
}

export const TEXT_TO_SPEECH_NODES: readonly NodeClass[] = [TextToSpeechNode];
